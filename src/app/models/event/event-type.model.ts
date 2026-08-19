export const EVENT_TYPE_NAMES = ['Curso', 'Taller', 'Jam', 'Competición', 'Festival', 'Party'] as const;
export type EventTypeName = (typeof EVENT_TYPE_NAMES)[number];

export interface EventType {
  id: string;
  name: string;
  createdAt: number;
}
