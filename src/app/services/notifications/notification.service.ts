import { HttpClient } from '@angular/common/http';
import { Injectable, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { Observable, firstValueFrom } from 'rxjs';
import { TranslateService } from '@ngx-translate/core';
import { getMessaging, getToken, isSupported, onMessage } from 'firebase/messaging';
import { ToastController } from '@ionic/angular/standalone';
import { Capacitor } from '@capacitor/core';
import {
  ActionPerformed as PushActionPerformed,
  PushNotifications,
  PushNotificationSchema,
  Token,
} from '@capacitor/push-notifications';
import {
  ActionPerformed as LocalActionPerformed,
  LocalNotifications,
} from '@capacitor/local-notifications';
import { environment } from '../../../environments/environment';
import { firebaseApp } from '../core/firebase';
import { AppNotification } from '../../models';
import { ALL_NOTIFICATION_TYPES, NOTIFICATION_TYPE_LABEL_KEYS } from '../../shared/notifications/notification-types';

/** Android channel ids this app has retired - kept only so
 * ensureNotificationChannels() can clean them off the user's device via
 * deleteChannel(). A channel an app stops creating does NOT disappear from
 * Android's own Settings > Notifications on its own; add a type's old id
 * here for one release after removing it from ALL_NOTIFICATION_TYPES, then
 * it can be dropped once deleteChannel has had time to run. */
const RETIRED_NOTIFICATION_CHANNEL_IDS: string[] = [];

/** Wraps both halves of the feature: the in-app inbox (plain HTTP against
 * the backend) and the device-level push plumbing (permission, token,
 * showing/handling the actual OS notification) needed to actually receive a
 * push. The push half is best-effort everywhere - a browser without
 * notification support, or a user who denies the permission prompt, still
 * gets the in-app inbox. */
@Injectable({ providedIn: 'root' })
export class NotificationService {
  private readonly http = inject(HttpClient);
  private readonly toastController = inject(ToastController);
  private readonly router = inject(Router);
  private readonly translate = inject(TranslateService);
  private readonly baseUrl = `${environment.apiUrl}/api/notifications`;
  private readonly usersBaseUrl = `${environment.apiUrl}/api/users`;

  /** Shared across every `app-notification-bell` instance (one per tab
   * header, each kept alive by Ionic's tab stacks) so marking notifications
   * read/unread from one tab is reflected on the others immediately, instead
   * of each bell only finding out on its own next 30s poll. */
  readonly unreadCount = signal(0);

  list(userId: string): Observable<AppNotification[]> {
    return this.http.get<AppNotification[]>(`${this.baseUrl}/user/${userId}`);
  }

  refreshUnreadCount(userId: string): void {
    this.http.get<{ count: number }>(`${this.baseUrl}/user/${userId}/unread-count`).subscribe({
      next: ({ count }) => this.unreadCount.set(count),
      error: () => this.unreadCount.set(0),
    });
  }

  markRead(id: string): Observable<{ success: boolean }> {
    return this.http.put<{ success: boolean }>(`${this.baseUrl}/${id}/read`, {});
  }

  markUnread(id: string): Observable<{ success: boolean }> {
    return this.http.put<{ success: boolean }>(`${this.baseUrl}/${id}/unread`, {});
  }

  markAllRead(userId: string): Observable<{ success: boolean }> {
    return this.http.put<{ success: boolean }>(`${this.baseUrl}/user/${userId}/read-all`, {});
  }

  /** Called once per login (see app.component.ts) - silently does nothing if
   * push isn't supported on this platform/browser or the user denies the
   * permission prompt. Native (Android/iOS) and web go through entirely
   * different SDKs - a WebView doesn't reliably keep a web push service
   * worker alive the way a real browser tab does, so the native app gets
   * real OS-level push via the native Firebase Cloud Messaging SDK instead. */
  async requestPermissionAndRegister(userId: string): Promise<void> {
    if (Capacitor.isNativePlatform()) {
      await this.registerNativePush(userId);
      return;
    }
    await this.registerWebPush(userId);
  }

  /** One Android channel per NotificationType, named with the same labels
   * Settings' own per-type toggles use, so the OS's Settings > Notifications
   * > Categories list lets the user mute e.g. just "Nuevos seguidores"
   * instead of only an all-or-nothing app toggle. Independent of the
   * permission check below - channels should exist (and be visible in
   * Settings) whether or not the user has granted push permission, and
   * re-running this on every login is cheap: Android only lets an app
   * change a channel's name/description after creation, never its
   * user-facing sound/importance, so this can never clobber a user's own
   * per-channel customization. No-ops on iOS/web (createChannel/
   * deleteChannel are Android-only; Capacitor resolves without doing
   * anything on other platforms). */
  private async ensureNotificationChannels(): Promise<void> {
    if (!Capacitor.isNativePlatform()) {
      return;
    }
    try {
      const labelKeys = ALL_NOTIFICATION_TYPES.map((type) => NOTIFICATION_TYPE_LABEL_KEYS[type]);
      const labels = await firstValueFrom(this.translate.get(labelKeys));
      await Promise.all([
        ...ALL_NOTIFICATION_TYPES.map((type) =>
          PushNotifications.createChannel({
            id: type,
            name: labels[NOTIFICATION_TYPE_LABEL_KEYS[type]],
          }),
        ),
        ...RETIRED_NOTIFICATION_CHANNEL_IDS.map((id) => PushNotifications.deleteChannel({ id })),
      ]);
    } catch (err) {
      console.error('[NotificationService] ensureNotificationChannels failed:', err);
    }
  }

  private async registerNativePush(userId: string): Promise<void> {
    try {
      await this.ensureNotificationChannels();

      const current = await PushNotifications.checkPermissions();
      let receive = current.receive;
      if (receive === 'prompt' || receive === 'prompt-with-rationale') {
        receive = (await PushNotifications.requestPermissions()).receive;
      }
      if (receive !== 'granted') {
        return;
      }

      // Listeners must be registered before register() - otherwise the
      // 'registration' event (which carries the token we need to send to
      // the backend) can fire before anything is listening for it.
      PushNotifications.addListener('registration', (token: Token) => {
        this.http.post(`${this.usersBaseUrl}/${userId}/fcm-token`, { token: token.value }).subscribe();
      });
      PushNotifications.addListener('registrationError', (err) => {
        console.error('[NotificationService] native push registration failed:', err);
      });
      // Android never auto-shows a system notification while the app is
      // open in the foreground - only when it's backgrounded/killed. This
      // covers the foreground case ourselves via LocalNotifications, same
      // as apps like WhatsApp do.
      PushNotifications.addListener('pushNotificationReceived', (notification: PushNotificationSchema) => {
        void this.showForegroundSystemNotification(notification);
      });
      // Tap on whichever notification Android displayed automatically
      // (app was backgrounded/killed) - navigate to what it's about.
      PushNotifications.addListener('pushNotificationActionPerformed', (action: PushActionPerformed) => {
        this.navigateFromNotificationData(action.notification.data);
      });
      // Tap on the one *we* displayed via LocalNotifications (foreground case).
      LocalNotifications.addListener('localNotificationActionPerformed', (action: LocalActionPerformed) => {
        this.navigateFromNotificationData(action.notification.extra);
      });

      await LocalNotifications.requestPermissions();
      await PushNotifications.register();
    } catch (err) {
      console.error('[NotificationService] native push setup failed:', err);
    }
  }

  private async showForegroundSystemNotification(notification: PushNotificationSchema): Promise<void> {
    try {
      // notification.data.type is always set - the backend's sendPush always
      // includes it (see NotificationService.sendPush, dancemeet-back) - and
      // matches one of the channel ids ensureNotificationChannels created.
      const channelId = notification.data?.['type'];
      await LocalNotifications.schedule({
        notifications: [
          {
            id: Math.floor(Math.random() * 2_147_483_647),
            title: notification.title ?? 'DanceMeet',
            body: notification.body ?? '',
            extra: notification.data,
            ...(typeof channelId === 'string' ? { channelId } : {}),
          },
        ],
      });
    } catch (err) {
      console.error('[NotificationService] showing foreground notification failed:', err);
    }
  }

  /** Same routing a tap inside the in-app inbox already uses (see
   * notifications.page.ts's eventCardFor/followUserFor) - an event if the
   * notification is about one, otherwise the follower's profile, otherwise
   * just the inbox itself. */
  private navigateFromNotificationData(data: Record<string, unknown> | undefined): void {
    const eventId = data?.['eventId'];
    const fromUserId = data?.['fromUserId'];
    if (typeof eventId === 'string' && eventId) {
      // A xat message notification lands the reader straight on the xat tab
      // instead of Información - see event-detail.page.ts's own reading of
      // this query param (openChatTab()).
      const queryParams = data?.['type'] === 'event_chat_message' ? { openChat: '1' } : undefined;
      this.router.navigate(['/events', eventId], { queryParams });
    } else if (typeof fromUserId === 'string' && fromUserId) {
      this.router.navigateByUrl(`/users/${fromUserId}`);
    } else {
      this.router.navigateByUrl('/notifications');
    }
  }

  /** Silently does nothing if the browser doesn't support notifications/
   * service workers, the user denies the permission prompt, or the Firebase
   * Web config is still the placeholder value (nothing to register
   * against yet). */
  private async registerWebPush(userId: string): Promise<void> {
    try {
      if (!(await isSupported()) || typeof Notification === 'undefined') {
        return;
      }
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') {
        return;
      }
      const registration = await navigator.serviceWorker.register('/firebase-messaging-sw.js');
      const messaging = getMessaging(firebaseApp);
      const token = await getToken(messaging, {
        vapidKey: environment.firebaseVapidKey,
        serviceWorkerRegistration: registration,
      });
      if (token) {
        await this.http.post(`${this.usersBaseUrl}/${userId}/fcm-token`, { token }).toPromise();
      }
      onMessage(messaging, (payload) => {
        const title = payload.notification?.title;
        if (title) {
          this.showForegroundToast(title, payload.notification?.body);
        }
      });
    } catch (err) {
      // Most commonly: Firebase Web push isn't configured yet (placeholder
      // appId/VAPID key). The in-app inbox works regardless.
      console.error('[NotificationService] requestPermissionAndRegister failed:', err);
    }
  }

  private async showForegroundToast(title: string, body?: string): Promise<void> {
    const toast = await this.toastController.create({
      header: title,
      message: body,
      duration: 4000,
      position: 'top',
    });
    await toast.present();
  }
}
