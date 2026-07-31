import { Routes } from '@angular/router';
import { TabsPage } from './tabs.page';
import { unsavedChangesGuard } from '../../guards/unsaved-changes.guard';

export const routes: Routes = [
  {
    path: 'tabs',
    component: TabsPage,
    children: [
      {
        path: 'explorer',
        loadComponent: () => import('../explorer/explorer.page').then((m) => m.ExplorerPage),
      },
      {
        path: 'events',
        loadComponent: () => import('../events/events.page').then((m) => m.EventsPage),
      },
      {
        path: 'favorites',
        loadComponent: () => import('../favorites/favorites.page').then((m) => m.FavoritesPage),
      },
      {
        path: 'profile',
        loadComponent: () => import('../profile/profile.page').then((m) => m.ProfilePage),
        canDeactivate: [unsavedChangesGuard],
      },
      {
        path: '',
        redirectTo: '/tabs/explorer',
        pathMatch: 'full',
      },
    ],
  },
  {
    path: '',
    redirectTo: '/tabs/explorer',
    pathMatch: 'full',
  },
];
