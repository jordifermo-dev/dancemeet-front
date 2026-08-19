export type EventSortMode = 'dateSoonest' | 'dateLatest' | 'titleAsc' | 'titleDesc';

export const EVENT_SORT_OPTIONS: { id: EventSortMode; labelKey: string }[] = [
  { id: 'titleAsc', labelKey: 'eventSort.titleAsc' },
  { id: 'titleDesc', labelKey: 'eventSort.titleDesc' },
  { id: 'dateSoonest', labelKey: 'eventSort.dateSoonest' },
  { id: 'dateLatest', labelKey: 'eventSort.dateLatest' },
];

/** Shared comparator for every screen that lists events (Events tab,
 * Favorites) so "Ordenar" behaves identically everywhere. */
export function sortEvents<T extends { title: string; eventDateFrom: number }>(
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
      return sorted.sort((a, b) => b.eventDateFrom - a.eventDateFrom);
    case 'dateSoonest':
    default:
      return sorted.sort((a, b) => a.eventDateFrom - b.eventDateFrom);
  }
}
