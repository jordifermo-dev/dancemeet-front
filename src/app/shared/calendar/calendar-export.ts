interface CalendarEventInfo {
  id: string;
  title: string;
  description: string;
  address: string;
  city: string;
  eventDateFrom: number;
  eventDateTo: number;
}

/** UTC, basic ICS format (YYYYMMDDTHHMMSSZ) - both Google's `dates` param and
 * the .ics DTSTART/DTEND expect this, and using UTC (not local time) avoids
 * any ambiguity about which timezone the string is in. */
function toIcsUtc(timestamp: number): string {
  return new Date(timestamp).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
}

/** No OAuth or plugin needed - just a URL with the event's fields, opened in
 * a new tab. Works everywhere, but only actually adds the event on Google
 * Calendar (i.e. not the native app on iOS unless it's also signed into Google). */
export function buildGoogleCalendarUrl(event: CalendarEventInfo): string {
  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: event.title,
    dates: `${toIcsUtc(event.eventDateFrom)}/${toIcsUtc(event.eventDateTo)}`,
    details: event.description,
    location: `${event.address}, ${event.city}`,
  });
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

/** Escapes ICS's reserved characters (RFC 5545). */
function escapeIcsText(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/,/g, '\\,').replace(/;/g, '\\;').replace(/\n/g, '\\n');
}

/** Minimal single-VEVENT .ics - the format iOS/macOS Calendar (and Outlook,
 * and everything else) recognizes natively, for when there's no Google
 * account to hand off to via buildGoogleCalendarUrl(). */
export function buildIcs(event: CalendarEventInfo): string {
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//DanceMeet//Event//EN',
    'BEGIN:VEVENT',
    `UID:${event.id}@dancemeet`,
    `DTSTAMP:${toIcsUtc(Date.now())}`,
    `DTSTART:${toIcsUtc(event.eventDateFrom)}`,
    `DTEND:${toIcsUtc(event.eventDateTo)}`,
    `SUMMARY:${escapeIcsText(event.title)}`,
    `DESCRIPTION:${escapeIcsText(event.description)}`,
    `LOCATION:${escapeIcsText(`${event.address}, ${event.city}`)}`,
    'END:VEVENT',
    'END:VCALENDAR',
  ];
  return lines.join('\r\n');
}

/** Same technique as shared/user/vcard.ts's downloadVCard(): no `download`
 * attribute, so the OS recognizes the .ics mime type and hands it to the
 * Calendar app's own "add event" screen instead of just saving a file. */
export function downloadIcs(ics: string): void {
  const blob = new Blob([ics], { type: 'text/calendar;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.target = '_blank';
  link.rel = 'noopener';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}
