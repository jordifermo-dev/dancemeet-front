import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { TranslateService } from '@ngx-translate/core';
import { Share } from '@capacitor/share';
import { Directory, Filesystem } from '@capacitor/filesystem';
import { environment } from '../../environments/environment';
import { EventStatus, EventWithCreatorName } from '../models';

const SHARE_INTRO_KEYS: Record<EventStatus, string> = {
  published: 'eventDetail.shareIntroPublished',
  cancelled: 'eventDetail.shareIntroCancelled',
  finished: 'eventDetail.shareIntroFinished',
};

// *asterisk* markdown only renders as real bold on WhatsApp/Telegram -
// everywhere else (Instagram, Facebook, SMS...) it shows the literal
// asterisks. Swapping each character for its Mathematical Sans-Serif Bold
// Unicode codepoint instead is real bold text everywhere, since it's just
// different characters rather than formatting any app has to opt into -
// sans-serif specifically to match these apps' own UI font instead of the
// serif look of the plain "Mathematical Bold" block. Accented letters (á,
// ñ...) have no bold codepoint and are left as-is.
function bold(text: string): string {
  return Array.from(text)
    .map((char) => {
      const code = char.codePointAt(0)!;
      if (code >= 65 && code <= 90) return String.fromCodePoint(0x1d5d4 + (code - 65)); // A-Z
      if (code >= 97 && code <= 122) return String.fromCodePoint(0x1d5ee + (code - 97)); // a-z
      if (code >= 48 && code <= 57) return String.fromCodePoint(0x1d7ec + (code - 48)); // 0-9
      return char;
    })
    .join('');
}

// No "strikethrough alphabet" exists in Unicode the way bold() has one -
// the standard trick is a combining stroke (U+0336) layered after every
// character instead, which works on any character (accents, digits, emoji
// included) since it's a diacritic, not a swapped-out letter. Only used for
// the plain-text fallback (see htmlToShareText) - the rich editor itself
// applies real strikethrough via execCommand.
function strikethroughText(text: string): string {
  return Array.from(text)
    .map((char) => (char === '\n' ? char : `${char}̶`))
    .join('');
}

// Plain-text -> the minimal HTML needed to seed the rich editor (see
// EventDetailPage.startShareTextEdit) with the same line breaks it already has.
export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

export type ShareImageOutcome = 'shared' | 'copied' | 'failed';

/** Everything about building/shortening/sending the "share this event" text
 * and image - split out of EventDetailPage (which was the only page
 * component in the app injecting HttpClient directly, just for this) so the
 * page only owns the share-preview modal's UI state (open/closed, edit mode,
 * the contenteditable draft) and delegates the actual text-building and
 * native-share plumbing here. */
@Injectable({ providedIn: 'root' })
export class EventShareService {
  private readonly http = inject(HttpClient);
  private readonly translate = inject(TranslateService);

  // TinyURL has no auth/API key and can be called anonymously - routed
  // through our own backend (ShareController's /share/shorten) purely to
  // avoid a cross-origin request to a third-party domain from the WebView.
  // Falls back to the original (long) URL on any failure - a down/blocked
  // shortener should degrade the share text, never break it.
  async shortenUrl(url: string): Promise<string> {
    try {
      const response = await firstValueFrom(
        this.http.get<{ shortUrl: string }>(`${environment.apiUrl}/share/shorten`, { params: { url } }),
      );
      return response.shortUrl;
    } catch {
      return url;
    }
  }

