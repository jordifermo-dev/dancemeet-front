import { EventManager } from '../../models';

/** Shared "can this user manage this event" rule - the creator always can,
 * an accepted 'manager'-role participant can too (an accepted 'attendee'-role
 * one cannot - see EventManager.role), nobody else can. Used by event-detail
 * (to gate edit/delete/reuse) and follow-list.page's 'attendees' mode (to
 * gate the search/invite/remove controls), so the rule only lives once. */
export function canManageEvent(
  event: { creatorId: string } | null | undefined,
  participants: EventManager[],
  userId: string | null | undefined,
): boolean {
  if (!event || !userId) {
    return false;
  }
  if (event.creatorId === userId) {
    return true;
  }
  return participants.some(
    (participant) => participant.userId === userId && participant.role === 'manager' && participant.status === 'accepted',
  );
}

/** Stricter than canManageEvent - only the original creator, not a co-
 * organizer. Used exclusively to gate deleting an event (see
 * event-detail.page.ts's isEventCreator/confirmDeleteEvent); editing,
 * reusing, and every other canManageEvent-gated action stay open to
 * accepted managers too. */
export function isEventCreator(event: { creatorId: string } | null | undefined, userId: string | null | undefined): boolean {
  return !!event && !!userId && event.creatorId === userId;
}

/** The current user's own row in the list, if any - drives the "you've been
 * invited" accept/decline banner on event-detail. */
export function findMyParticipantRow(participants: EventManager[], userId: string | null | undefined): EventManager | null {
  if (!userId) {
    return null;
  }
  return participants.find((participant) => participant.userId === userId) ?? null;
}
