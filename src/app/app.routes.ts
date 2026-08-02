import { Routes } from '@angular/router';
import { authGuard, publicGuard } from './guards/auth.guard';

export const routes: Routes = [
  {
    path: '',
    redirectTo: '/tabs/explorer',
    pathMatch: 'full',
  },
  {
    path: 'login',
    loadComponent: () => import('./pages/login/login.page').then((m) => m.LoginPage),
    canActivate: [publicGuard],
  },
  {
    path: 'register',
    loadComponent: () => import('./pages/register/register.page').then((m) => m.RegisterPage),
    canActivate: [publicGuard],
  },
  {
    path: 'followers',
    loadComponent: () => import('./pages/follow-list/follow-list.page').then((m) => m.FollowListPage),
    canActivate: [authGuard],
    data: { mode: 'followers' },
  },
  {
    path: 'following',
    loadComponent: () => import('./pages/follow-list/follow-list.page').then((m) => m.FollowListPage),
    canActivate: [authGuard],
    data: { mode: 'following' },
  },
  {
    path: 'attendees',
    loadComponent: () => import('./pages/follow-list/follow-list.page').then((m) => m.FollowListPage),
    canActivate: [authGuard],
    data: { mode: 'attendees' },
  },
  {
    path: 'users/:id',
    loadComponent: () => import('./pages/user-detail/user-detail.page').then((m) => m.UserDetailPage),
    canActivate: [authGuard],
  },
  {
    path: 'explorer-filters',
    loadComponent: () =>
      import('./pages/explorer-filters/explorer-filters.page').then((m) => m.ExplorerFiltersPage),
    canActivate: [authGuard],
  },
  {
    path: 'user-events',
    loadComponent: () => import('./pages/user-events/user-events.page').then((m) => m.UserEventsPage),
    canActivate: [authGuard],
  },
  {
    path: 'notifications',
    loadComponent: () => import('./pages/notifications/notifications.page').then((m) => m.NotificationsPage),
    canActivate: [authGuard],
  },
  {
    path: 'settings',
    loadComponent: () => import('./pages/settings/settings.page').then((m) => m.SettingsPage),
    canActivate: [authGuard],
  },
  {
    path: 'privacy-policy',
    loadComponent: () => import('./pages/privacy-policy/privacy-policy.page').then((m) => m.PrivacyPolicyPage),
    canActivate: [authGuard],
  },
  {
    path: 'terms-of-use',
    loadComponent: () => import('./pages/terms-of-use/terms-of-use.page').then((m) => m.TermsOfUsePage),
    canActivate: [authGuard],
  },
  {
    path: 'events/new',
    loadComponent: () => import('./pages/event-detail/event-detail.page').then((m) => m.EventDetailPage),
    canActivate: [authGuard],
  },
  {
    path: 'events/:id',
    loadComponent: () => import('./pages/event-detail/event-detail.page').then((m) => m.EventDetailPage),
    canActivate: [authGuard],
  },
  {
    path: '',
    loadChildren: () => import('./pages/tabs/tabs.routes').then((m) => m.routes),
    canActivate: [authGuard],
  },
];
