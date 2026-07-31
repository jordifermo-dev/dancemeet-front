import { AppLanguage } from '../services/language.service';

const INTL_LOCALES: Record<AppLanguage, string> = {
  es: 'es-ES',
  ca: 'ca-ES',
  en: 'en-GB',
};

function isSameDay(a: number, b: number): boolean {
  const da = new Date(a);
  const db = new Date(b);
  return da.getFullYear() === db.getFullYear() && da.getMonth() === db.getMonth() && da.getDate() === db.getDate();
}

/** "12 Mar 2026, 20:00" for a single-day event, or "12 Mar 2026, 20:00 -
 * 14 Mar 2026, 10:00" when the event spans multiple days. */
export function formatEventDateRange(from: number, to: number, lang: AppLanguage | null): string {
  const locale = INTL_LOCALES[lang ?? 'es'];
  const formatter = new Intl.DateTimeFormat(locale, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
  if (isSameDay(from, to)) {
    return formatter.format(new Date(from));
  }
  return `${formatter.format(new Date(from))} – ${formatter.format(new Date(to))}`;
}
