import { computed, signal } from '@angular/core';

/** Small reusable "show/hide password" flag - the eye-icon toggle on every
 * password field in the app (login, register's password/confirmPassword,
 * Settings' current/new/confirm password). Centralizes the input `type` and
 * icon-name derivation so each field only wires the signal, not its own
 * copy of the same three lines. */
export function createPasswordVisibility() {
  const visible = signal(false);
  return {
    visible,
    type: computed(() => (visible() ? 'text' : 'password')),
    iconName: computed(() => (visible() ? 'eye-off-outline' : 'eye-outline')),
    toggle(): void {
      visible.update((v) => !v);
    },
  };
}
