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
