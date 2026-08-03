import { AfterViewInit, Component, OnInit, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import {
  IonContent,
  IonButton,
  IonIcon,
  IonItem,
  IonInput,
  IonText,
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
} from 'ionicons/icons';
import { AuthService, AuthProvider } from '../../services/auth.service';
import { OnboardingService } from '../../services/onboarding.service';
import { firebaseErrorMessage } from '../../shared/firebase-error-message';

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
    IonItem,
    IonInput,
    IonText,
    TranslatePipe,
  ],
})
export class LoginPage implements OnInit, AfterViewInit {
  private readonly fb = inject(FormBuilder);
  private readonly authService = inject(AuthService);
  private readonly onboarding = inject(OnboardingService);
  private readonly translate = inject(TranslateService);
  private readonly router = inject(Router);

  readonly showEmailForm = signal(false);
  readonly showPassword = signal(false);
  readonly isSubmitting = signal(false);
  readonly errorMessage = signal<string | null>(null);

  readonly emailForm = this.fb.nonNullable.group({
    email: ['', [Validators.required, Validators.email]],
    password: ['', [Validators.required, Validators.minLength(6)]],
  });

  constructor() {
    addIcons({ logoGoogle, logoApple, logoMicrosoft, mailOutline, eyeOutline, eyeOffOutline });
  }

  async ngOnInit(): Promise<void> {
    this.emailForm.reset({ email: '', password: '' });

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
      this.router.navigateByUrl('/tabs/explorer');
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

  togglePasswordVisibility(): void {
    this.showPassword.update((value) => !value);
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
      this.router.navigateByUrl('/tabs/explorer');
    } catch (err) {
      this.errorMessage.set(firebaseErrorMessage(err, this.translate));
    } finally {
      this.isSubmitting.set(false);
    }
  }
}
