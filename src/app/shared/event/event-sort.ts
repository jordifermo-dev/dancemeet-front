export type EventSortMode = 'dateSoonest' | 'dateLatest' | 'titleAsc' | 'titleDesc';

export const EVENT_SORT_OPTIONS: { id: EventSortMode; labelKey: string }[] = [
  { id: 'titleAsc', labelKey: 'eventSort.titleAsc' },
  { id: 'titleDesc', labelKey: 'eventSort.titleDesc' },
  { id: 'dateSoonest', labelKey: 'eventSort.dateSoonest' },
  { id: 'dateLatest', labelKey: 'eventSort.dateLatest' },
];

/** A draft has no eventDateFrom yet - always sorted after every dated event,
 * regardless of sort direction, rather than breaking the comparison. */
function compareByDate(a: number | undefined, b: number | undefined, direction: 1 | -1): number {
  if (a === undefined && b === undefined) {
    return 0;
  }
  if (a === undefined) {
    return 1;
  }
  if (b === undefined) {
    return -1;
  }
  return direction * (a - b);
}

/** Shared comparator for every screen that lists events (Events tab,
 * Favorites) so "Ordenar" behaves identically everywhere. */
export function sortEvents<T extends { title: string; eventDateFrom?: number }>(
  events: T[],
  mode: EventSortMode,
): T[] {
  const sorted = [...events];
  switch (mode) {
    case 'titleAsc':
      return sorted.sort((a, b) => a.title.localeCompare(b.title));
    case 'titleDesc':
      return sorted.sort((a, b) => b.title.localeCompare(a.title));
    case 'dateLatest':
      return sorted.sort((a, b) => compareByDate(a.eventDateFrom, b.eventDateFrom, -1));
    case 'dateSoonest':
    default:
      return sorted.sort((a, b) => compareByDate(a.eventDateFrom, b.eventDateFrom, 1));
  }
}
