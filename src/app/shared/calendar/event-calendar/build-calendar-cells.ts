import { EventType, EventWithCreatorName } from '../../../models';
import { eventTypeIconUrl } from '../../event/icon-catalog';
import { CalendarDayCell, CalendarDayIcon } from './event-calendar.model';
import { isSameDay, startOfDay } from './calendar-date-utils';

const DAY_MS = 24 * 60 * 60 * 1000;
/** Icons per day cell before collapsing the rest into a "+N" badge - a month
 * cell is only ~45-55px wide on a phone screen, so there's room for a
 * handful at most. */
const MAX_TYPE_ICONS_PER_DAY = 4;

/** Builds one cell per timestamp in `periodDates` (a month grid, a week
 * grid, or a single day), bucketing each event into every day it spans
 * (eventDateFrom..eventDateTo) so a multi-day festival shows up each day it
 * runs, not just on its start date - matching how a real calendar app would
 * display it. `events` is expected to already be filtered by the host page
 * (discipline/type/status/price/location/search) - this only adds the
 * date-bucketing layer on top. */
export function buildCalendarCells(
  periodDates: number[],
  events: EventWithCreatorName[],
  eventTypesById: Map<string, EventType>,
  options: {
    selectedDate: number | null;
    /** Days outside this month render muted (month grid's leading/trailing
     * padding days) - null means every cell counts as "in period" (week/day). */
    periodAnchor: number | null;
    minDate: number | null;
    maxDate: number | null;
  },
): CalendarDayCell[] {
  const { selectedDate, periodAnchor, minDate, maxDate } = options;
  const today = startOfDay(Date.now());
  const periodMonth = periodAnchor !== null ? new Date(periodAnchor).getMonth() : null;
  const periodYear = periodAnchor !== null ? new Date(periodAnchor).getFullYear() : null;

  return periodDates.map((date) => {
    const dayStart = startOfDay(date);
    const dayEnd = dayStart + DAY_MS - 1;

    const dayEvents = events.filter((event) => event.eventDateFrom <= dayEnd && event.eventDateTo >= dayStart);

    const seenTypeIds = new Set<string>();
    const typeIcons: CalendarDayIcon[] = [];
    for (const event of dayEvents) {
      for (const typeId of event.typeIds) {
        if (seenTypeIds.has(typeId)) {
          continue;
        }
        const eventType = eventTypesById.get(typeId);
        if (!eventType) {
          continue;
        }
        seenTypeIds.add(typeId);
        typeIcons.push({ id: eventType.id, name: eventType.name, iconUrl: eventTypeIconUrl(eventType.name) });
      }
    }
    const overflowCount = Math.max(0, typeIcons.length - MAX_TYPE_ICONS_PER_DAY);

    const dayDate = new Date(dayStart);
    return {
      date: dayStart,
      dayOfMonth: dayDate.getDate(),
      isToday: isSameDay(dayStart, today),
      isSelected: selectedDate !== null && isSameDay(dayStart, selectedDate),
      isInPeriod: periodMonth === null || (dayDate.getMonth() === periodMonth && dayDate.getFullYear() === periodYear),
      isOutOfRange: (minDate !== null && dayEnd < minDate) || (maxDate !== null && dayStart > maxDate),
      eventCount: dayEvents.length,
      typeIcons: typeIcons.slice(0, MAX_TYPE_ICONS_PER_DAY),
      overflowCount,
    };
  });
}
