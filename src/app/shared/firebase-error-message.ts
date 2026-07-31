import { TranslateService } from '@ngx-translate/core';

const KNOWN_CODES = new Set([
  'auth/invalid-email',
  'auth/user-not-found',
  'auth/wrong-password',
  'auth/invalid-credential',
  'auth/email-already-in-use',
  'auth/weak-password',
  'auth/popup-closed-by-user',
  'auth/cancelled-popup-request',
  'auth/network-request-failed',
  'auth/too-many-requests',
]);

/**
 * Maps a Firebase Auth error to a short, translated message. Plain (non-Firebase)
 * Errors - e.g. thrown by AuthService.loadProfileOrThrow, which already carry a
 * translated message - are passed through as-is.
 */
export function firebaseErrorMessage(err: unknown, translate: TranslateService): string {
  const code = (err as { code?: string })?.code;
  if (code && KNOWN_CODES.has(code)) {
    return translate.instant(`firebaseErrors.${code}`);
  }
  if (!code && err instanceof Error && err.message) {
    return err.message;
  }
  return translate.instant('firebaseErrors.default');
}
