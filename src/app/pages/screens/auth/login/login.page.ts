import { AfterViewInit, Component, OnInit, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import {
  IonContent,
  IonButton,
  IonIcon,
  IonInput,
  IonText,
  IonModal,
  ViewWillEnter,
} from '@ionic/angular/standalone';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { addIcons } from 'ionicons';
import {
  logoGoogle,
  logoApple,
  logoMicrosoft,
  mailOutline,
  eyeOutline,
  eyeOffOutline,
  logInOutline,
  sendOutline,
  closeOutline,
} from 'ionicons/icons';
import { AuthService, AuthProvider } from '../../../../services/core/auth.service';
import { OnboardingService } from '../../../../services/core/onboarding.service';
import { firebaseErrorMessage } from '../../../../shared/auth/firebase-error-message';
import { createPasswordVisibility } from '../../../../shared/auth/password-visibility';
import { FilterSheetHeaderComponent } from '../../../../shared/filters/filter-sheet-header/filter-sheet-header.component';
import { FilterActionsRowComponent } from '../../../../shared/filters/filter-actions-row/filter-actions-row.component';

@Component({
  selector: 'app-login',
  standalone: true,
  templateUrl: 'login.page.html',
  styleUrls: ['login.page.scss'],
  imports: [
    ReactiveFormsModule,
    RouterLink,
    IonContent,
    IonButton,
    IonIcon,
    IonInput,
    IonText,
    IonModal,
    TranslatePipe,
    FilterSheetHeaderComponent,
    FilterActionsRowComponent,
  ],
})
export class LoginPage implements OnInit, AfterViewInit, ViewWillEnter {
  private readonly fb = inject(FormBuilder);
  private readonly authService = inject(AuthService);
  private readonly onboarding = inject(OnboardingService);
  private readonly translate = inject(TranslateService);
  private readonly router = inject(Router);

  readonly showEmailForm = signal(false);
  readonly showPassword = createPasswordVisibility();
  readonly isSubmitting = signal(false);
  readonly errorMessage = signal<string | null>(null);

  readonly emailForm = this.fb.nonNullable.group({
    email: ['', [Validators.required, Validators.email]],
    password: ['', [Validators.required, Validators.minLength(6)]],
  });

  readonly showForgotPassword = signal(false);
  readonly forgotPasswordSaving = signal(false);
  readonly forgotPasswordSent = signal(false);
  readonly forgotPasswordError = signal<string | null>(null);
  readonly forgotPasswordForm = this.fb.nonNullable.group({
    email: ['', [Validators.required, Validators.email]],
  });

  constructor() {
    addIcons({
      logoGoogle,
      logoApple,
      logoMicrosoft,
      mailOutline,
      eyeOutline,
      eyeOffOutline,
      logInOutline,
      sendOutline,
      closeOutline,
    });
  }

  async ngOnInit(): Promise<void> {
    // Only reachable after a mobile signInWithRedirect came back - a
    // successful one with an existing profile is already routed away from
    // /login by publicGuard before this component even mounts, so anything
    // left to handle here is either an error or a first-time social sign-in.
    await this.authService.authReady;
    if (this.authService.pendingSocialSignup()) {
      this.router.navigateByUrl('/register');
      return;
    }
    const redirectError = this.authService.redirectError();
    if (redirectError) {
      this.errorMessage.set(firebaseErrorMessage(redirectError, this.translate));
      this.authService.redirectError.set(null);
    }
  }

  ngAfterViewInit(): void {
    // Chrome sometimes autofills saved credentials right after the inputs
    // paint, after ngOnInit already ran - clear them again once that's had
    // a chance to happen.
    setTimeout(() => this.emailForm.reset({ email: '', password: '' }), 0);
  }

  /** Ionic keeps this page's instance alive for reuse (IonicRouteStrategy),
   * so ngOnInit only runs once - without this, logging out after a previous
   * email/password login left showEmailForm (and any leftover error/forgot-
   * password state) stuck from that session instead of showing the normal
   * provider-buttons screen again. */
  ionViewWillEnter(): void {
    this.showEmailForm.set(false);
    this.errorMessage.set(null);
    this.emailForm.reset({ email: '', password: '' });
    this.showForgotPassword.set(false);
    this.forgotPasswordSent.set(false);
    this.forgotPasswordError.set(null);
    this.forgotPasswordForm.reset({ email: '' });
  }

  async continueWithProvider(provider: AuthProvider): Promise<void> {
    if (this.isSubmitting()) {
      return;
    }
    this.isSubmitting.set(true);
    this.errorMessage.set(null);
    try {
      await this.authService.loginWithProvider(provider);
      if (this.authService.pendingSocialSignup()) {
        this.router.navigateByUrl('/register');
        return;
      }
      this.onboarding.maybeShowWelcome();
      this.router.navigateByUrl('/tabs/home');
    } catch (err) {
      this.errorMessage.set(firebaseErrorMessage(err, this.translate));
    } finally {
      this.isSubmitting.set(false);
    }
  }

  toggleEmailForm(): void {
    this.errorMessage.set(null);
    this.showEmailForm.update((value) => !value);
  }

  async submitEmail(): Promise<void> {
    if (this.emailForm.invalid || this.isSubmitting()) {
      return;
    }
    const { email, password } = this.emailForm.getRawValue();
    this.isSubmitting.set(true);
    this.errorMessage.set(null);

    try {
      await this.authService.loginWithEmail(email.trim(), password);
      this.onboarding.maybeShowWelcome();
      this.router.navigateByUrl('/tabs/home');
    } catch (err) {
      this.errorMessage.set(firebaseErrorMessage(err, this.translate));
    } finally {
      this.isSubmitting.set(false);
    }
  }

  /** Pre-fills whatever email was already typed into the login form, if
   * any - a small convenience for the common case of realizing mid-typing
   * that the password's been forgotten. */
  openForgotPassword(): void {
    this.forgotPasswordForm.reset({ email: this.emailForm.getRawValue().email ?? '' });
    this.forgotPasswordSent.set(false);
    this.forgotPasswordError.set(null);
    this.showForgotPassword.set(true);
  }

  closeForgotPassword(): void {
    this.showForgotPassword.set(false);
  }

  async submitForgotPassword(): Promise<void> {
    if (this.forgotPasswordForm.invalid || this.forgotPasswordSaving()) {
      return;
    }
    const { email } = this.forgotPasswordForm.getRawValue();
    this.forgotPasswordSaving.set(true);
    this.forgotPasswordError.set(null);
    try {
      await this.authService.resetPassword(email.trim());
      this.forgotPasswordSent.set(true);
    } catch (err) {
      // Same confirmation regardless of whether that email actually has an
      // account - a different message here would let someone probe which
      // addresses are registered.
      if ((err as { code?: string })?.code === 'auth/user-not-found') {
        this.forgotPasswordSent.set(true);
      } else {
        this.forgotPasswordError.set(firebaseErrorMessage(err, this.translate));
      }
    } finally {
      this.forgotPasswordSaving.set(false);
    }
  }
}
