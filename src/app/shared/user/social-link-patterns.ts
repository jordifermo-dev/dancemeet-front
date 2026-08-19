import { SocialNetworkKey } from './social-networks';

/** Each pattern accepts with/without protocol and "www.", but requires the
 * platform's own domain plus something after it (not just the bare domain) -
 * so a Facebook link can't be saved into the Instagram field by mistake.
 * Angular's Validators.pattern already treats an empty value as valid, so
 * these only ever fire once something that doesn't match has been typed.
 * Kept in sync by hand with the backend's own src/dto/social-links.dto.ts
 * (no shared package between the two apps). */
export const SOCIAL_URL_PATTERNS = {
  facebook: /^(https?:\/\/)?(www\.)?(facebook\.com|fb\.com)\/.+/i,
  instagram: /^(https?:\/\/)?(www\.)?instagram\.com\/.+/i,
  pinterest: /^(https?:\/\/)?(www\.)?(pinterest\.[a-z.]+|pin\.it)\/.+/i,
  tiktok: /^(https?:\/\/)?(www\.)?tiktok\.com\/.+/i,
  whatsapp: /^(https?:\/\/)?(www\.)?(wa\.me|whatsapp\.com)\/.+/i,
  youtube: /^(https?:\/\/)?(www\.)?(youtube\.com|youtu\.be)\/.+/i,
} as const;

/** Canonical "type the handle, we'll add the rest" prefix pre-filled the
 * moment a network is added (see addSocialNetwork() in profile.page.ts/
 * event-detail.page.ts) - website has none, it's a free-form URL. */
export const SOCIAL_URL_PREFIXES: Partial<Record<SocialNetworkKey, string>> = {
  facebook: 'https://facebook.com/',
  instagram: 'https://instagram.com/',
  pinterest: 'https://pinterest.com/',
  tiktok: 'https://tiktok.com/',
  whatsapp: 'https://wa.me/',
  youtube: 'https://youtube.com/',
};

/** Same domains as SOCIAL_URL_PATTERNS, but with the handle captured so a
 * pasted full URL can be reduced back down to "prefix + handle". */
const SOCIAL_URL_EXTRACT_PATTERNS: Partial<Record<SocialNetworkKey, RegExp>> = {
  facebook: /^(?:https?:\/\/)?(?:www\.)?(?:facebook\.com|fb\.com)\/(.+)$/i,
  instagram: /^(?:https?:\/\/)?(?:www\.)?instagram\.com\/(.+)$/i,
  pinterest: /^(?:https?:\/\/)?(?:www\.)?(?:pinterest\.[a-z.]+|pin\.it)\/(.+)$/i,
  tiktok: /^(?:https?:\/\/)?(?:www\.)?tiktok\.com\/(.+)$/i,
  whatsapp: /^(?:https?:\/\/)?(?:www\.)?(?:wa\.me|whatsapp\.com)\/(.+)$/i,
  youtube: /^(?:https?:\/\/)?(?:www\.)?(?:youtube\.com|youtu\.be)\/(.+)$/i,
};

/** If the user pasted this network's own full URL (with or without
 * protocol/www/a different-cased domain) over the pre-filled prefix, reduces
 * it back to "canonical prefix + handle" instead of leaving the domain
 * duplicated. Anything that doesn't match this network's own domain is left
 * untouched - not this function's job to catch a cross-platform paste. */
export function normalizeSocialUrl(key: SocialNetworkKey, rawValue: string): string {
  const prefix = SOCIAL_URL_PREFIXES[key];
  const extractPattern = SOCIAL_URL_EXTRACT_PATTERNS[key];
  if (!prefix || !extractPattern) {
    return rawValue;
  }
  const match = rawValue.match(extractPattern);
  return match ? `${prefix}${match[1]}` : rawValue;
}
