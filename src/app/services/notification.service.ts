import { HttpClient } from '@angular/common/http';
import { Injectable, inject, signal } from '@angular/core';
import { Observable } from 'rxjs';
import { getMessaging, getToken, isSupported, onMessage } from 'firebase/messaging';
import { ToastController } from '@ionic/angular/standalone';
import { environment } from '../../environments/environment';
import { firebaseApp } from './firebase';
import { AppNotification } from '../models';

/** Wraps both halves of the feature: the in-app inbox (plain HTTP against
 * the backend) and the browser-side FCM plumbing (permission, service
 * worker, device token) needed to actually receive a push. The FCM half is
 * best-effort everywhere - a browser without notification support, or a
 * user who denies the permission prompt, still gets the in-app inbox. */
@Injectable({ providedIn: 'root' })
export class NotificationService {
  private readonly http = inject(HttpClient);
  private readonly toastController = inject(ToastController);
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
   * the browser doesn't support notifications/service workers, the user
   * denies the permission prompt, or the Firebase Web config is still the
   * placeholder value (nothing to register against yet). */
  async requestPermissionAndRegister(userId: string): Promise<void> {
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
