import { EventRelation, EventStatus } from '../../models';

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
}
