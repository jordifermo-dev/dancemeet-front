import { Injectable, computed, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { TranslateService } from '@ngx-translate/core';
import { Capacitor } from '@capacitor/core';
import { FirebaseAuthentication } from '@capacitor-firebase/authentication';
import {
  EmailAuthProvider,
  GoogleAuthProvider,
  OAuthProvider,
  User as FirebaseUser,
  createUserWithEmailAndPassword,
  getRedirectResult,
  onAuthStateChanged,
  reauthenticateWithCredential,
  sendPasswordResetEmail,
  signInWithCredential,
  signInWithEmailAndPassword,
  signInWithPopup,
  signInWithRedirect,
  signOut,
  updatePassword,
} from 'firebase/auth';
import { firebaseAuth } from './firebase';
import { UserService } from '../user/user.service';
import { LanguageService, SUPPORTED_LANGUAGES } from './language.service';
import { User } from '../../models';

export type AuthProvider = 'google' | 'apple' | 'microsoft';

/** What register.page.ts needs to pre-fill/skip its account step once a
 * social sign-in authenticates someone with no matching app profile yet. */
export interface PendingSocialSignup {
  name: string;
  email: string;
  photoUrl: string | null;
}

function buildProvider(provider: AuthProvider): GoogleAuthProvider | OAuthProvider {
  switch (provider) {
    case 'google':
      return new GoogleAuthProvider();
    case 'apple':
      return new OAuthProvider('apple.com');
    case 'microsoft':
      return new OAuthProvider('microsoft.com');
  }
}

/** signInWithPopup relies on the popup window sharing sessionStorage/opener
 * with the tab that opened it to hand the credential back - on mobile
 * browsers that popup very often opens as a disconnected tab/task instead
 * (losing that link), which is what was actually behind the "missing initial
 * state" error users hit trying to sign in with Google on a phone. A
 * full-page redirect is Firebase's own recommended approach for mobile web -
 * desktop keeps the popup, which is a nicer UX there and unaffected by this. */
function isMobileWebBrowser(): boolean {
  return !Capacitor.isNativePlatform() && /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
}

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly userService = inject(UserService);
  private readonly languageService = inject(LanguageService);
  private readonly translate = inject(TranslateService);

  readonly currentUser = signal<User | null>(null);
  readonly isLoggedIn = computed(() => this.currentUser() !== null);

  /** Resolves once Firebase's initial (async) session check has run, so guards don't race it. */
  readonly authReady: Promise<void>;

  /** Set only when a signInWithRedirect (mobile Google/Apple/Microsoft login)
   * came back with an error, or signed in a Firebase user with no matching
   * app profile - onAuthStateChanged's own handling of that same case
   * (tryLoadProfile) swallows it silently, so without this the mobile user
   * would land back on /login with literally no explanation. Read once and
   * cleared by login.page.ts. */
  readonly redirectError = signal<unknown>(null);

  /** Set when a Google/Apple/Microsoft sign-in succeeds but no app profile
   * exists for that email yet - login.page.ts routes to /register instead of
   * showing an error, and register.page.ts reads (and clears) this to
   * pre-fill its account step and skip asking for a password. */
  readonly pendingSocialSignup = signal<PendingSocialSignup | null>(null);

  constructor() {
    let resolveReady!: () => void;
    this.authReady = new Promise((resolve) => (resolveReady = resolve));
    let isFirstCallback = true;

    onAuthStateChanged(firebaseAuth, async (firebaseUser) => {
      if (!firebaseUser) {
        this.currentUser.set(null);
      } else {
        // A 404 here just means the Mongo profile hasn't been created yet
        // (e.g. mid-registration) - don't clobber currentUser in that case.
        await this.tryLoadProfile(firebaseUser);
      }
      if (isFirstCallback) {
        isFirstCallback = false;
        resolveReady();
      }
    });

    void this.consumeRedirectResult();
  }

  private async consumeRedirectResult(): Promise<void> {
    try {
      const credential = await getRedirectResult(firebaseAuth);
      if (credential) {
        await this.loadProfileOrSignalSignup(credential.user);
      }
    } catch (err) {
      this.redirectError.set(err);
    }
  }

  /** Switches the active UI language to the profile's saved preference, if it's one we support. */
  private applyProfileLanguage(user: User): void {
    if ((SUPPORTED_LANGUAGES as string[]).includes(user.language)) {
      this.languageService.setLanguage(user.language as (typeof SUPPORTED_LANGUAGES)[number]);
    }
  }

  private async tryLoadProfile(firebaseUser: FirebaseUser): Promise<void> {
    if (!firebaseUser.email) {
      return;
    }
    try {
      const profile = await firstValueFrom(this.userService.getByEmail(firebaseUser.email));
      if (profile) {
        this.currentUser.set(profile);
        this.applyProfileLanguage(profile);
      }
    } catch {
      // Backend unreachable or similar - leave currentUser as-is.
    }
  }

  /**
   * Same as tryLoadProfile, but used right after an interactive login: a
   * failure here must be visible to the caller instead of silently leaving
   * the user stuck (isLoggedIn() false -> bounced back to /login with no
   * explanation).
   */
  private async loadProfileOrThrow(firebaseUser: FirebaseUser): Promise<void> {
    if (!firebaseUser.email) {
      throw new Error(this.translate.instant('errors.noEmail'));
    }
    const profile = await firstValueFrom(this.userService.getByEmail(firebaseUser.email));
    if (!profile) {
      throw new Error(this.translate.instant('errors.noProfile'));
    }
    this.currentUser.set(profile);
    this.applyProfileLanguage(profile);
  }

  /**
   * Used after a social (Google/Apple/Microsoft) sign-in: unlike
   * loadProfileOrThrow, a missing app profile isn't an error here - it means
   * this is someone's first time, so the details Firebase gave us are handed
   * off via pendingSocialSignup for register.page.ts to finish the account
   * with (disciplines/event types/location still need to come from them).
   */
  private async loadProfileOrSignalSignup(firebaseUser: FirebaseUser): Promise<void> {
    if (!firebaseUser.email) {
      throw new Error(this.translate.instant('errors.noEmail'));
    }
    const profile = await firstValueFrom(this.userService.getByEmail(firebaseUser.email));
    if (!profile) {
      this.pendingSocialSignup.set({
        name: firebaseUser.displayName ?? '',
        email: firebaseUser.email,
        photoUrl: firebaseUser.photoURL,
      });
      return;
    }
    this.currentUser.set(profile);
    this.applyProfileLanguage(profile);
  }

  /** Sets the active profile immediately (used right after register, without waiting on a lookup). */
  syncProfile(user: User): void {
    this.currentUser.set(user);
    this.applyProfileLanguage(user);
  }

  async registerWithEmail(email: string, password: string): Promise<void> {
    await createUserWithEmailAndPassword(firebaseAuth, email, password);
  }

  async loginWithEmail(email: string, password: string): Promise<void> {
    const credential = await signInWithEmailAndPassword(firebaseAuth, email, password);
    await this.loadProfileOrThrow(credential.user);
  }

  async loginWithProvider(provider: AuthProvider): Promise<void> {
    if (Capacitor.isNativePlatform()) {
      // signInWithPopup/signInWithRedirect below both need a real browser
      // tab - Google's OAuth consent screen explicitly refuses to load
      // inside any embedded WebView (which is exactly what a Capacitor app
      // is), so native goes through the platform's own Google Sign-In SDK
      // instead. Only Google has a native login button today (see
      // login.page.html) - apple/microsoft aren't wired up natively yet.
      if (provider !== 'google') {
        throw new Error(`Native sign-in isn't implemented yet for provider "${provider}".`);
      }
      await this.loginWithGoogleNative();
      return;
    }
    const authProvider = buildProvider(provider);
    if (isMobileWebBrowser()) {
      // Navigates away - the result is picked up by consumeRedirectResult()
      // once Google redirects back and the app reloads, not by this call
      // returning.
      await signInWithRedirect(firebaseAuth, authProvider);
      return;
    }
    const credential = await signInWithPopup(firebaseAuth, authProvider);
    await this.loadProfileOrSignalSignup(credential.user);
  }

  /** capacitor.config.ts sets skipNativeAuth: true, so this only drives the
   * native Google account picker and hands back a raw credential - it does
   * NOT sign into Firebase on the native layer. signInWithCredential below is
   * what actually establishes the session on the Firebase JS SDK
   * (firebaseAuth), the same object onAuthStateChanged/getIdToken/etc.
   * already rely on everywhere else in this service, so nothing past this
   * point needs to know native sign-in was involved at all. */
  private async loginWithGoogleNative(): Promise<void> {
    // Android's Credential Manager API (the plugin's default since 7.2.0)
    // only surfaces accounts that have already signed into this exact app
    // before, so on a fresh install/device it finds none and throws
    // NoCredentialException - confirmed via device logs ("No credentials
    // available"), with the account picker never even appearing. The legacy
    // Google Sign-In SDK has no such restriction.
    const { credential } = await FirebaseAuthentication.signInWithGoogle({ useCredentialManager: false });
    if (!credential?.idToken) {
      throw new Error('Google sign-in was cancelled or returned no credential.');
    }
    const googleCredential = GoogleAuthProvider.credential(credential.idToken);
    const userCredential = await signInWithCredential(firebaseAuth, googleCredential);
    await this.loadProfileOrSignalSignup(userCredential.user);
  }

  async getIdToken(): Promise<string | null> {
    return firebaseAuth.currentUser ? firebaseAuth.currentUser.getIdToken() : null;
  }

  /** True only for accounts that actually have an email/password credential -
   * a Google/Apple/Microsoft-only account has nothing to "change" here. */
  hasPasswordProvider(): boolean {
    return (firebaseAuth.currentUser?.providerData ?? []).some((p) => p.providerId === 'password');
  }

  /** Firebase rejects updatePassword on anything but a "recent" sign-in -
   * re-authenticating with the current password first satisfies that
   * regardless of how long ago the session actually started, and doubles as
   * the "current password" check itself (wrong current password surfaces as
   * the same auth/wrong-password error re-auth would give). */
  async changePassword(currentPassword: string, newPassword: string): Promise<void> {
    const user = firebaseAuth.currentUser;
    if (!user?.email) {
      throw new Error(this.translate.instant('errors.noEmail'));
    }
    const credential = EmailAuthProvider.credential(user.email, currentPassword);
    await reauthenticateWithCredential(user, credential);
    await updatePassword(user, newPassword);
  }

  async logout(): Promise<void> {
    await signOut(firebaseAuth);
    this.currentUser.set(null);
  }

  /** Firebase's own hosted "forgot password" flow - sends a reset link to
   * whatever email is actually registered on that account. There's no way
   * to redirect it to a different inbox (nor should there be - that'd be an
   * account-takeover vector), so testing this against one of the seeded
   * dummy accounts (userNNN@gmail.com) won't produce an email anyone here
   * can read; only a real, owned mailbox will actually receive it. Doesn't
   * reveal whether the email is registered (same UI regardless), matching
   * Firebase's own email-enumeration-protection default. */
  async resetPassword(email: string): Promise<void> {
    firebaseAuth.languageCode = this.languageService.currentLang();
    await sendPasswordResetEmail(firebaseAuth, email);
  }
}
