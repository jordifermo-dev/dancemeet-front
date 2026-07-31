import { Discipline, DisciplineName, EventStatus, EventTypeName } from '../models';

// Matches the filenames actually present in src/assets/icons/disciplines - kept
// in sync with the real `iconUrl` the backend returns, just for the fallback
// data used when the disciplines API call hasn't resolved yet/fails.
export const DISCIPLINE_ICON_FILES: Record<DisciplineName, string> = {
  Swing: 'swing.svg',
  'Rock&Roll': 'rock-roll.svg',
  'Hip-Hop': 'hip-hop.svg',
  Salsa: 'salsa.svg',
  Bachata: 'bachata.svg',
  Tango: 'tango.svg',
};

// Event types/statuses aren't backed by a real `iconUrl` field (unlike
// disciplines), so the name/id -> asset mapping lives entirely here.
export const EVENT_TYPE_ICON_FILES: Record<EventTypeName, string> = {
  Curso: 'curso.svg',
  Taller: 'taller.svg',
  Jam: 'jam.svg',
  'Competición': 'competicion.svg',
  Festival: 'festival.svg',
  Party: 'party.svg',
};

export const STATUS_ICON_FILES: Record<EventStatus, string> = {
  published: 'published.svg',
  finished:  'finished.svg',
  cancelled: 'cancelled.svg',
};

export const STATUS_LABEL_KEYS: Record<EventStatus, string> = {
  published: 'register.statusPublished',
  cancelled: 'register.statusCancelled',
  finished: 'register.statusFinished',
};

export function disciplineIconUrl(discipline: Discipline): string {
  return `/${discipline.iconUrl}`;
}

export function eventTypeIconUrl(name: string): string {
  return `/assets/icons/eventtypes/${EVENT_TYPE_ICON_FILES[name as EventTypeName] ?? ''}`;
}

export function statusIconUrl(id: EventStatus): string {
  return `/assets/icons/status/${STATUS_ICON_FILES[id]}`;
}

export type SocialIconKey = 'email' | 'phone' | 'instagram' | 'facebook' | 'tiktok' | 'youtube' | 'website';

export function socialIconUrl(key: SocialIconKey): string {
  return `/assets/icons/social/${key}.svg`;
}

/** Shortens a social link for display, e.g. "https://www.instagram.com/x" -> "instagram.com/x". */
export function formatSocialUrl(url: string): string {
  return url.replace(/^https?:\/\//i, '').replace(/^www\./i, '').replace(/\/$/, '');
}

/** Puts API results back into the app's canonical display order (API order isn't guaranteed to match). */
export function sortByNameOrder<T extends { name: string }>(items: T[], order: readonly string[]): T[] {
  return [...items].sort((a, b) => {
    const indexA = order.indexOf(a.name);
    const indexB = order.indexOf(b.name);
    return (indexA === -1 ? order.length : indexA) - (indexB === -1 ? order.length : indexB);
  });
}
