import { Component, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import {
  IonHeader,
  IonToolbar,
  IonTitle,
  IonButtons,
  IonBackButton,
  IonContent,
  IonIcon,
  IonToggle,
  IonButton,
} from '@ionic/angular/standalone';
import { TranslatePipe } from '@ngx-translate/core';
import { addIcons } from 'ionicons';
import {
  helpCircleOutline,
  shieldCheckmarkOutline,
  documentTextOutline,
  logOutOutline,
  personAddOutline,
  checkmarkCircleOutline,
  createOutline,
  todayOutline,
  calendarOutline,
  sparklesOutline,
} from 'ionicons/icons';
import { AuthService } from '../../services/auth.service';
import { UserService } from '../../services/user.service';
import { OnboardingService } from '../../services/onboarding.service';
import { NotificationType } from '../../models';
import { ALL_NOTIFICATION_TYPES, NOTIFICATION_TYPE_ICONS, NOTIFICATION_TYPE_LABEL_KEYS } from '../../shared/notification-types';

/** Single settings screen consolidating what used to be spread across three
 * places: the "how the app works" tour replay (was a button on Profile), the
 * per-type notification toggles (was its own /notification-settings page,
 * reached via a gear icon on the Notifications page), and account logout
 * (was at the bottom of Profile). Legal pages and logout live here too, so
 * there's exactly one settings-shaped destination instead of several. */
@Component({
  selector: 'app-settings',
  standalone: true,
  templateUrl: './settings.page.html',
  styleUrl: './settings.page.scss',
  imports: [IonHeader, IonToolbar, IonTitle, IonButtons, IonBackButton, IonContent, IonIcon, IonToggle, IonButton, TranslatePipe],
})
export class SettingsPage {
  private readonly authService = inject(AuthService);
  private readonly userService = inject(UserService);
  private readonly onboarding = inject(OnboardingService);
  private readonly router = inject(Router);

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
      helpCircleOutline,
      shieldCheckmarkOutline,
      documentTextOutline,
      logOutOutline,
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

  openWelcomeGuide(): void {
    this.onboarding.openWelcome();
  }

  goToPrivacyPolicy(): void {
    this.router.navigateByUrl('/privacy-policy');
  }

  goToTermsOfUse(): void {
    this.router.navigateByUrl('/terms-of-use');
  }

  /** No unsaved-changes dance needed here (unlike Profile's own logout) -
   * navigating away from /tabs/profile to reach this screen already ran
   * through unsavedChangesGuard, so any pending profile edits were already
   * resolved before Settings could even be opened. */
  async logout(): Promise<void> {
    await this.authService.logout();
    this.router.navigateByUrl('/login');
  }
}
