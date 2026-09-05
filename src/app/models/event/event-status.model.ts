export const EVENT_STATUSES = ['draft', 'published', 'finished', 'cancelled'] as const;
export type EventStatus = (typeof EVENT_STATUSES)[number];
