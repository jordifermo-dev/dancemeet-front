import { HttpClient } from '@angular/common/http';
import { Injectable, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { Observable } from 'rxjs';
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
import { environment } from '../../environments/environment';
import { firebaseApp } from './firebase';
import { AppNotification } from '../models';

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

  private async registerNativePush(userId: string): Promise<void> {
    try {
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
      await LocalNotifications.schedule({
        notifications: [
          {
            id: Math.floor(Math.random() * 2_147_483_647),
            title: notification.title ?? 'DanceMeet',
            body: notification.body ?? '',
            extra: notification.data,
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
      this.router.navigateByUrl(`/events/${eventId}`);
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
