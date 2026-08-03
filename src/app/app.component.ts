import { Component, effect, inject } from '@angular/core';
import { IonApp, IonRouterOutlet } from '@ionic/angular/standalone';
import { Capacitor } from '@capacitor/core';
import { StatusBar, Style } from '@capacitor/status-bar';
import { AuthService } from './services/auth.service';
import { NotificationService } from './services/notification.service';
import { WelcomeModalComponent } from './shared/welcome-modal/welcome-modal.component';

@Component({
  selector: 'app-root',
  standalone: true,
  templateUrl: 'app.component.html',
  imports: [IonApp, IonRouterOutlet, WelcomeModalComponent],
})
export class AppComponent {
  private readonly authService = inject(AuthService);
  private readonly notificationService = inject(NotificationService);
  private registeredForUserId: string | null = null;

  constructor() {
    // Android (targeting a recent SDK) draws the WebView edge-to-edge behind
    // the system status bar by default - without this, every ion-header sits
    // underneath the battery/wifi/clock icons instead of below them. Ionic's
    // own safe-area padding (--ion-safe-area-top) only kicks in once the
    // status bar is told it's not overlaying the WebView.
    if (Capacitor.isNativePlatform()) {
      void this.initStatusBar();
    }

    // Once per login/user switch, not on every currentUser() reference
    // change (e.g. a profile edit would otherwise re-trigger the browser's
    // permission flow) - same guarded pattern ExplorerFiltersService uses
    // for seeding filters from the profile.
    effect(() => {
      const user = this.authService.currentUser();
      if (user && user.id !== this.registeredForUserId) {
        this.registeredForUserId = user.id;
        void this.notificationService.requestPermissionAndRegister(user.id);
      } else if (!user) {
        this.registeredForUserId = null;
      }
    });
  }

  /** Sequenced (not fire-and-forget in parallel) - the three StatusBar calls
   * raced each other before, so which one "won" (and therefore the final
   * on-screen state) wasn't guaranteed. */
  private async initStatusBar(): Promise<void> {
    await StatusBar.setOverlaysWebView({ overlay: false });
    await StatusBar.setBackgroundColor({ color: '#ffffff' });
    await StatusBar.setStyle({ style: Style.Light });
    // max(), not a flat number - devices that correctly report a real
    // env(safe-area-inset-top) (taller status bars, notches, punch-holes...)
    // keep using their own real value; this only kicks in as a 24px floor on
    // devices where that reports 0 despite the status bar still reserving
    // real space (e.g. older Android with no display cutout to report).
    document.documentElement.style.setProperty(
      '--ion-safe-area-top',
      'max(env(safe-area-inset-top), 24px)',
    );
  }
}
