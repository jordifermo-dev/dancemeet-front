const SHARE_HINT_DISMISSED_KEY = 'dancemeet_share_hint_dismissed';

/** "Some social networks don't share the image and text together" tip on
 * the share-preview modal - dismissed once via its own checkbox, same
 * localStorage-flag pattern as the welcome tour (OnboardingService), just
 * without that one's per-user scoping since this is a UI tip, not
 * account-tied onboarding content. Settings offers a way to reset it, same
 * as it does for the welcome tour. */
export function isSharePreviewHintDismissed(): boolean {
  return !!localStorage.getItem(SHARE_HINT_DISMISSED_KEY);
}

export function dismissSharePreviewHint(): void {
  localStorage.setItem(SHARE_HINT_DISMISSED_KEY, '1');
}

export function resetSharePreviewHint(): void {
  localStorage.removeItem(SHARE_HINT_DISMISSED_KEY);
}
