import { EventWithCreatorName } from '../event/event.model';

export type AttendanceRelation = 'creator' | 'attendee';

/** An event returned by the "attended events" list - additionally tagged
 * with how the current user relates to it (organizes it, attends it, or
 * both). Same shape as FavoritedEvent, but relation reflects real
 * attendance instead of a like. */
export interface AttendedEvent extends EventWithCreatorName {
  relation: AttendanceRelation;
  /** Timestamp of the most recent message in this event's private xat, or
   * undefined if it has none yet - only populated here (not on
   * FavoritedEvent), used by the Chats tab to order event rows by recency
   * alongside 1:1 conversations. */
  lastChatActivityAt?: number;
}
