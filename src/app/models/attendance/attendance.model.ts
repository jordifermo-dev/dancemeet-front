import { EventWithCreatorName } from '../event/event.model';

export type AttendanceRelation = 'creator' | 'attendee';

/** An event returned by the "attended events" list - additionally tagged
 * with how the current user relates to it (organizes it, attends it, or
 * both). Same shape as FavoritedEvent, but relation reflects real
 * attendance instead of a like. */
export interface AttendedEvent extends EventWithCreatorName {
  relation: AttendanceRelation;
}
