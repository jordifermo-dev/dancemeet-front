import { EventStatus } from './event-status.model';
import { SocialLinks } from './user.model';

export interface Event {
  id: string;
  title: string;
  description: string;
  additionalInfo?: string;
  socialLinks?: SocialLinks;
  imageUrl: string;
  // An event can be more than one type (e.g. workshop then jam) and more
  // than one dance style (e.g. Swing and Rock&Roll) - at least one of each
  // is enforced where these are edited (event-detail.page.ts's editValid).
  typeIds: string[];
  disciplineIds: string[];
  eventDateFrom: number;
  eventDateTo: number;
  status: EventStatus;
  isFree: boolean;
  price: number;
  creatorId: string;
  address: string;
  city: string;
  latitude: number;
  longitude: number;
  createdAt: number;
  updatedAt?: number;
}

export type EventRelation = 'creator' | 'favorite' | 'both';

export type PriceOption = 'free' | 'paid';

/** An event hydrated with just its creator's name - the common shape shared
 * by every list that renders <app-event-card> without a lookup per event. */
export interface EventWithCreatorName extends Event {
  creatorName: string;
}

/** An event returned by the Favorites list - additionally tagged with how
 * the current user relates to it (organizes it, favorited it, or both). */
export interface FavoritedEvent extends EventWithCreatorName {
  relation: EventRelation;
}

/** One row of an event's attendee list - same shape as FollowUser (one row
 * of a followers/following list), just "since" the user marked themselves
 * attending this event instead of since they followed someone. */
export interface Attendee {
  id: string;
  name: string;
  photoUrl?: string;
  disciplineIds: string[];
  attendedAt: number;
}

export interface EventSearchParams {
  disciplineIds?: string[];
  typeIds?: string[];
  statuses?: EventStatus[];
  dateFrom?: number;
  dateTo?: number;
  latitude?: number;
  longitude?: number;
  radius?: number;
  search?: string;
  priceOptions?: PriceOption[];
}

/** Partial update sent to PUT /api/events/:id - any subset of editable event fields. */
export type UpdateEventPayload = Partial<Omit<Event, 'id' | 'creatorId' | 'createdAt' | 'updatedAt'>>;

/** Payload sent to POST /api/events - every field CreateEventDto requires. */
export type CreateEventPayload = Omit<Event, 'id' | 'createdAt' | 'updatedAt'>;
