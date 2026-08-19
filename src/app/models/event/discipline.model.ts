export const DISCIPLINE_NAMES = ['Swing', 'Rock&Roll', 'Hip-Hop', 'Salsa', 'Bachata', 'Tango'] as const;
export type DisciplineName = (typeof DISCIPLINE_NAMES)[number];

export interface Discipline {
  id: string;
  name: string;
  color: string;
  iconUrl: string;
  createdAt: number;
}
