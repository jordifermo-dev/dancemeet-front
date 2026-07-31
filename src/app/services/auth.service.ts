import { Injectable, computed, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { TranslateService } from '@ngx-translate/core';
import {
  GoogleAuthProvider,
  OAuthProvider,
  User as FirebaseUser,
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
} from 'firebase/auth';
import { firebaseAuth } from './firebase';
import { UserService } from './user.service';
import { LanguageService, SUPPORTED_LANGUAGES } from './language.service';
import { User } from '../models';

export type AuthProvider = 'google' | 'apple' | 'microsoft';

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

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly userService = inject(UserService);
  private readonly languageService = inject(LanguageService);
  private readonly translate = inject(TranslateService);

  readonly currentUser = signal<User | null>(null);
  readonly isLoggedIn = computed(() => this.currentUser() !== null);

  /** Resolves once Firebase's initial (async) session check has run, so guards don't race it. */
  readonly authReady: Promise<void>;

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
    const credential = await signInWithPopup(firebaseAuth, buildProvider(provider));
    await this.loadProfileOrThrow(credential.user);
  }

  async getIdToken(): Promise<string | null> {
    return firebaseAuth.currentUser ? firebaseAuth.currentUser.getIdToken() : null;
  }

  async logout(): Promise<void> {
    await signOut(firebaseAuth);
    this.currentUser.set(null);
  }
}
