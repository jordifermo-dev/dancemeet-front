import { Injectable, inject, signal } from '@angular/core';
import { AuthService } from './auth.service';

const STORAGE_PREFIX = 'dancemeet_welcome_seen_';

/** Drives the "how the app works" welcome modal - shown on every login/
 * registration (tracked in localStorage, same pattern as LanguageService's
 * saved choice) until the user explicitly checks "don't show again", and
 * reopenable any time from Profile regardless of that flag. */
@Injectable({ providedIn: 'root' })
export class OnboardingService {
  private readonly authService = inject(AuthService);

  readonly isWelcomeModalOpen = signal(false);

  /** Called right after an interactive login/registration succeeds (not on
   * a silently-restored session) - opens the modal unless this user
   * previously checked "don't show again". */
  maybeShowWelcome(): void {
    const userId = this.authService.currentUser()?.id;
    if (userId && !localStorage.getItem(STORAGE_PREFIX + userId)) {
      this.isWelcomeModalOpen.set(true);
    }
  }

  openWelcome(): void {
    this.isWelcomeModalOpen.set(true);
  }

  /** @param dontShowAgain Persists so maybeShowWelcome() won't reopen it on
   * a future login - unchecked, it'll show again next time. */
  closeWelcome(dontShowAgain: boolean): void {
    const userId = this.authService.currentUser()?.id;
    if (dontShowAgain && userId) {
      localStorage.setItem(STORAGE_PREFIX + userId, '1');
    }
    this.isWelcomeModalOpen.set(false);
  }
}
