import { signal } from '@angular/core';

/** Small reusable "just succeeded" flag with auto-reset - the same shape
 * Profile's own Aplicar button pioneered (a signal flipped true right after
 * a real action completes, then back to false after a couple seconds so the
 * UI reverts to normal). Centralized so every button using this pattern
 * shares one timing/behavior instead of hand-rolling its own setTimeout. */
export function createSuccessFlash(durationMs = 2000) {
  const active = signal(false);
  let timer: ReturnType<typeof setTimeout> | null = null;
  return {
    active,
    trigger(): void {
      if (timer) {
        clearTimeout(timer);
      }
      active.set(true);
      timer = setTimeout(() => active.set(false), durationMs);
    },
  };
}

/** For an "Aplicar" button inside a filter sheet: flashes "Aplicado ✓" for a
 * beat, then runs onSettle (almost always closing the modal) - instead of
 * closing immediately, which never gave the confirmation a chance to be
 * seen. Wraps createSuccessFlash so every "Aplicar" button in the app (there
 * are dozens, one per filter category per screen) shares one timing/
 * behavior instead of each screen hand-rolling its own setTimeout. */
export function createApplyFlash(onSettle: () => void, delayMs = 450) {
  const flash = createSuccessFlash();
  return {
    active: flash.active,
    trigger(): void {
      flash.trigger();
      setTimeout(onSettle, delayMs);
    },
  };
}
