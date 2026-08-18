import { Component, OnInit, inject, signal, computed } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { IonContent, IonButton, IonIcon, IonItem, IonInput, IonCheckbox, IonText } from '@ionic/angular/standalone';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { addIcons } from 'ionicons';
import {
  chevronBack,
  eyeOutline,
  eyeOffOutline,
  checkmarkOutline,
  chevronBackOutline,
  chevronForwardOutline,
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
import { DISCIPLINE_ICON_FILES, sortByNameOrder } from '../../shared/icon-catalog';
import { passwordsMatchValidator, STRONG_PASSWORD_PATTERN } from '../../shared/password-validators';
import { createPasswordVisibility } from '../../shared/password-visibility';
import { MapType } from '../../shared/maps';
import { ChipGridComponent } from '../../shared/chip-grid/chip-grid.component';
import { LocationPickerComponent } from '../../shared/location-picker/location-picker.component';
import { disciplineChipItems, eventTypeChipItems } from '../../shared/chip-grid/chip-grid-presets';

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
    IonCheckbox,
    IonText,
    TranslatePipe,
    ChipGridComponent,
    LocationPickerComponent,
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
  private cityInputTimer: ReturnType<typeof setTimeout> | null = null;

  readonly totalSteps = 5;
  readonly currentStep = signal(0);
  readonly stepIndicators = Array.from({ length: this.totalSteps });

  readonly accountForm = this.fb.nonNullable.group(
    {
      name: ['', [Validators.required, Validators.minLength(2)]],
      email: ['', [Validators.required, Validators.email]],
      password: ['', [Validators.required, Validators.pattern(STRONG_PASSWORD_PATTERN)]],
      confirmPassword: ['', [Validators.required]],
    },
    { validators: [passwordsMatchValidator('password', 'confirmPassword')] },
  );

  /** Set when arriving here via AuthService.pendingSocialSignup (a Google/
   * Apple/Microsoft sign-in with no app profile yet) - the account step
   * becomes just a name confirmation instead of asking for a password, since
   * Firebase already authenticated them. */
  readonly isSocialSignup = signal(false);

  readonly editAddress = signal('');
  readonly editCity = signal('');

  // 50km rather than a narrower default - a brand-new account has no saved
  // filter history yet, and too tight a radius reads as "no events near me"
  // for anyone outside a dense city center (e.g. Lleida).
  readonly distanceRange = signal(50);
  readonly latitude = signal<number | null>(null);
  readonly longitude = signal<number | null>(null);
  readonly locatingMe = signal(false);

  readonly citySuggestions = signal<CitySuggestion[]>([]);

  // Starts wide (shows all of Catalunya around the map's default Barcelona
  // center) since there's no location yet on a fresh register - jumps to a
  // close-up zoom once a real one is picked, in reverseGeocodeTo/
  // selectLocationSuggestion below.
  readonly zoomLevel = signal(8);
  readonly mapType = signal<MapType>('roadmap');

  readonly addressLine = computed(() => (this.editCity() ? `${this.editAddress()}, ${this.editCity()}` : null));

  readonly disciplines = signal<Discipline[]>(FALLBACK_DISCIPLINES);
  readonly selectedDisciplineIds = signal<string[]>([]);

  readonly eventTypes = signal<EventType[]>(FALLBACK_EVENT_TYPES);
  readonly selectedEventTypeIds = signal<string[]>([]);

  readonly disciplineChips = computed(() => disciplineChipItems(this.disciplines(), this.selectedDisciplineIds()));
  readonly eventTypeChips = computed(() => eventTypeChipItems(this.eventTypes(), this.selectedEventTypeIds()));

  readonly acceptedTerms = signal(false);
  readonly isSubmitting = signal(false);
  readonly errorMessage = signal<string | null>(null);

  readonly showPassword = createPasswordVisibility();
  readonly showConfirmPassword = createPasswordVisibility();

  constructor() {
    addIcons({
      chevronBack,
      eyeOutline,
      eyeOffOutline,
      checkmarkOutline,
      chevronBackOutline,
      chevronForwardOutline,
    });
  }

  ngOnInit(): void {
    const socialSignup = this.authService.pendingSocialSignup();
    if (socialSignup) {
      this.isSocialSignup.set(true);
      this.accountForm.patchValue({ name: socialSignup.name, email: socialSignup.email });
      // No password to collect - Firebase already authenticated this person
      // via the provider. Email comes from the verified provider account, so
      // it's not user-editable either.
      this.accountForm.controls.email.disable();
      this.accountForm.controls.password.disable();
      this.accountForm.controls.password.clearValidators();
      this.accountForm.controls.confirmPassword.disable();
      this.accountForm.controls.confirmPassword.clearValidators();
    }

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

  /** The Terms/Privacy links live inside ion-checkbox's own label, which
   * toggles the checkbox on any click within it - without this, tapping a
   * link would also flip acceptedTerms instead of just opening the page.
   * Also takes over the navigation itself: register.termsText's raw <a
   * href="..." target="_blank"> (real anchor markup injected via innerHTML,
   * so no routerLink can attach to it) did a hard reload at that URL instead
   * of an Angular Router navigation, wiping the SPA's history - the back
   * button then had nothing to return to and fell back to defaultHref
   * ("/settings"), which the auth guard bounced to /login since this can
   * happen before the account even exists yet. */
  onTermsTextClick(event: Event): void {
    const target = event.target as HTMLElement;
    if (target.tagName === 'A') {
      event.stopPropagation();
      event.preventDefault();
      const href = target.getAttribute('href');
      if (href) {
        this.router.navigateByUrl(href);
      }
    }
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

  onDistanceChange(value: number): void {
    this.distanceRange.set(value);
  }

  /** Reverse-geocode so a real address/city gets written to the DB, not a
   * generic "current location" placeholder - falls back to that placeholder
   * only if the geocoding backend is unreachable/misconfigured. Shared by
   * "use my current location" (GPS) and tapping a pin on the map. */
  private reverseGeocodeTo(lat: number, lng: number): void {
    this.latitude.set(lat);
    this.longitude.set(lng);
    this.zoomLevel.set(15);
    this.citySuggestions.set([]);
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
  }

  onPinMoved(coords: { lat: number; lng: number }): void {
    this.reverseGeocodeTo(coords.lat, coords.lng);
  }

  useCurrentLocation(): void {
    if (!navigator.geolocation) {
      this.errorMessage.set(this.translate.instant('register.geolocationNotSupported'));
      return;
    }
    this.locatingMe.set(true);
    navigator.geolocation.getCurrentPosition(
      (position) => this.reverseGeocodeTo(position.coords.latitude, position.coords.longitude),
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
        this.zoomLevel.set(15);
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

    if (!this.isSocialSignup()) {
      try {
        await this.authService.registerWithEmail(account.email.trim(), account.password);
      } catch (err) {
        this.isSubmitting.set(false);
        this.errorMessage.set(firebaseErrorMessage(err, this.translate));
        return;
      }
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
      // No registration step for these either - start with everything selected
      // (same "empty means match nothing" reasoning as the other preferences),
      // so a fresh profile isn't silently filtering out free, paid, organized
      // or attended events until the user visits Profile and picks something.
      priceOptions: ['free', 'paid'],
      relationTypes: ['organizer', 'attendee'],
      language: this.languageService.currentLang() ?? undefined,
    };

    try {
      const user = await firstValueFrom(this.userService.createUser(payload));
      this.authService.syncProfile(user);
      this.authService.pendingSocialSignup.set(null);
      this.onboarding.maybeShowWelcome();
      this.router.navigateByUrl('/tabs/home');
    } catch (err: any) {
      this.errorMessage.set(
        err?.error?.message ?? this.translate.instant('register.registrationFailed'),
      );
    } finally {
      this.isSubmitting.set(false);
    }
  }
}