  /** Not every share target renders the link-preview card built from
   * ShareController's meta tags (Facebook's composer, Instagram Stories,
   * X/Twitter...) - so the event's own details need to travel as plain text
   * too, not just live behind a link only some apps bother to unfurl.
   *
   * Builds real HTML (real <b> tags) rather than bold()'s Unicode
   * substitutes - accented letters (á, ñ...) have no bold codepoint in that
   * scheme and stayed plain, and it looked visually different from actual
   * bold applied through the rich editor's own Bold button. Real HTML
   * fixes both: any character can be bold, and it's the same bold
   * everywhere. Returns both the HTML (for the rich editor / clipboard) and
   * its plain-text equivalent (native Share.share() only ever accepts plain
   * strings) - see htmlToShareText below for how that's derived without
   * losing the bold styling entirely.
   *
   * `preferences` and `dateLabel` are passed in already-formatted (they
   * depend on the page's own discipline/event-type tag computeds and locale
   * formatting) rather than recomputed here. */
  async buildShareText(
    event: EventWithCreatorName,
    preferences: string,
    dateLabel: string,
  ): Promise<{ text: string; html: string }> {
    const intro = this.translate.instant(SHARE_INTRO_KEYS[event.status], {
      creator: `<b>${escapeHtml(event.creatorName)}</b>`,
    });
    const mapsUrl = `https://www.google.com/maps/search/?api=1&query=${event.latitude},${event.longitude}`;
    // Points at the backend's own /share/events/:id (not the app URL
    // directly) - link-preview crawlers (WhatsApp, Telegram, LinkedIn...)
    // fetch this URL server-side and read its <meta property="og:..."> tags
    // without ever running JavaScript, so the SPA's own client-rendered page
    // (no per-event meta tags) always previewed as a bare link. This
    // endpoint serves real event title/description/image in its meta tags,
    // then redirects actual visitors on to the app - see ShareController.
    const [shortEventUrl, shortMapsUrl] = await Promise.all([
      this.shortenUrl(`${environment.apiUrl}/share/events/${event.id}`),
      this.shortenUrl(mapsUrl),
    ]);

    // Emoji instead of translated word labels (🎫 title, 📝 description...) -
    // unlike text they need no i18n and read the same in every language.
    const lines = [`<b>DanceMeet</b>`, intro, `🎫 <b>${escapeHtml(event.title)}</b>`];
    if (event.description) {
      lines.push(`📝 <b>${escapeHtml(event.description)}</b>`);
    }
    if (event.additionalInfo) {
      lines.push(`ℹ️ <b>${escapeHtml(event.additionalInfo)}</b>`);
    }
    lines.push(`🏷️ <b>${escapeHtml(preferences)}</b>`);
    lines.push(`📅 ${escapeHtml(dateLabel)}`);
    // The event link goes before the maps link - platforms that build a
    // link-preview card out of shared plain text (WhatsApp in particular)
    // unfurl whichever URL appears *first* in the message, and the event's
    // own card (photo, title...) is what should win that slot, not Maps'.
    lines.push(`🔗 ${escapeHtml(shortEventUrl)}`);
    lines.push(`📍 ${escapeHtml(event.address)}, ${escapeHtml(event.city)}`);
    lines.push(`🔗 ${escapeHtml(shortMapsUrl)}`);
    const html = lines.join('<br>');
    return { text: this.htmlToShareText(html), html };
  }

  // Detached-element walk (no document.body attach, so this works even
  // before the modal's ever been opened) - converts real <b>/<strong> and
  // <s>/<strike>/<del> content to bold()/strikethroughText()'s Unicode
  // substitutes so the plain-text fallback (native Share.share(), or
  // whatever a share target uses instead of the rich clipboard payload)
  // still reads as formatted instead of losing it outright. execCommand's
  // exact tag choice for strikethrough varies by browser (Chrome/Blink
  // uses <strike>), so all three are covered. Italic (<i>/<em>) has no
  // Unicode substitute here - the Mathematical Sans-Serif Italic block hit
  // the same tofu-box font problem strikethrough-on-bold did earlier, so
  // instead it's wrapped in _underscores_, the same markdown WhatsApp and
  // Telegram already recognize as italic in plain text.
  htmlToShareText(html: string): string {
    const container = document.createElement('div');
    container.innerHTML = html.replace(/<br\s*\/?>/gi, '\n');
    container.querySelectorAll('b, strong').forEach((node) => {
      node.textContent = bold(node.textContent ?? '');
    });
    container.querySelectorAll('s, strike, del').forEach((node) => {
      node.textContent = strikethroughText(node.textContent ?? '');
    });
    container.querySelectorAll('i, em').forEach((node) => {
      node.textContent = `_${node.textContent ?? ''}_`;
    });
    return container.textContent ?? '';
  }

  // Shares the event's own photo as a real image file rather than a link -
  // a URL-only share is *why* Instagram/Facebook only ever offered Message
  // as a target and WhatsApp Status stayed text-only (none of those unfurl
  // link previews the way a chat message does, but they all handle a real
  // image perfectly well, Reels/Story/Feed included). No `text` alongside
  // it: sharing both together is exactly what caused every earlier
  // platform-specific mismatch (Facebook dropping the text, Telegram
  // dropping the image...) - the copy-text button next to it is the
  // deliberate, reliable way to get the caption in, pasted by hand wherever
  // it belongs.
  async shareEventImage(imageUrl: string, eventId: string, fallbackText: string): Promise<ShareImageOutcome> {
    try {
      const response = await fetch(imageUrl);
      const blob = await response.blob();
      const base64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve((reader.result as string).split(',')[1]);
        reader.onerror = () => reject(reader.error);
        reader.readAsDataURL(blob);
      });
      const { uri } = await Filesystem.writeFile({
        path: `dancemeet-share-${eventId}.jpg`,
        data: base64,
        directory: Directory.Cache,
      });
      // Capacitor's Share plugin falls back to the Web Share API on web
      // builds by itself, so this one call covers both native and browser.
      await Share.share({ title: 'DanceMeet', files: [uri] });
      return 'shared';
    } catch {
      // Image fetch/write/share failed (offline, cancelled share sheet...) -
      // fall back to sharing the text, and if even that has nowhere to go,
      // to copying it.
      try {
        await Share.share({ title: 'DanceMeet', text: fallbackText });
        return 'shared';
      } catch {
        if (navigator.clipboard) {
          await navigator.clipboard.writeText(fallbackText);
          return 'copied';
        }
        return 'failed';
      }
    }
  }
}
