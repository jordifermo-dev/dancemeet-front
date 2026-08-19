import { AppLanguage } from '../../../services/core/language.service';
import { INTL_LOCALES } from '../event-date-format';

const DAY_MS = 24 * 60 * 60 * 1000;

export function startOfDay(timestamp: number): number {
  const d = new Date(timestamp);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

export function isSameDay(a: number, b: number): boolean {
  const da = new Date(a);
  const db = new Date(b);
  return da.getFullYear() === db.getFullYear() && da.getMonth() === db.getMonth() && da.getDate() === db.getDate();
}

export function startOfMonth(timestamp: number): number {
  const d = new Date(timestamp);
  return new Date(d.getFullYear(), d.getMonth(), 1).getTime();
}

export function addMonths(timestamp: number, delta: number): number {
  const d = new Date(timestamp);
  return new Date(d.getFullYear(), d.getMonth() + delta, 1).getTime();
}

export function addDays(timestamp: number, delta: number): number {
  return startOfDay(timestamp) + delta * DAY_MS;
}

export function addWeeks(timestamp: number, delta: number): number {
  return addDays(timestamp, delta * 7);
}

/** Monday of the week containing `timestamp` - matches
 * ExplorerFiltersService.quickDateRange('week')'s own Monday-based week. */
export function startOfWeek(timestamp: number): number {
  const day = startOfDay(timestamp);
  const daysSinceMonday = (new Date(day).getDay() + 6) % 7;
  return addDays(day, -daysSinceMonday);
}

/** 6 full Monday-Sunday weeks (42 days) covering the month `anchor` falls
 * in, padded with the trailing days of the previous/next month like any
 * standard month-grid calendar. */
export function buildMonthGrid(anchor: number): number[] {
  const firstOfMonth = startOfMonth(anchor);
  const gridStart = startOfWeek(firstOfMonth);
  return Array.from({ length: 42 }, (_, i) => addDays(gridStart, i));
}

/** The 7 days (Monday-Sunday) of the week `anchor` falls in. */
export function buildWeekGrid(anchor: number): number[] {
  const weekStart = startOfWeek(anchor);
  return Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
}

export function formatMonthYearLabel(timestamp: number, lang: AppLanguage | null): string {
  const locale = INTL_LOCALES[lang ?? 'es'];
  return new Intl.DateTimeFormat(locale, { month: 'long', year: 'numeric' }).format(new Date(timestamp));
}

export function formatWeekRangeLabel(weekStart: number, lang: AppLanguage | null): string {
  const locale = INTL_LOCALES[lang ?? 'es'];
  const weekEnd = addDays(weekStart, 6);
  const sameMonth = new Date(weekStart).getMonth() === new Date(weekEnd).getMonth();
  const dayFormatter = new Intl.DateTimeFormat(locale, sameMonth ? { day: 'numeric' } : { day: 'numeric', month: 'short' });
  const endFormatter = new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short', year: 'numeric' });
  return `${dayFormatter.format(new Date(weekStart))} - ${endFormatter.format(new Date(weekEnd))}`;
}

export function formatDayLabel(timestamp: number, lang: AppLanguage | null): string {
  const locale = INTL_LOCALES[lang ?? 'es'];
  return new Intl.DateTimeFormat(locale, { weekday: 'long', day: 'numeric', month: 'long' }).format(new Date(timestamp));
}

/** Mon..Sun short weekday names for the grid's header row, in the app's
 * current language - built off a known Monday (2024-01-01) rather than
 * "today" so the result never depends on when this happens to run. */
export function weekdayShortLabels(lang: AppLanguage | null): string[] {
  const locale = INTL_LOCALES[lang ?? 'es'];
  const formatter = new Intl.DateTimeFormat(locale, { weekday: 'short' });
  const knownMonday = new Date(2024, 0, 1).getTime();
  return Array.from({ length: 7 }, (_, i) => formatter.format(new Date(knownMonday + i * DAY_MS)));
}
