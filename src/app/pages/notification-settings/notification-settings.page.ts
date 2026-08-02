import { Component, computed, inject, signal } from '@angular/core';
import {
  IonHeader,
  IonToolbar,
  IonTitle,
  IonButtons,
  IonBackButton,
  IonContent,
  IonIcon,
  IonToggle,
} from '@ionic/angular/standalone';
import { TranslatePipe } from '@ngx-translate/core';
import { addIcons } from 'ionicons';
import {
  personAddOutline,
  checkmarkCircleOutline,
  createOutline,
  todayOutline,
  calendarOutline,
  sparklesOutline,
} from 'ionicons/icons';
import { AuthService } from '../../services/auth.service';
import { UserService } from '../../services/user.service';
import { NotificationType } from '../../models';
import {
  ALL_NOTIFICATION_TYPES,
  NOTIFICATION_TYPE_ICONS,
  NOTIFICATION_TYPE_LABEL_KEYS,
} from '../../shared/notification-types';

@Component({
  selector: 'app-notification-settings',
  standalone: true,
  templateUrl: 'notification-settings.page.html',
  styleUrls: ['notification-settings.page.scss'],
  imports: [IonHeader, IonToolbar, IonTitle, IonButtons, IonBackButton, IonContent, IonIcon, IonToggle, TranslatePipe],
})
export class NotificationSettingsPage {
  private readonly authService = inject(AuthService);
  private readonly userService = inject(UserService);

  readonly allTypes = ALL_NOTIFICATION_TYPES;
  readonly typeIcons = NOTIFICATION_TYPE_ICONS;
  readonly typeLabelKeys = NOTIFICATION_TYPE_LABEL_KEYS;

  readonly disabledTypes = signal<Set<NotificationType>>(
    new Set(this.authService.currentUser()?.disabledNotificationTypes ?? []),
  );

  readonly allEnabled = computed(() => this.disabledTypes().size === 0);
  readonly allDisabled = computed(() => this.disabledTypes().size === this.allTypes.length);

  constructor() {
    addIcons({
      personAddOutline,
      checkmarkCircleOutline,
      createOutline,
      todayOutline,
      calendarOutline,
      sparklesOutline,
    });
  }

  isEnabled(type: NotificationType): boolean {
    return !this.disabledTypes().has(type);
  }

  toggle(type: NotificationType, enabled: boolean): void {
    const next = new Set(this.disabledTypes());
    if (enabled) {
      next.delete(type);
    } else {
      next.add(type);
    }
    this.save(next);
  }

  enableAll(): void {
    this.save(new Set());
  }

  disableAll(): void {
    this.save(new Set(this.allTypes));
  }

  private save(next: Set<NotificationType>): void {
    const user = this.authService.currentUser();
    if (!user) {
      return;
    }
    this.disabledTypes.set(next);
    const disabledNotificationTypes = [...next];
    this.userService.updateUser(user.id, { disabledNotificationTypes }).subscribe({
      next: () => this.authService.syncProfile({ ...user, disabledNotificationTypes }),
    });
  }
}
