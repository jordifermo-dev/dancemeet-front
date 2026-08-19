import { Injectable, signal } from '@angular/core';
import { EventSortMode } from '../../shared/event/event-sort';

export type FollowSortMode = 'nameAsc' | 'nameDesc' | 'dateNewest' | 'dateOldest';
export type NotificationSortMode = 'titleAsc' | 'titleDesc' | 'dateNewest' | 'dateOldest';

/** Remembers the last "Ordenar" choice per shared sort modal, across every
 * screen that reuses the same options - picking "Nombre: Z-A" on Followers
 * stays picked if you then open Following or Attendees (same modal/page,
 * just a different mode), and likewise between Events and Favorites. Also
 * covers Notifications: even though only one page/modal exists there, it's
 * opened from 4 different tab headers and Angular creates a fresh component
 * instance on every navigation to it, so a local signal wouldn't survive
 * leaving and re-entering either. Purely in-memory for the session - a UI
 * convenience, not a saved preference, so no backend field is involved. */
@Injectable({ providedIn: 'root' })
export class SortPreferenceService {
  readonly followSortMode = signal<FollowSortMode>('dateNewest');
  readonly eventSortMode = signal<EventSortMode>('dateSoonest');
  readonly notificationSortMode = signal<NotificationSortMode>('dateNewest');
}
