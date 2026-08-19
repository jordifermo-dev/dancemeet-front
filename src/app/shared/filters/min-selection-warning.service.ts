import { Injectable, signal } from '@angular/core';

/** Drives the brief "you need at least one selected" hint shown next to a
 * chip-grid when the user tries to deselect the last remaining chip - shared
 * across every filter UI (Explorer, profile preferences, future tabs) so they
 * all reuse the same transient-message pattern instead of each reinventing
 * it. Only one hint is ever shown at a time app-wide, which is fine since
 * only one filter UI is interactive at once. */
@Injectable({ providedIn: 'root' })
export class MinSelectionWarningService {
  private readonly active = signal<string | null>(null);
  private timer: ReturnType<typeof setTimeout> | null = null;

  flash(key: string, durationMs = 2500): void {
    if (this.timer) {
      clearTimeout(this.timer);
    }
    this.active.set(key);
    this.timer = setTimeout(() => this.active.set(null), durationMs);
  }

  isActive(key: string): boolean {
    return this.active() === key;
  }
}
