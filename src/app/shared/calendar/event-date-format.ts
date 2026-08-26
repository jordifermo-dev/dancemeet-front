import { AppLanguage } from '../../services/core/language.service';

export const INTL_LOCALES: Record<AppLanguage, string> = {
  es: 'es-ES',
  ca: 'ca-ES',
  en: 'en-GB',
};

export function isSameDay(a: number, b: number): boolean {
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

/** "23/08/2026, 16:40" - day/month as digits rather than a locale month
 * name. Some Android WebView builds ship ICU/CLDR data trimmed down to
 * English-only month names, so month:'short' silently renders "Aug" even
 * when a Spanish/Catalan locale was requested - numeric fields don't depend
 * on that per-language name table at all, only on digit/separator
 * conventions, which are far more reliably present. Used for the gallery
 * lightbox's "posted at" timestamp. */
/** "20:00" - time only, no date. Used by the event chat's per-message
 * timestamp, where the date is implied by the message's position in the
 * conversation rather than repeated on every bubble. */
export function formatTimeOnly(timestamp: number, lang: AppLanguage | null): string {
  const locale = INTL_LOCALES[lang ?? 'es'];
  const formatter = new Intl.DateTimeFormat(locale, { hour: '2-digit', minute: '2-digit' });
  return formatter.format(new Date(timestamp));
}

export function formatDateTimeNumeric(timestamp: number, lang: AppLanguage | null): string {
  const locale = INTL_LOCALES[lang ?? 'es'];
  const formatter = new Intl.DateTimeFormat(locale, {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
  return formatter.format(new Date(timestamp));
}
