import { Component, DestroyRef, inject, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { IonIcon } from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import { notificationsOutline } from 'ionicons/icons';
import { AuthService } from '../../../services/core/auth.service';
import { NotificationService } from '../../../services/notifications/notification.service';

const REFRESH_INTERVAL_MS = 30_000;

/** Bell icon + unread badge, dropped into every tab's header - same idea as
 * app-location-filter-button. Refreshes on a timer rather than real-time
 * (there's no websocket/push-to-client channel in this app), which is
 * enough to notice a new notification within half a minute of it landing. */
@Component({
  selector: 'app-notification-bell',
  standalone: true,
  templateUrl: './notification-bell.component.html',
  styleUrl: './notification-bell.component.scss',
  imports: [IonIcon],
})
export class NotificationBellComponent implements OnInit {
  private readonly router = inject(Router);
  private readonly authService = inject(AuthService);
  private readonly notificationService = inject(NotificationService);
  private readonly destroyRef = inject(DestroyRef);

  /** Shared signal (see NotificationService) - every bell instance renders
   * the same count, so marking notifications read from one tab updates the
   * badge on the others as soon as that action's response lands. */
  readonly unreadCount = this.notificationService.unreadCount;

  constructor() {
    addIcons({ notificationsOutline });
  }

  ngOnInit(): void {
    this.refresh();
    const intervalId = setInterval(() => this.refresh(), REFRESH_INTERVAL_MS);
    this.destroyRef.onDestroy(() => clearInterval(intervalId));
  }

  private refresh(): void {
    const userId = this.authService.currentUser()?.id;
    if (!userId) {
      this.notificationService.unreadCount.set(0);
      return;
    }
    this.notificationService.refreshUnreadCount(userId);
  }

  open(): void {
    this.router.navigate(['/notifications']);
  }
}
