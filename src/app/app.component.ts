import { Component, effect, inject } from '@angular/core';
import { IonApp, IonRouterOutlet } from '@ionic/angular/standalone';
import { AuthService } from './services/auth.service';
import { NotificationService } from './services/notification.service';

@Component({
  selector: 'app-root',
  standalone: true,
  templateUrl: 'app.component.html',
  imports: [IonApp, IonRouterOutlet],
})
export class AppComponent {
  private readonly authService = inject(AuthService);
  private readonly notificationService = inject(NotificationService);
  private registeredForUserId: string | null = null;

  constructor() {
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
}
