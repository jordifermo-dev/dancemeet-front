import { RecurrenceRule } from '../../models';

// Doubled from the original 52 (~1 year weekly) - a single-day-per-week
// course was the baseline, but a Mon-Fri course already hits 52 within 11
// weeks, well short of a real term/season. Kept in sync by hand with the
// backend's own src/common/recurrence.ts (no shared package between the two apps).
export const MAX_SERIES_OCCURRENCES = 104;

// Same defensive ceiling as the backend's expandRecurrence - lets a bounded
// (dateTo set) rule collect more than MAX_SERIES_OCCURRENCES days for an
// accurate "too many, reduce the range" count instead of silently
// truncating a bounded request.
const HARD_ITERATION_CAP = 500;

function startOfDayLocal(timestamp: number): Date {
  const d = new Date(timestamp);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function addDays(day: Date, delta: number): Date {
  const d = new Date(day);
  d.setDate(d.getDate() + delta);
  return d;
}

function addMonths(day: Date, delta: number): Date {
  const d = new Date(day);
  d.setMonth(d.getMonth() + delta);
  return d;
}

function toMondayFirst(jsDay: number): number {
  return (jsDay + 6) % 7;
}

function collectWeeklyDays(rule: RecurrenceRule): Date[] {
  const weekdays = [...new Set(rule.weekdays ?? [])].sort((a, b) => a - b);
  if (!weekdays.length) {
    return [];
  }
  const interval = Math.max(1, Math.floor(rule.interval));
  const from = startOfDayLocal(rule.dateFrom);
  const to = rule.dateTo !== null ? startOfDayLocal(rule.dateTo) : null;
  const cap = to === null ? MAX_SERIES_OCCURRENCES : HARD_ITERATION_CAP;

  const mondayOfFromWeek = addDays(from, -toMondayFirst(from.getDay()));
  const days: Date[] = [];

  for (let weekIndex = 0; days.length < cap; weekIndex += interval) {
    const weekStart = addDays(mondayOfFromWeek, weekIndex * 7);
    if (to !== null && weekStart > to) {
      break;
    }
    for (const weekday of weekdays) {
      const day = addDays(weekStart, weekday);
      if (day < from) {
        continue;
      }
      if (to !== null && day > to) {
        return days;
      }
      days.push(day);
      if (days.length >= cap) {
        break;
      }
    }
  }
  return days;
}

function nthWeekdayOfMonth(monthAnchor: Date, nth: number, weekday: number): Date | null {
  const firstOfMonth = new Date(monthAnchor.getFullYear(), monthAnchor.getMonth(), 1);
  const firstWeekdayOffset = (weekday - toMondayFirst(firstOfMonth.getDay()) + 7) % 7;
  const day = addDays(firstOfMonth, firstWeekdayOffset + (nth - 1) * 7);
  return day.getMonth() === monthAnchor.getMonth() ? day : null;
}

function collectMonthlyNthWeekdayDays(rule: RecurrenceRule): Date[] {
  const pairs = rule.nthWeekdays ?? [];
  if (!pairs.length) {
    return [];
  }
  const interval = Math.max(1, Math.floor(rule.interval));
  const from = startOfDayLocal(rule.dateFrom);
  const to = rule.dateTo !== null ? startOfDayLocal(rule.dateTo) : null;
  const cap = to === null ? MAX_SERIES_OCCURRENCES : HARD_ITERATION_CAP;

  const days: Date[] = [];
  const monthAnchor = new Date(from.getFullYear(), from.getMonth(), 1);

  for (let monthIndex = 0; days.length < cap; monthIndex += interval) {
    const anchor = addMonths(monthAnchor, monthIndex);
    if (to !== null && anchor > to) {
      break;
    }
    const monthDays = pairs
      .map((pair) => nthWeekdayOfMonth(anchor, pair.nth, pair.weekday))
      .filter((d): d is Date => d !== null)
      .sort((a, b) => a.getTime() - b.getTime());

    for (const day of monthDays) {
      if (day < from) {
        continue;
      }
      if (to !== null && day > to) {
        return days;
      }
      days.push(day);
      if (days.length >= cap) {
        break;
      }
    }
  }
  return days;
}

/** Client-side preview only - counts how many occurrences a rule would
 * generate, mirroring dancemeet-back's src/common/recurrence.ts algorithm
 * (kept in sync by hand, no shared package between the two apps). Used to
 * show "se crearán N eventos" and to warn before hitting the backend's own
 * MAX_SERIES_OCCURRENCES rejection. */
export function countRecurrenceOccurrences(rule: RecurrenceRule): number {
  const days = rule.frequency === 'weekly' ? collectWeeklyDays(rule) : collectMonthlyNthWeekdayDays(rule);
  return days.length;
}
