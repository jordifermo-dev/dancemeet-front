export type SocialNetworkKey = 'facebook' | 'instagram' | 'pinterest' | 'tiktok' | 'website' | 'whatsapp' | 'youtube';

// Display order for both an active-links list and its "add" picker sheet
// (see profile.page.ts, event-detail.page.ts and user-detail.page.ts) -
// alphabetical by the untranslated key name, not per-language, so it stays
// the same regardless of which language the app is showing.
export const ALL_SOCIAL_NETWORKS: SocialNetworkKey[] = ['facebook', 'instagram', 'pinterest', 'tiktok', 'website', 'whatsapp', 'youtube'];

export const SOCIAL_NETWORK_LABEL_KEYS: Record<SocialNetworkKey, string> = {
  facebook: 'profile.facebookLabel',
  instagram: 'profile.instagramLabel',
  pinterest: 'profile.pinterestLabel',
  tiktok: 'profile.tiktokLabel',
  website: 'profile.websiteLabel',
  whatsapp: 'profile.whatsappLabel',
  youtube: 'profile.youtubeLabel',
};

// website has no Validators.pattern (see accountForm/editForm), so it never
// has an error message to show.
export const SOCIAL_NETWORK_ERROR_KEYS: Partial<Record<SocialNetworkKey, string>> = {
  facebook: 'profile.socialUrlFacebookError',
  instagram: 'profile.socialUrlInstagramError',
  pinterest: 'profile.socialUrlPinterestError',
  tiktok: 'profile.socialUrlTiktokError',
  whatsapp: 'profile.socialUrlWhatsappError',
  youtube: 'profile.socialUrlYoutubeError',
};
