export const EVENT_STATUSES = ['published', 'finished', 'cancelled'] as const;
export type EventStatus = (typeof EVENT_STATUSES)[number];
