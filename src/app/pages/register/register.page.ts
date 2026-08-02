import { Component, OnInit, inject, signal, computed } from '@angular/core';
import {
  AbstractControl,
  FormBuilder,
  ReactiveFormsModule,
  ValidationErrors,
  Validators,
} from '@angular/forms';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { Router } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import {
  IonContent,
  IonButton,
  IonIcon,
  IonItem,
  IonInput,
  IonSearchbar,
  IonCheckbox,
  IonRange,
  IonText,
} from '@ionic/angular/standalone';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { addIcons } from 'ionicons';
import {
  chevronBack,
  locateOutline,
  locationOutline,
  eyeOutline,
  eyeOffOutline,
  addOutline,
  removeOutline,
  layersOutline,
} from 'ionicons/icons';
import { AuthService } from '../../services/auth.service';
import { OnboardingService } from '../../services/onboarding.service';
import { UserService } from '../../services/user.service';
import { DisciplineService } from '../../services/discipline.service';
import { EventTypeService } from '../../services/event-type.service';
import { LanguageService } from '../../services/language.service';
import { CitySuggestion, GeocodingService } from '../../services/geocoding.service';
import { CreateUserPayload, Discipline, DISCIPLINE_NAMES, EventType, EVENT_TYPE_NAMES } from '../../models';
import { firebaseErrorMessage } from '../../shared/firebase-error-message';
import { DISCIPLINE_ICON_FILES, disciplineIconUrl, eventTypeIconUrl, sortByNameOrder } from '../../shared/icon-catalog';
import { MapType, mapEmbedUrl as buildMapEmbedUrl } from '../../shared/maps';

const MIN_ZOOM = 3;
const MAX_ZOOM = 20;

const FALLBACK_DISCIPLINES: Discipline[] = DISCIPLINE_NAMES.map((name) => ({
  id: `local-${name}`,
  name,
  color: '#7c3aed',
  iconUrl: `assets/icons/disciplines/${DISCIPLINE_ICON_FILES[name]}`,
  createdAt: 0,
}));

const FALLBACK_EVENT_TYPES: EventType[] = EVENT_TYPE_NAMES.map((name) => ({
  id: `local-${name}`,
  name,
  createdAt: 0,
}));

function passwordsMatchValidator(control: AbstractControl): ValidationErrors | null {
  const password = control.get('password')?.value;
  const confirmPassword = control.get('confirmPassword')?.value;
  return password && confirmPassword && password !== confirmPassword
    ? { passwordsMismatch: true }
    : null;
}

@Component({
  selector: 'app-register',
  standalone: true,
  templateUrl: 'register.page.html',
  styleUrls: ['register.page.scss'],
  imports: [
    ReactiveFormsModule,
    IonContent,
    IonButton,
    IonIcon,
    IonItem,
    IonInput,
    IonSearchbar,
    IonCheckbox,
    IonRange,
    IonText,
    TranslatePipe,
  ],
})
export class RegisterPage implements OnInit {
  private readonly fb = inject(FormBuilder);
  private readonly authService = inject(AuthService);
  private readonly onboarding = inject(OnboardingService);
  private readonly userService = inject(UserService);
  private readonly disciplineService = inject(DisciplineService);
  private readonly eventTypeService = inject(EventTypeService);
  private readonly languageService = inject(LanguageService);
  private readonly geocodingService = inject(GeocodingService);
  private readonly translate = inject(TranslateService);
  private readonly router = inject(Router);
  private readonly sanitizer = inject(DomSanitizer);
  private cityInputTimer: ReturnType<typeof setTimeout> | null = null;

  readonly totalSteps = 5;
  readonly currentStep = signal(0);
  readonly stepIndicators = Array.from({ length: this.totalSteps });

  readonly accountForm = this.fb.nonNullable.group(
    {
      name: ['', [Validators.required, Validators.minLength(2)]],
      email: ['', [Validators.required, Validators.email]],
      password: ['', [Validators.required, Validators.minLength(6)]],
      confirmPassword: ['', [Validators.required]],
    },
    { validators: [passwordsMatchValidator] },
  );

