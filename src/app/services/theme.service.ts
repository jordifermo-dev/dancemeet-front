import { Injectable, computed, effect, signal } from '@angular/core';

export type ThemeMode = 'system' | 'light' | 'dark';

export const THEME_MODES: ThemeMode[] = ['system', 'light', 'dark'];
const THEME_STORAGE_KEY = 'dancemeet_theme';
const DARK_CLASS = 'ion-palette-dark';

function isThemeMode(value: string | null | undefined): value is ThemeMode {
  return value === 'system' || value === 'light' || value === 'dark';
}

function loadInitialMode(): ThemeMode {
  const saved = localStorage.getItem(THEME_STORAGE_KEY);
  return isThemeMode(saved) ? saved : 'system';
}

/** Same "saved choice wins, else follow the platform default" shape as
 * LanguageService.detectInitialLanguage - kept as a plain function (not a
 * service method) so index.html's pre-bootstrap inline script and this
 * service apply the exact same rule and never disagree on the first paint. */
export function resolveIsDark(mode: ThemeMode, systemPrefersDark: boolean): boolean {
  return mode === 'dark' || (mode === 'system' && systemPrefersDark);
}

@Injectable({ providedIn: 'root' })
export class ThemeService {
  private readonly media = window.matchMedia('(prefers-color-scheme: dark)');
  private readonly systemPrefersDark = signal(this.media.matches);

  readonly mode = signal<ThemeMode>(loadInitialMode());
  readonly isDark = computed(() => resolveIsDark(this.mode(), this.systemPrefersDark()));

  constructor() {
    // Modern Safari (<14) lacks addEventListener on MediaQueryList, hence the
    // deprecated addListener fallback - same feature-detect Ionic's own
    // dark.system.css relies on via the media query it replaces here.
    if (this.media.addEventListener) {
      this.media.addEventListener('change', (event) => this.systemPrefersDark.set(event.matches));
    } else {
      this.media.addListener((event) => this.systemPrefersDark.set(event.matches));
    }

    effect(() => {
      document.documentElement.classList.toggle(DARK_CLASS, this.isDark());
    });
  }

  setMode(mode: ThemeMode): void {
    localStorage.setItem(THEME_STORAGE_KEY, mode);
    this.mode.set(mode);
  }
}
