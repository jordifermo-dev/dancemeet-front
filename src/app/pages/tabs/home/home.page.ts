import { Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { IonHeader, IonToolbar, IonTitle, IonButtons, IonButton, IonIcon, IonContent } from '@ionic/angular/standalone';
import { TranslatePipe } from '@ngx-translate/core';
import { addIcons } from 'ionicons';
import { settingsOutline } from 'ionicons/icons';
import { AuthService } from '../../../services/core/auth.service';
import { NotificationBellComponent } from '../../../shared/notifications/notification-bell/notification-bell.component';

export interface HomeMenuItem {
  routerLink: string;
  iconUrl: string;
  titleKey: string;
  descriptionKey: string;
}

/** One button per other tab, in the same left-to-right order they appear in
 * the tab bar - reuses each tab's own icon file and i18n title key rather
 * than duplicating either. Exported so the welcome tour's Home slide mockup
 * (see welcome-modal.component.ts) renders the exact same buttons instead of
 * a hand-copied list that could drift out of sync. */
export const HOME_MENU_ITEMS: HomeMenuItem[] = [
  {
    routerLink: '/tabs/explorer',
    iconUrl: 'assets/icons/tabs/explorer.svg',
    titleKey: 'tabs.explorer',
    descriptionKey: 'home.exploreDesc',
  },
  {
    routerLink: '/tabs/events',
    iconUrl: 'assets/icons/tabs/events.svg',
    titleKey: 'tabs.events',
    descriptionKey: 'home.eventsDesc',
  },
  {
    routerLink: '/tabs/favorites',
    iconUrl: 'assets/icons/tabs/favorites.svg',
    titleKey: 'tabs.favorites',
    descriptionKey: 'home.favoritesDesc',
  },
  {
    routerLink: '/tabs/profile',
    iconUrl: 'assets/icons/tabs/profile.svg',
    titleKey: 'tabs.profile',
    descriptionKey: 'home.profileDesc',
  },
];

/** Landing tab (first in the tab bar, default route) - a welcome panel with
 * one button per other tab (icon + title + short description) so there's a
 * single obvious "what do I do here" screen instead of landing straight on
 * Explorer with no orientation. Purely a navigation hub: no state of its
 * own beyond the logged-in user's first name for the greeting. */
@Component({
  selector: 'app-home',
  standalone: true,
  templateUrl: 'home.page.html',
  styleUrls: ['home.page.scss'],
  imports: [
    IonHeader,
    IonToolbar,
    IonTitle,
    IonButtons,
    IonButton,
    IonIcon,
    IonContent,
    TranslatePipe,
    RouterLink,
    NotificationBellComponent,
  ],
})
export class HomePage {
  private readonly authService = inject(AuthService);

  readonly menuItems = HOME_MENU_ITEMS;
  readonly firstName = computed(() => this.authService.currentUser()?.name?.split(' ')[0] ?? '');

  constructor() {
    addIcons({ settingsOutline });
  }
}
