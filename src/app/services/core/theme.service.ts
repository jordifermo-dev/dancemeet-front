import { Injectable, computed, effect, signal } from '@angular/core';

export type ThemeMode = 'light' | 'dark';

const THEME_STORAGE_KEY = 'dancemeet_theme';
const DARK_CLASS = 'ion-palette-dark';
const DEFAULT_MODE: ThemeMode = 'light';

function isThemeMode(value: string | null | undefined): value is ThemeMode {
  return value === 'light' || value === 'dark';
}

function loadInitialMode(): ThemeMode {
  const saved = localStorage.getItem(THEME_STORAGE_KEY);
  return isThemeMode(saved) ? saved : DEFAULT_MODE;
}

@Injectable({ providedIn: 'root' })
export class ThemeService {
  readonly mode = signal<ThemeMode>(loadInitialMode());
  readonly isDark = computed(() => this.mode() === 'dark');

  constructor() {
    effect(() => {
      document.documentElement.classList.toggle(DARK_CLASS, this.isDark());
    });
  }

  setMode(mode: ThemeMode): void {
    localStorage.setItem(THEME_STORAGE_KEY, mode);
    this.mode.set(mode);
  }
}
