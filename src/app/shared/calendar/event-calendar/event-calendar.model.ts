export type CalendarGranularity = 'month' | 'week' | 'day';

/** One icon shown on a day cell for a distinct event type that occurs that
 * day - deduplicated per type (a day with 3 "Curso" events still only shows
 * the "Curso" icon once), capped by build-calendar-cells.ts. */
export interface CalendarDayIcon {
  id: string;
  name: string;
  iconUrl: string;
}

export interface CalendarDayCell {
  /** Start-of-day epoch ms, local time. */
  date: number;
  dayOfMonth: number;
  isToday: boolean;
  isSelected: boolean;
  /** False for the leading/trailing days of adjacent months padding out a
   * month grid to full weeks - still tappable, just rendered muted. Always
   * true in week/day granularity. */
  isInPeriod: boolean;
  /** True when outside the page's applied "Fecha" filter range (if any) -
   * rendered disabled, not tappable. */
  isOutOfRange: boolean;
  eventCount: number;
  typeIcons: CalendarDayIcon[];
  /** How many *additional* distinct event types didn't fit in typeIcons. */
  overflowCount: number;
}
