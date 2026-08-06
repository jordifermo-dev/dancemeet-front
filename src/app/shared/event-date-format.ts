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

/** "12 Mar 2026" (no time - the day/hour fields have their own separate
 * inputs) for a single timestamp - used to render the Desde/Hasta
 * date-picker buttons' own label ourselves (a plain, reliably-reactive
 * Angular binding) instead of trusting <ion-datetime-button>'s built-in
 * label, which only refreshes off its linked <ion-datetime>'s ionChange
 * (real user interaction) - a programmatic value change (e.g. prefilling a
 * "reused" event's original date) updates the datetime's actual value
 * correctly but silently leaves the button showing whatever it last did. */
export function formatEventDateOnly(timestamp: number, lang: AppLanguage | null): string {
  const locale = INTL_LOCALES[lang ?? 'es'];
  const formatter = new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short', year: 'numeric' });
  return formatter.format(new Date(timestamp));
}
