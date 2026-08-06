import { Discipline, EventStatus, EventType, PriceOption } from '../../models';
import { disciplineIconUrl, eventTypeIconUrl, statusIconUrl } from '../icon-catalog';
import { ChipGridItem } from './chip-grid.component';

export function eventTypeChipItems(eventTypes: EventType[], selectedIds: string[]): ChipGridItem[] {
  return eventTypes.map((eventType) => ({
    id: eventType.id,
    label: eventType.name,
    iconUrl: eventTypeIconUrl(eventType.name),
    selected: selectedIds.includes(eventType.id),
  }));
}

export function disciplineChipItems(disciplines: Discipline[], selectedIds: string[]): ChipGridItem[] {
  return disciplines.map((discipline) => ({
    id: discipline.id,
    label: discipline.name,
    iconUrl: disciplineIconUrl(discipline),
    selected: selectedIds.includes(discipline.id),
  }));
}

export function statusChipItems(options: { id: EventStatus; labelKey: string }[], selectedIds: EventStatus[]): ChipGridItem[] {
  return options.map((option) => ({
    id: option.id,
    labelKey: option.labelKey,
    iconUrl: statusIconUrl(option.id),
    selected: selectedIds.includes(option.id),
  }));
}

export function priceChipItems(options: { id: PriceOption; labelKey: string }[], selectedIds: PriceOption[]): ChipGridItem[] {
  return options.map((option) => ({
    id: option.id,
    labelKey: option.labelKey,
    selected: selectedIds.includes(option.id),
  }));
}

/** Generic label-only chip list (relation, read-filter, and other small
 * {id, labelKey} option sets that don't have a per-item icon). */
export function optionChipItems<T extends string>(options: { id: T; labelKey: string }[], selectedIds: T[]): ChipGridItem[] {
  return options.map((option) => ({
    id: option.id,
    labelKey: option.labelKey,
    selected: selectedIds.includes(option.id),
  }));
}

export const QUICK_DATE_OPTIONS: { id: string; labelKey: string }[] = [
  { id: 'today', labelKey: 'explorer.today' },
  { id: 'week', labelKey: 'explorer.thisWeek' },
  { id: 'month', labelKey: 'explorer.thisMonth' },
  { id: 'weekend', labelKey: 'explorer.thisWeekend' },
  { id: 'next30days', labelKey: 'explorer.next30Days' },
];

export function quickDateChipItems(activeQuickDate: string | null | undefined): ChipGridItem[] {
  return QUICK_DATE_OPTIONS.map((option) => ({
    id: option.id,
    labelKey: option.labelKey,
    selected: activeQuickDate === option.id,
  }));
}
