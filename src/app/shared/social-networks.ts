export type SocialNetworkKey = 'instagram' | 'facebook' | 'tiktok' | 'youtube' | 'website';

// Display order for both an active-links list and its "add" picker sheet
// (see profile.page.ts and event-detail.page.ts).
export const ALL_SOCIAL_NETWORKS: SocialNetworkKey[] = ['instagram', 'facebook', 'tiktok', 'youtube', 'website'];

export const SOCIAL_NETWORK_LABEL_KEYS: Record<SocialNetworkKey, string> = {
  instagram: 'profile.instagramLabel',
  facebook: 'profile.facebookLabel',
  tiktok: 'profile.tiktokLabel',
  youtube: 'profile.youtubeLabel',
  website: 'profile.websiteLabel',
};

// website has no Validators.pattern (see accountForm/editForm), so it never
// has an error message to show.
export const SOCIAL_NETWORK_ERROR_KEYS: Partial<Record<SocialNetworkKey, string>> = {
  instagram: 'profile.socialUrlInstagramError',
  facebook: 'profile.socialUrlFacebookError',
  tiktok: 'profile.socialUrlTiktokError',
  youtube: 'profile.socialUrlYoutubeError',
};
