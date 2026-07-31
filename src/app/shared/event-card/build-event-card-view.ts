import { Discipline, EventRelation, EventType, EventWithCreatorName } from '../../models';
import { AppLanguage } from '../../services/language.service';
import { disciplineIconUrl, eventTypeIconUrl, statusIconUrl, STATUS_LABEL_KEYS } from '../icon-catalog';
import { formatEventDateRange } from '../event-date-format';
import { EventCardView } from './event-card.model';

const RELATION_BADGE_KEYS: Record<EventRelation, string> = {
  creator: 'favorites.relationCreatorBadge',
  favorite: 'favorites.relationFavoriteBadge',
  both: 'favorites.relationBothBadge',
};

/** Turns a hydrated event into the view-model <app-event-card> renders -
 * shared by every screen that lists events (Favorites, the user-events page,
 * the Events tab) so they stay pixel-identical. `relation` is optional: it
 * only makes sense for "someone's events" lists (Favorites/user-events) - a
 * plain search result (Events tab) has no relation to badge. */
export function buildEventCardView(
  event: EventWithCreatorName & { relation?: EventRelation },
  disciplinesById: Map<string, Discipline>,
  eventTypesById: Map<string, EventType>,
  lang: AppLanguage | null,
  currentUserId: string | null | undefined,
): EventCardView {
  const eventTypeTags = event.typeIds
    .map((id) => eventTypesById.get(id))
    .filter((eventType): eventType is EventType => !!eventType)
    .map((eventType) => ({ name: eventType.name, iconUrl: eventTypeIconUrl(eventType.name) }));
  const disciplineTags = event.disciplineIds
    .map((id) => disciplinesById.get(id))
    .filter((discipline): discipline is Discipline => !!discipline)
    .map((discipline) => ({ name: discipline.name, iconUrl: disciplineIconUrl(discipline) }));
  const isOwnEvent = !!currentUserId && event.creatorId === currentUserId;
  return {
    id: event.id,
    imageUrl: event.imageUrl,
    title: event.title,
    creatorId: event.creatorId,
    creatorName: event.creatorName,
    creatorProfileLink: isOwnEvent ? ['/tabs/profile'] : ['/users', event.creatorId],
    eventTypeTags,
    disciplineTags,
    status: event.status,
    statusLabelKey: STATUS_LABEL_KEYS[event.status],
    statusIconUrl: statusIconUrl(event.status),
    dateLabel: formatEventDateRange(event.eventDateFrom, event.eventDateTo, lang),
    address: event.address,
    city: event.city,
    isFree: event.isFree,
    price: event.price,
    isFaded: event.status === 'finished' || event.status === 'cancelled',
    relationLabelKey: event.relation ? RELATION_BADGE_KEYS[event.relation] : undefined,
  };
}
