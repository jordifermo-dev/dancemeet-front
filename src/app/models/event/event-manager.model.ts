export type EventManagerStatus = 'pending' | 'accepted';
/** 'attendee': accepting just favorites the event, no extra rights.
 * 'manager': accepting also favorites it AND grants edit/delete/invite-
 * others rights - shown in the UI as "Organizador/Administrador". */
export type EventManagerRole = 'attendee' | 'manager';

/** One row of an event's participant list (the "Asistentes" screen's
 * organizer-only sections) - same hydration idea as Attendee/FollowUser
 * (enough profile info to render a row without a second request per row). */
export interface EventManager {
  id: string;
  eventId: string;
  userId: string;
  userName: string;
  userPhotoUrl?: string;
  userEmail: string;
  /** Same client-side-gated display convention as User.showEmail elsewhere
   * in the app (see user-detail.page.ts) - always present, only shown when true. */
  userShowEmail: boolean;
  userDisciplineIds: string[];
  role: EventManagerRole;
  status: EventManagerStatus;
  createdAt: number;
}