  readonly editAddress = signal('');
  readonly editCity = signal('');

  readonly distanceRange = signal(25);
  readonly latitude = signal<number | null>(null);
  readonly longitude = signal<number | null>(null);
  readonly locatingMe = signal(false);

  readonly citySuggestions = signal<CitySuggestion[]>([]);

  readonly zoomLevel = signal(15);
  readonly mapType = signal<MapType>('roadmap');

  readonly mapEmbedUrl = computed<SafeResourceUrl | null>(() => {
    const lat = this.latitude();
    const lng = this.longitude();
    if (lat === null || lng === null) {
      return null;
    }
    const url = buildMapEmbedUrl(lat, lng, this.zoomLevel(), this.mapType());
    return this.sanitizer.bypassSecurityTrustResourceUrl(url);
  });

  readonly disciplines = signal<Discipline[]>(FALLBACK_DISCIPLINES);
  readonly selectedDisciplineIds = signal<string[]>([]);

  readonly eventTypes = signal<EventType[]>(FALLBACK_EVENT_TYPES);
  readonly selectedEventTypeIds = signal<string[]>([]);

  readonly acceptedTerms = signal(false);
  readonly isSubmitting = signal(false);
  readonly errorMessage = signal<string | null>(null);

  readonly showPassword = signal(false);
  readonly showConfirmPassword = signal(false);

  readonly disciplineIconUrl = disciplineIconUrl;
  readonly eventTypeIconUrl = eventTypeIconUrl;

  constructor() {
    addIcons({
      chevronBack,
      locateOutline,
      locationOutline,
      eyeOutline,
      eyeOffOutline,
      addOutline,
      removeOutline,
      layersOutline,
    });
  }

  ngOnInit(): void {
    this.disciplineService.getAll().subscribe({
      next: (disciplines) => {
        if (disciplines.length) {
          this.disciplines.set(sortByNameOrder(disciplines, DISCIPLINE_NAMES));
        }
      },
    });
    this.eventTypeService.getAll().subscribe({
      next: (eventTypes) => {
        if (eventTypes.length) {
          this.eventTypes.set(sortByNameOrder(eventTypes, EVENT_TYPE_NAMES));
        }
      },
    });
  }

  zoomIn(): void {
    this.zoomLevel.update((zoom) => Math.min(MAX_ZOOM, zoom + 1));
  }

  zoomOut(): void {
    this.zoomLevel.update((zoom) => Math.max(MIN_ZOOM, zoom - 1));
  }

  toggleMapType(): void {
    this.mapType.update((type) => (type === 'roadmap' ? 'satellite' : 'roadmap'));
  }

  get canGoNext(): boolean {
    switch (this.currentStep()) {
      case 0:
        return this.accountForm.valid;
      case 1:
        return this.selectedDisciplineIds().length > 0;
      case 2:
        return this.selectedEventTypeIds().length > 0;
      case 3:
        return !!this.editAddress() && !!this.editCity();
      default:
        return true;
    }
  }

  togglePasswordVisibility(): void {
    this.showPassword.update((value) => !value);
  }

  toggleConfirmPasswordVisibility(): void {
    this.showConfirmPassword.update((value) => !value);
  }

  goBack(): void {
    if (this.currentStep() === 0) {
      this.router.navigateByUrl('/login');
      return;
    }
    this.currentStep.update((step) => step - 1);
  }

  goNext(): void {
    if (!this.canGoNext) {
      return;
    }
    this.currentStep.update((step) => Math.min(step + 1, this.totalSteps - 1));
  }

  toggleDiscipline(id: string): void {
    this.selectedDisciplineIds.update((ids) =>
      ids.includes(id) ? ids.filter((existing) => existing !== id) : [...ids, id],
    );
  }

  toggleEventType(id: string): void {
    this.selectedEventTypeIds.update((ids) =>
      ids.includes(id) ? ids.filter((existing) => existing !== id) : [...ids, id],
    );
  }

