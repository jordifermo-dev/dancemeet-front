import { AbstractControl, ValidationErrors, ValidatorFn } from '@angular/forms';

/** At least 8 characters, one uppercase, one lowercase, one digit and one
 * special character - shared by every flow that sets a password (register,
 * change password in Settings) so the app's own account never ends up
 * weaker than what the UI enforces. Mirrors the Firebase Authentication
 * Password Policy (Authentication > Settings > Password policy, "Exigir
 * aplicación") so a password accepted here is never rejected server-side,
 * and vice versa. Firebase's own hosted "forgot password" reset page isn't
 * covered by this (it's Firebase's own UI, outside the app), but is already
 * enforced there directly by that same Password Policy.
 *
 * The special-character class is deliberately narrowed to Firebase's own
 * "allowedNonAlphanumericCharacters" set (^ $ * . [ ] { } ( ) ? " ! @ # % &
 * / \ , > < ' : ; | _ ~) instead of "any non-alphanumeric character" - a
 * symbol outside that set (e.g. "+") passes a looser regex here but is then
 * rejected server-side by Firebase's own policy enforcement, which is a
 * confusing "it passed validation but still failed" experience. */
export const STRONG_PASSWORD_PATTERN =
  // eslint-disable-next-line no-useless-escape
  /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[\^$*.\[\]{}()?"!@#%&/\\,><':;|_~]).{8,}$/;

/** Parameterized so both register.page.ts ('password'/'confirmPassword')
 * and settings.page.ts ('newPassword'/'confirmNewPassword') can share one
 * implementation instead of each declaring their own copy. */
export function passwordsMatchValidator(passwordKey: string, confirmKey: string): ValidatorFn {
  return (control: AbstractControl): ValidationErrors | null => {
    const password = control.get(passwordKey)?.value;
    const confirm = control.get(confirmKey)?.value;
    return password && confirm && password !== confirm ? { passwordsMismatch: true } : null;
  };
}
