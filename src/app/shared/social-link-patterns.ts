/** Each pattern accepts with/without protocol and "www.", but requires the
 * platform's own domain plus something after it (not just the bare domain) -
 * so a Facebook link can't be saved into the Instagram field by mistake.
 * Angular's Validators.pattern already treats an empty value as valid, so
 * these only ever fire once something that doesn't match has been typed. */
export const SOCIAL_URL_PATTERNS = {
  instagram: /^(https?:\/\/)?(www\.)?instagram\.com\/.+/i,
  facebook: /^(https?:\/\/)?(www\.)?(facebook\.com|fb\.com)\/.+/i,
  tiktok: /^(https?:\/\/)?(www\.)?tiktok\.com\/.+/i,
  youtube: /^(https?:\/\/)?(www\.)?(youtube\.com|youtu\.be)\/.+/i,
} as const;