  onDistanceChange(event: Event): void {
    const value = (event as CustomEvent<{ value: number }>).detail.value;
    this.distanceRange.set(value);
  }

  useCurrentLocation(): void {
    if (!navigator.geolocation) {
      this.errorMessage.set(this.translate.instant('register.geolocationNotSupported'));
      return;
    }
    this.locatingMe.set(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const lat = position.coords.latitude;
        const lng = position.coords.longitude;
        this.latitude.set(lat);
        this.longitude.set(lng);
        this.citySuggestions.set([]);
        // Reverse-geocode so a real address/city gets written to the DB, not a
        // generic "current location" placeholder - falls back to that placeholder
        // only if the geocoding backend is unreachable/misconfigured.
        this.geocodingService.reverse(lat, lng).subscribe({
          next: (result) => {
            this.editAddress.set(result?.formattedAddress ?? this.translate.instant('register.currentLocationValue'));
            this.editCity.set(result?.city ?? this.translate.instant('register.currentLocationValue'));
            this.locatingMe.set(false);
          },
          error: () => {
            this.editAddress.set(this.translate.instant('register.currentLocationValue'));
            this.editCity.set(this.translate.instant('register.currentLocationValue'));
            this.locatingMe.set(false);
          },
        });
      },
      () => {
        this.locatingMe.set(false);
        this.errorMessage.set(this.translate.instant('register.geolocationFailed'));
      },
    );
  }

  /** Debounced Google Places suggestions as the user types an address manually. */
  onLocationInput(value: string | null | undefined): void {
    const query = (value ?? '').trim();
    this.editAddress.set(value ?? '');
    if (this.cityInputTimer) {
      clearTimeout(this.cityInputTimer);
    }
    if (query.length < 2) {
      this.citySuggestions.set([]);
      return;
    }
    this.cityInputTimer = setTimeout(() => {
      this.geocodingService.search(query, 'address').subscribe({
        next: (suggestions) => this.citySuggestions.set(suggestions),
        error: () => this.citySuggestions.set([]),
      });
    }, 300);
  }

  selectLocationSuggestion(suggestion: CitySuggestion): void {
    this.citySuggestions.set([]);
    this.geocodingService.place(suggestion.placeId).subscribe({
      next: (result) => {
        if (!result) {
          return;
        }
        this.editAddress.set(result.formattedAddress);
        this.editCity.set(result.city);
        this.latitude.set(result.latitude);
        this.longitude.set(result.longitude);
      },
    });
  }

  async submit(): Promise<void> {
    if (!this.acceptedTerms() || this.isSubmitting()) {
      return;
    }

    const account = this.accountForm.getRawValue();

    this.isSubmitting.set(true);
    this.errorMessage.set(null);

    try {
      await this.authService.registerWithEmail(account.email.trim(), account.password);
    } catch (err) {
      this.isSubmitting.set(false);
      this.errorMessage.set(firebaseErrorMessage(err, this.translate));
      return;
    }

    const payload: CreateUserPayload = {
      name: account.name.trim(),
      email: account.email.trim(),
      address: this.editAddress().trim(),
      city: this.editCity().trim(),
      latitude: this.latitude() ?? 0,
      longitude: this.longitude() ?? 0,
      distanceRange: this.distanceRange(),
      disabledNotificationTypes: [],
      disciplineIds: this.selectedDisciplineIds(),
      eventTypeIds: this.selectedEventTypeIds(),
      // The status step was removed from registration - every new account starts
      // with only "Published" events visible, matching the previous default choice.
      statusIds: ['published'],
      language: this.languageService.currentLang() ?? undefined,
    };

    try {
      const user = await firstValueFrom(this.userService.createUser(payload));
      this.authService.syncProfile(user);
      this.onboarding.maybeShowWelcome();
      this.router.navigateByUrl('/tabs/explorer');
    } catch (err: any) {
      this.errorMessage.set(
        err?.error?.message ?? this.translate.instant('register.registrationFailed'),
      );
    } finally {
      this.isSubmitting.set(false);
    }
  }
}
