import { Component, effect, inject } from '@angular/core';
import { IonApp, IonRouterOutlet } from '@ionic/angular/standalone';
import { Capacitor } from '@capacitor/core';
import { StatusBar, Style } from '@capacitor/status-bar';
import { Keyboard } from '@capacitor/keyboard';
import { AuthService } from './services/core/auth.service';
import { NotificationService } from './services/notifications/notification.service';
import { ThemeService } from './services/core/theme.service';
import { WelcomeModalComponent } from './shared/common/welcome-modal/welcome-modal.component';

@Component({
  selector: 'app-root',
  standalone: true,
  templateUrl: 'app.component.html',
  imports: [IonApp, IonRouterOutlet, WelcomeModalComponent],
})
export class AppComponent {
  private readonly authService = inject(AuthService);
  private readonly notificationService = inject(NotificationService);
  private readonly themeService = inject(ThemeService);
  private registeredForUserId: string | null = null;
  private statusBarReady = false;

  constructor() {
    // Android (targeting a recent SDK) draws the WebView edge-to-edge behind
    // the system status bar by default - without this, every ion-header sits
    // underneath the battery/wifi/clock icons instead of below them. Ionic's
    // own safe-area padding (--ion-safe-area-top) only kicks in once the
    // status bar is told it's not overlaying the WebView.
    if (Capacitor.isNativePlatform()) {
      void this.initStatusBar();

      // Some Android WebViews (seen on older/lower-end devices) don't
      // repaint ion-content's scroll area after the on-screen keyboard
      // closes - the page stays visually blank (DOM's still there, it just
      // never re-renders at the new viewport height) until something else
      // forces a layout pass. A plain 'resize' event alone wasn't enough on
      // the device this was reproduced on (confirmed via logcat: the
      // listener fires, the page still stayed blank) - forcing a real
      // reflow by toggling document.body's height is the more reliable
      // trick for this class of bug. There's no other listener for this
      // event anywhere in the app, so it was silently firing into the void
      // before this was added.
      void Keyboard.addListener('keyboardDidHide', () => {
        window.dispatchEvent(new Event('resize'));
        document.body.style.height = '100.01%';
        requestAnimationFrame(() => {
          document.body.style.height = '';
        });
      });

      // Re-applies whenever Light/Dark/System (or the OS preference behind
      // "System") changes, so the native status bar never gets stuck on the
      // light colors it was first opened with. Guarded by statusBarReady -
      // initStatusBar's own first setOverlaysWebView/setBackgroundColor/
      // setStyle sequence already covers the initial paint.
      effect(() => {
        const isDark = this.themeService.isDark();
        if (this.statusBarReady) {
          void this.applyStatusBarStyle(isDark);
        }
      });
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
    await this.applyStatusBarStyle(this.themeService.isDark());
    this.statusBarReady = true;
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

  /** Matches --app-surface-card (theme/variables.scss) rather than
   * --ion-background-color, since the status bar sits flush above each
   * page's translucent ion-header, which reads as card-colored, not
   * page-colored. Style.Dark/Light name the theme the bar sits on top of -
   * Dark gives light icons for our dark background, Light gives dark icons
   * for the white one. */
  private async applyStatusBarStyle(isDark: boolean): Promise<void> {
    await StatusBar.setBackgroundColor({ color: isDark ? '#1c1c1e' : '#ffffff' });
    await StatusBar.setStyle({ style: isDark ? Style.Dark : Style.Light });
  }
}
