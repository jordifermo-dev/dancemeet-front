import { EventRelation, EventStatus } from '../../../models';

/** Fully-resolved data an <app-event-card> needs to render - built by the
 * page (Favorites today, Events later) so the card itself stays a pure,
 * presentational component with no service dependencies of its own. */
export interface EventCardView {
  id: string;
  imageUrl: string;
  title: string;
  creatorId: string;
  creatorName: string;
  /** Where the creator name links to - your own profile (editable) if you
   * created this event, otherwise their read-only profile. Precomputed by
   * the page so the card itself doesn't need to know who's logged in. */
  creatorProfileLink: string[];
  /** An event can be more than one type/discipline, so each renders as its
   * own icon+name tag instead of a single value. */
  eventTypeTags: { name: string; iconUrl: string }[];
  disciplineTags: { name: string; iconUrl: string }[];
  status: EventStatus;
  statusLabelKey: string;
  statusIconUrl: string;
  dateLabel: string;
  address: string;
  city: string;
  isFree: boolean;
  /** Only meaningful when !isFree - the card shows this value with a € suffix
   * instead of the "Gratis" badge. */
  price: number;
  /** True for finished/cancelled events, which render faded rather than
   * hidden - they're still part of "my events", just no longer actionable. */
  isFaded: boolean;
  /** Translation key for the "you organize it / you're attending it" badge -
   * omit to hide the badge entirely (e.g. a future Events tab listing that
   * has no personal relation to show). */
  relationLabelKey?: string;
  /** Drives which color the relation badge renders in (see
   * event-card.component.scss's .tag-relation-* rules) - creator/favorite/both
   * otherwise all looked identical, making them hard to tell apart at a glance. */
  relation?: EventRelation;
  /** True when the currently logged-in user organizes this event - the heart
   * (like/unlike) is disabled rather than hidden for these, since an
   * organizer's own events must always stay listed in Favorites/user-events. */
  isOwnEvent: boolean;
  /** Whether the logged-in user has given this event a heart - a plain
   * "like" with no further implications (see AttendanceService for real
   * RSVP/attendance, which the card doesn't expose). */
  isLiked: boolean;
  /** Whether the logged-in user genuinely attends this event - drives the
   * attendee-count icon's active (teal) vs grey state, same idea as
   * isLiked/the heart. */
  isAttending: boolean;
  /** Info badges - batch-computed backend-side per list load (see
   * SearchedEventDto/FavoritedEventDto), not per card. All always render
   * (0/empty included) - reviewsCount === 0 shows empty stars + "Sin
   * reseñas", same convention as event-detail's own summary row. */
  attendeesCount: number;
  likesCount: number;
  reviewsCount: number;
  averageRating: number;
  /** Unread-message/new-photo badges - undefined (no badge rendered) unless
   * the backend determined this viewer genuinely attends the event (see
   * EventWithCreatorName's own doc comment) - only Favoritos/Mis-eventos
   * ever populate these, not a plain Events-tab search result. */
  unreadChatCount?: number;
  unreadGalleryCount?: number;
  unreadPrivateGalleryCount?: number;
}
