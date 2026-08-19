import { Injectable, Signal, inject } from '@angular/core';
import { TranslateService } from '@ngx-translate/core';

export type AppLanguage = 'es' | 'ca' | 'en';

export const SUPPORTED_LANGUAGES: AppLanguage[] = ['ca', 'en', 'es'];
export const DEFAULT_LANGUAGE: AppLanguage = 'es';
const LANGUAGE_STORAGE_KEY = 'dancemeet_lang';

function isSupportedLanguage(value: string | null | undefined): value is AppLanguage {
  return !!value && (SUPPORTED_LANGUAGES as string[]).includes(value);
}

/** Saved choice -> browser language (if we support it) -> Spanish, matching the backend's own default. */
export function detectInitialLanguage(): AppLanguage {
  const saved = localStorage.getItem(LANGUAGE_STORAGE_KEY);
  if (isSupportedLanguage(saved)) {
    return saved;
  }
  const browserLang = navigator.language?.split('-')[0];
  if (isSupportedLanguage(browserLang)) {
    return browserLang;
  }
  return DEFAULT_LANGUAGE;
}

@Injectable({ providedIn: 'root' })
export class LanguageService {
  private readonly translate = inject(TranslateService);

  readonly currentLang: Signal<AppLanguage | null> = this.translate.currentLang as Signal<
    AppLanguage | null
  >;

  setLanguage(lang: AppLanguage): void {
    localStorage.setItem(LANGUAGE_STORAGE_KEY, lang);
    this.translate.use(lang);
  }
}
