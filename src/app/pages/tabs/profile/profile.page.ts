import { Component, OnInit, computed, effect, inject, signal, untracked } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import {
  IonHeader,
  IonToolbar,
  IonTitle,
  IonButtons,
  IonContent,
  IonButton,
  IonIcon,
  IonItem,
  IonInput,
  IonModal,
  ViewWillEnter,
} from '@ionic/angular/standalone';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { addIcons } from 'ionicons';
import {
  personOutline,
  settingsOutline,
  eyeOutline,
  eyeOffOutline,
  trashOutline,
  addCircleOutline,
  refreshOutline,
  checkmarkOutline,
  informationCircleOutline,
  gridOutline,
  cameraOutline,
} from 'ionicons/icons';
import { AuthService } from '../../../services/core/auth.service';
import { UserService } from '../../../services/user/user.service';
import { DisciplineService } from '../../../services/event/discipline.service';
import { EventTypeService } from '../../../services/event/event-type.service';
import { FavoriteService } from '../../../services/favorites/favorite.service';
import { GalleryService } from '../../../services/gallery/gallery.service';
import { AppLanguage, LanguageService, SUPPORTED_LANGUAGES } from '../../../services/core/language.service';
import { CitySuggestion, GeocodingService } from '../../../services/location/geocoding.service';
import { ComponentWithUnsavedChanges } from '../../../guards/unsaved-changes.guard';
import { MinSelectionWarningService } from '../../../shared/filters/min-selection-warning.service';
import { toggleWithMinimum } from '../../../shared/filters/min-selection';
import {
  Discipline,
  DISCIPLINE_NAMES,
  EventType,
  EVENT_TYPE_NAMES,
  EventStatus,
  EVENT_STATUSES,
  GalleryPhotoWithEvent,
  PriceOption,
  RelationOption,
  UpdateUserPayload,
  User,
} from '../../../models';
import { DISCIPLINE_ICON_FILES, SocialIconKey, socialIconUrl, sortByNameOrder, STATUS_LABEL_KEYS } from '../../../shared/event/icon-catalog';
import { MapType } from '../../../shared/location/maps';
import { LocationPickerComponent } from '../../../shared/location/location-picker/location-picker.component';
import { PhotoEditorComponent } from '../../../shared/user/photo-editor/photo-editor.component';
import { PhotoGridComponent } from '../../../shared/gallery/photo-grid/photo-grid.component';
import { LightboxPhoto, PhotoLightboxComponent } from '../../../shared/gallery/photo-lightbox/photo-lightbox.component';
import { NotificationBellComponent } from '../../../shared/notifications/notification-bell/notification-bell.component';
import { FilterSheetHeaderComponent } from '../../../shared/filters/filter-sheet-header/filter-sheet-header.component';
import { FilterActionsRowComponent } from '../../../shared/filters/filter-actions-row/filter-actions-row.component';
import { ChipGridComponent, ChipGridItem } from '../../../shared/filters/chip-grid/chip-grid.component';
import {
  disciplineChipItems,
  eventTypeChipItems,
  optionChipItems,
  priceChipItems,
  statusChipItems,
} from '../../../shared/filters/chip-grid/chip-grid-presets';
import { normalizeSocialUrl, SOCIAL_URL_PATTERNS, SOCIAL_URL_PREFIXES } from '../../../shared/user/social-link-patterns';
import { createSuccessFlash } from '../../../shared/common/success-flash';
import {
  ALL_SOCIAL_NETWORKS,
  SOCIAL_NETWORK_ERROR_KEYS,
  SOCIAL_NETWORK_LABEL_KEYS,
  SocialNetworkKey,
} from '../../../shared/user/social-networks';

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

const STATUS_OPTIONS = EVENT_STATUSES.map((id) => ({ id, labelKey: STATUS_LABEL_KEYS[id] }));

const PRICE_OPTIONS: { id: PriceOption; labelKey: string }[] = [
  { id: 'free', labelKey: 'explorer.priceFreeOption' },
  { id: 'paid', labelKey: 'explorer.pricePaidOption' },
];

const RELATION_OPTIONS: { id: RelationOption; labelKey: string }[] = [
  { id: 'attendee', labelKey: 'favorites.relationAttendee' },
  { id: 'organizer', labelKey: 'favorites.relationOrganizer' },
];

// Shown in each language's own native form (as in Google Translate's picker), not translated.
const LANGUAGE_NATIVE_NAMES: Record<AppLanguage, string> = {
  es: 'Español',
  ca: 'Català',
  en: 'English',
};
const LANGUAGE_OPTIONS = SUPPORTED_LANGUAGES.map((code) => ({
  code,
  label: LANGUAGE_NATIVE_NAMES[code],
}));

@Component({
  selector: 'app-profile',
  standalone: true,
  templateUrl: 'profile.page.html',
  styleUrls: ['profile.page.scss'],
  imports: [
    ReactiveFormsModule,
    RouterLink,
    IonHeader,
    IonToolbar,
    IonTitle,
    IonButtons,
    IonContent,
    IonButton,
    IonIcon,
    IonItem,
    IonInput,
    IonModal,
    TranslatePipe,
    PhotoEditorComponent,
    NotificationBellComponent,
    FilterSheetHeaderComponent,
    FilterActionsRowComponent,
    ChipGridComponent,
    LocationPickerComponent,
    PhotoGridComponent,
    PhotoLightboxComponent,
  ],
})
export class ProfilePage implements OnInit, ViewWillEnter, ComponentWithUnsavedChanges {
  private readonly fb = inject(FormBuilder);
  private readonly authService = inject(AuthService);
  private readonly userService = inject(UserService);
  private readonly disciplineService = inject(DisciplineService);
  private readonly eventTypeService = inject(EventTypeService);
  private readonly favoriteService = inject(FavoriteService);
  private readonly galleryService = inject(GalleryService);
  private readonly languageService = inject(LanguageService);
  private readonly geocodingService = inject(GeocodingService);
  private readonly translate = inject(TranslateService);
  private readonly router = inject(Router);
  readonly minSelectionWarning = inject(MinSelectionWarningService);
  private cityInputTimer: ReturnType<typeof setTimeout> | null = null;

  /** Snapshot of the last loaded/saved draft, used to detect unsaved edits. */
  private baseline: string | null = null;

  readonly currentUser = this.authService.currentUser;
  readonly draftLanguage = signal<AppLanguage>('es');
  readonly languageOptions = LANGUAGE_OPTIONS;

  readonly followersCount = computed(() => this.currentUser()?.followedId?.length ?? 0);
  readonly followingCount = computed(() => this.currentUser()?.followingId?.length ?? 0);
  readonly attendedEventsCount = signal(0);

  // --- Instagram-style info/gallery toggle -----------------------------

  readonly detailViewMode = signal<'info' | 'gallery'>('info');
  readonly profileGallery = signal<GalleryPhotoWithEvent[]>([]);

  readonly galleryGridItems = computed(() => this.profileGallery().map((photo) => ({ id: photo.id, photoUrl: photo.photoUrl })));

  readonly lightboxItems = computed<LightboxPhoto[]>(() =>
    this.profileGallery().map((photo) => ({
      id: photo.id,
      photoUrl: photo.photoUrl,
      // Absent for a photo posted straight to the profile - no event to link to.
      relatedLinkRoute: photo.eventId ? ['/events', photo.eventId] : undefined,
      relatedLinkLabel: photo.eventTitle,
    })),
  );

  readonly lightboxOpen = signal(false);
  readonly lightboxStartIndex = signal(0);

  openLightbox(photoId: string): void {
    const index = this.profileGallery().findIndex((photo) => photo.id === photoId);
    if (index === -1) {
      return;
    }
    this.lightboxStartIndex.set(index);
    this.lightboxOpen.set(true);
  }

  private refreshGallery(userId: string): void {
    this.galleryService.getUserGallery(userId).subscribe({
      next: (photos) => this.profileGallery.set(photos),
      error: () => this.profileGallery.set([]),
    });
  }

  onGalleryPhotoUploaded(url: string): void {
    const user = this.currentUser();
    if (!user) {
      return;
    }
    this.galleryService.postProfilePhoto(user.id, url).subscribe({
      next: () => this.refreshGallery(user.id),
    });
  }

  readonly accountForm = this.fb.nonNullable.group({
    name: [''],
    phone: [''],
    socialLinks: this.fb.nonNullable.group({
      instagram: ['', Validators.pattern(SOCIAL_URL_PATTERNS.instagram)],
      facebook: ['', Validators.pattern(SOCIAL_URL_PATTERNS.facebook)],
      tiktok: ['', Validators.pattern(SOCIAL_URL_PATTERNS.tiktok)],
      youtube: ['', Validators.pattern(SOCIAL_URL_PATTERNS.youtube)],
      website: [''],
      whatsapp: ['', Validators.pattern(SOCIAL_URL_PATTERNS.whatsapp)],
      pinterest: ['', Validators.pattern(SOCIAL_URL_PATTERNS.pinterest)],
    }),
  });

  readonly editAddress = signal('');
  readonly editCity = signal('');

  readonly distanceRange = signal(25);
  readonly latitude = signal<number | null>(null);
  readonly longitude = signal<number | null>(null);

  readonly zoomLevel = signal(15);
  readonly mapType = signal<MapType>('roadmap');
  readonly addressLine = computed(() => (this.editCity() ? `${this.editAddress()}, ${this.editCity()}` : null));
  readonly locatingMe = signal(false);
  readonly citySuggestions = signal<CitySuggestion[]>([]);

  readonly disciplines = signal<Discipline[]>(FALLBACK_DISCIPLINES);
  readonly selectedDisciplineIds = signal<string[]>([]);

  readonly eventTypes = signal<EventType[]>(FALLBACK_EVENT_TYPES);
  readonly selectedEventTypeIds = signal<string[]>([]);

  readonly statusOptions = STATUS_OPTIONS;
  readonly selectedStatusIds = signal<string[]>([]);

  readonly priceOptions = PRICE_OPTIONS;
  readonly selectedPriceOptions = signal<PriceOption[]>([]);

  readonly relationOptions = RELATION_OPTIONS;
  readonly selectedRelationTypes = signal<RelationOption[]>([]);

  readonly eventTypeChips = computed(() => eventTypeChipItems(this.eventTypes(), this.selectedEventTypeIds()));
  readonly disciplineChips = computed(() => disciplineChipItems(this.disciplines(), this.selectedDisciplineIds()));
  readonly statusChips = computed(() => statusChipItems(this.statusOptions, this.selectedStatusIds() as EventStatus[]));
  readonly priceChips = computed(() => priceChipItems(this.priceOptions, this.selectedPriceOptions()));
  readonly relationChips = computed(() => optionChipItems(this.relationOptions, this.selectedRelationTypes()));
  readonly languageChips = computed<ChipGridItem[]>(() =>
    this.languageOptions.map((lang) => ({
      id: lang.code,
      label: lang.label,
      selected: this.draftLanguage() === lang.code,
    })),
  );

  readonly showEmail = signal(false);
  readonly showPhone = signal(false);
  readonly showLocation = signal(false);

  /** Only networks with a saved link (or just added this session) render
   * their own field - see openAddSocialSheet()/addSocialNetwork() for how a
   * network moves from the picker sheet into this list. */
  readonly activeSocialNetworks = signal<SocialNetworkKey[]>([]);
  readonly availableSocialNetworks = computed(() =>
    ALL_SOCIAL_NETWORKS.filter((key) => !this.activeSocialNetworks().includes(key)),
  );
  readonly showAddSocialSheet = signal(false);

  readonly isSaving = signal(false);
  readonly savedFlash = createSuccessFlash();

  readonly showUnsavedChangesModal = signal(false);
  private pendingLeaveResolve: (() => void) | null = null;
  private pendingLeaveApplied = false;

  constructor() {
    addIcons({
      personOutline,
      settingsOutline,
      eyeOutline,
      eyeOffOutline,
      trashOutline,
      addCircleOutline,
      refreshOutline,
      checkmarkOutline,
      informationCircleOutline,
      gridOutline,
      cameraOutline,
    });

    // The draft must always track *whoever is currently authenticated*, not
    // whatever a previous ionViewWillEnter happened to load: relying on the
    // lifecycle hook alone left a previous user's edited-but-unsaved fields
    // visible after logging out and back in as someone else. Reacting to the
    // signal directly closes that gap regardless of when/whether the hook fires.
    // populateFromUser/resetToEmpty also *read* the draft signals (to build the
    // dirty-checking baseline) - wrapping that in untracked() keeps this effect
    // scoped to currentUser only. Without it, editing any draft field (chips,
    // toggles...) would re-trigger this same effect and immediately revert the
    // edit back to the last-loaded value.
    effect(() => {
      const user = this.currentUser();
      untracked(() => {
        if (user) {
          this.populateFromUser(user);
        } else {
          this.resetToEmpty();
        }
      });
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

  contactIconUrl(name: SocialIconKey): string {
    return socialIconUrl(name);
  }

  socialNetworkLabelKey(key: SocialNetworkKey): string {
    return SOCIAL_NETWORK_LABEL_KEYS[key];
  }

  socialNetworkErrorKey(key: SocialNetworkKey): string | null {
    return SOCIAL_NETWORK_ERROR_KEYS[key] ?? null;
  }

  openAddSocialSheet(): void {
    this.showAddSocialSheet.set(true);
  }

  closeAddSocialSheet(): void {
    this.showAddSocialSheet.set(false);
  }

  /** Pre-fills the domain part (e.g. "https://instagram.com/") so the user
   * only has to type their handle after it - setValue (not patchValue) keeps
   * the control pristine/untouched, so this doesn't trip the field into an
   * "invalid, must be an instagram.com link" state before anyone's typed
   * anything. */
  addSocialNetwork(key: SocialNetworkKey): void {
    this.activeSocialNetworks.update((keys) => (keys.includes(key) ? keys : [...keys, key]));
    const control = this.accountForm.controls.socialLinks.controls[key];
    const prefix = SOCIAL_URL_PREFIXES[key];
    if (prefix && !control.value) {
      control.setValue(prefix);
    }
    this.showAddSocialSheet.set(false);
  }

  /** Clears the field's value (not just hides it) - otherwise a removed-then-
   * unsaved link would silently come back on the next save. */
  removeSocialNetwork(key: SocialNetworkKey): void {
    this.accountForm.controls.socialLinks.controls[key].reset('');
    this.activeSocialNetworks.update((keys) => keys.filter((k) => k !== key));
  }

  /** Reduces a pasted full URL (e.g. "https://www.instagram.com/nick" typed
   * or pasted over the pre-filled prefix) back down to "prefix + handle" -
   * see normalizeSocialUrl's own doc comment for what it does and doesn't
   * catch. Runs on blur rather than every keystroke so it never fights an
   * actively-typing cursor. */
  onSocialUrlBlur(key: SocialNetworkKey): void {
    const control = this.accountForm.controls.socialLinks.controls[key];
    const normalized = normalizeSocialUrl(key, control.value);
    if (normalized !== control.value) {
      control.setValue(normalized);
    }
  }

  private populateFromUser(user: User): void {
    this.accountForm.reset({
      name: user.name ?? '',
      phone: user.phone ?? '',
      socialLinks: {
        instagram: user.socialLinks?.instagram ?? '',
        facebook: user.socialLinks?.facebook ?? '',
        tiktok: user.socialLinks?.tiktok ?? '',
        youtube: user.socialLinks?.youtube ?? '',
        website: user.socialLinks?.website ?? '',
        whatsapp: user.socialLinks?.whatsapp ?? '',
        pinterest: user.socialLinks?.pinterest ?? '',
      },
    });
    this.editAddress.set(user.address ?? '');
    this.editCity.set(user.city ?? '');
    this.distanceRange.set(user.distanceRange ?? 25);
    this.latitude.set(user.latitude ?? null);
    this.longitude.set(user.longitude ?? null);
    // Defensive: a legacy profile missing one of these arrays must not throw
    // and abort the rest of this function - that used to leave baseline unset
    // (breaking the unsaved-changes popup) and later fields (statusIds,
    // language) stuck on whatever draft value was there before.
    this.selectedDisciplineIds.set([...(user.disciplineIds ?? [])]);
    this.selectedEventTypeIds.set([...(user.eventTypeIds ?? [])]);
    this.selectedStatusIds.set([...(user.statusIds ?? [])]);
    this.selectedPriceOptions.set([...(user.priceOptions ?? [])]);
    this.selectedRelationTypes.set([...(user.relationTypes ?? [])]);
    this.activeSocialNetworks.set(ALL_SOCIAL_NETWORKS.filter((key) => !!user.socialLinks?.[key]));
    this.showEmail.set(user.showEmail ?? false);
    this.showPhone.set(user.showPhone ?? false);
    this.showLocation.set(user.showCity || user.showLocation || false);
    this.draftLanguage.set((user.language as AppLanguage) ?? this.languageService.currentLang() ?? 'es');

    this.attendedEventsCount.set(0);
    // Count organizer + attendee events, matching exactly what user-events
    // (the list this stat links to) shows - counting only attendee records
    // here made the number smaller than the list underneath it for anyone
    // who also organizes events.
    this.favoriteService.getFavoritedEvents(user.id).subscribe({
      next: (events) => this.attendedEventsCount.set(events.length),
    });
    this.refreshGallery(user.id);

    this.baseline = this.buildSnapshot();
  }

  private resetToEmpty(): void {
    this.accountForm.reset({
      name: '',
      phone: '',
      socialLinks: { instagram: '', facebook: '', tiktok: '', youtube: '', website: '', whatsapp: '', pinterest: '' },
    });
    this.editAddress.set('');
    this.editCity.set('');
    this.distanceRange.set(25);
    this.latitude.set(null);
    this.longitude.set(null);
    this.selectedDisciplineIds.set([]);
    this.selectedEventTypeIds.set([]);
    this.selectedStatusIds.set([]);
    this.selectedPriceOptions.set([]);
    this.selectedRelationTypes.set([]);
    this.activeSocialNetworks.set([]);
    this.showEmail.set(false);
    this.showPhone.set(false);
    this.showLocation.set(false);
    this.draftLanguage.set((this.languageService.currentLang() as AppLanguage) ?? 'es');
    this.attendedEventsCount.set(0);

    this.baseline = this.buildSnapshot();
  }

  /** Serializes the current draft so it can be compared against `baseline` to detect unsaved edits. */
  private buildSnapshot(): string {
    const account = this.accountForm.getRawValue();
    return JSON.stringify({
      name: account.name,
      phone: account.phone,
      socialLinks: account.socialLinks,
      address: this.editAddress(),
      city: this.editCity(),
      distanceRange: this.distanceRange(),
      latitude: this.latitude(),
      longitude: this.longitude(),
      disciplineIds: [...this.selectedDisciplineIds()].sort(),
      eventTypeIds: [...this.selectedEventTypeIds()].sort(),
      statusIds: [...this.selectedStatusIds()].sort(),
      priceOptions: [...this.selectedPriceOptions()].sort(),
      relationTypes: [...this.selectedRelationTypes()].sort(),
      activeSocialNetworks: [...this.activeSocialNetworks()].sort(),
      language: this.draftLanguage(),
      showEmail: this.showEmail(),
      showPhone: this.showPhone(),
      showLocation: this.showLocation(),
    });
  }

  private isDirty(): boolean {
    return this.baseline !== null && this.buildSnapshot() !== this.baseline;
  }

  private discardChanges(): void {
    const user = this.currentUser();
    if (user) {
      this.populateFromUser(user);
    } else {
      this.resetToEmpty();
    }
  }

  /** Ionic keeps tab pages alive, so re-sync the draft from the profile every time this tab is entered. */
  ionViewWillEnter(): void {
    const user = this.currentUser();
    if (user) {
      this.populateFromUser(user);
    }
  }

  /** Invoked by the unsavedChangesGuard before navigating away from this tab. */
  async canLeave(): Promise<boolean> {
    if (!this.isDirty()) {
      return true;
    }

    this.pendingLeaveApplied = false;
    this.showUnsavedChangesModal.set(true);
    // Waits for (didDismiss), not the button click itself - the sheet must be fully
    // closed before navigation proceeds, otherwise Ionic hides this tab mid-animation
    // and leaves the overlay stuck on screen, swallowing every tap in the app.
    await new Promise<void>((resolve) => {
      this.pendingLeaveResolve = resolve;
    });
    return true;
  }

  confirmDiscardChanges(): void {
    this.pendingLeaveApplied = false;
    this.showUnsavedChangesModal.set(false);
  }

  confirmApplyChanges(): void {
    this.pendingLeaveApplied = true;
    this.showUnsavedChangesModal.set(false);
  }

  /** Fires once the sheet has fully closed (button tap, swipe-down or backdrop tap alike). */
  async onUnsavedChangesModalDismiss(): Promise<void> {
    if (this.pendingLeaveApplied) {
      await this.save();
    } else {
      this.discardChanges();
    }
    this.pendingLeaveResolve?.();
    this.pendingLeaveResolve = null;
  }

  toggleDiscipline(id: string): void {
    this.selectedDisciplineIds.update((ids) =>
      toggleWithMinimum(ids, id, () => this.minSelectionWarning.flash('disciplines')),
    );
  }

  toggleEventType(id: string): void {
    this.selectedEventTypeIds.update((ids) =>
      toggleWithMinimum(ids, id, () => this.minSelectionWarning.flash('eventTypes')),
    );
  }

  toggleStatus(id: string): void {
    this.selectedStatusIds.update((ids) =>
      toggleWithMinimum(ids, id, () => this.minSelectionWarning.flash('statuses')),
    );
  }

  togglePriceOption(id: string): void {
    const price = id as PriceOption;
    this.selectedPriceOptions.update((ids) =>
      toggleWithMinimum(ids, price, () => this.minSelectionWarning.flash('priceOptions')),
    );
  }

  toggleRelation(id: string): void {
    const relation = id as RelationOption;
    this.selectedRelationTypes.update((ids) =>
      toggleWithMinimum(ids, relation, () => this.minSelectionWarning.flash('relation')),
    );
  }

  /** Same reasoning as Explorer's clearDisciplines()/clearEventTypes(): an
   * empty selection means "match nothing" everywhere search is built from
   * these, so "Borrar filtros" selects everything instead of nothing. */
  clearAllSelections(): void {
    this.selectedDisciplineIds.set(this.disciplines().map((d) => d.id));
    this.selectedEventTypeIds.set(this.eventTypes().map((e) => e.id));
    this.selectedStatusIds.set([...EVENT_STATUSES]);
    this.selectedPriceOptions.set(this.priceOptions.map((option) => option.id));
    this.selectedRelationTypes.set(this.relationOptions.map((option) => option.id));
  }

  onDistanceChange(value: number): void {
    this.distanceRange.set(value);
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

  /** Reverse-geocode so a real address/city gets written to the DB, not a
   * generic "current location" placeholder - falls back to that placeholder
   * only if the geocoding backend is unreachable/misconfigured. Shared by
   * "use my current location" (GPS) and tapping a pin on the map. */
  private reverseGeocodeTo(lat: number, lng: number): void {
    this.latitude.set(lat);
    this.longitude.set(lng);
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
      return;
    }
    this.locatingMe.set(true);
    navigator.geolocation.getCurrentPosition(
      (position) => this.reverseGeocodeTo(position.coords.latitude, position.coords.longitude),
      () => {
        this.locatingMe.set(false);
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

  setLanguage(lang: string): void {
    // Only a draft choice until Aplicar is pressed - the app's active
    // language only switches once the change is actually persisted below.
    this.draftLanguage.set(lang as AppLanguage);
  }

  async save(): Promise<void> {
    const user = this.currentUser();
    if (!user || this.isSaving() || this.accountForm.invalid) {
      return;
    }

    const account = this.accountForm.getRawValue();

    const payload: UpdateUserPayload = {
      name: account.name.trim(),
      phone: account.phone.trim(),
      socialLinks: account.socialLinks,
      address: this.editAddress().trim(),
      city: this.editCity().trim(),
      latitude: this.latitude() ?? user.latitude,
      longitude: this.longitude() ?? user.longitude,
      distanceRange: this.distanceRange(),
      disciplineIds: this.selectedDisciplineIds(),
      eventTypeIds: this.selectedEventTypeIds(),
      statusIds: this.selectedStatusIds(),
      priceOptions: this.selectedPriceOptions(),
      relationTypes: this.selectedRelationTypes(),
      language: this.draftLanguage(),
      showEmail: this.showEmail(),
      showPhone: this.showPhone(),
      showCity: this.showLocation(),
      showLocation: this.showLocation(),
    };

    this.isSaving.set(true);
    try {
      await firstValueFrom(this.userService.updateUser(user.id, payload));
      // Guards against a slow save from a previous session resolving after a
      // different user has since logged in and clobbering their fresh profile.
      if (this.currentUser()?.id === user.id) {
        this.languageService.setLanguage(this.draftLanguage());
        this.authService.syncProfile({ ...user, ...payload });
        this.savedFlash.trigger();
      }
    } finally {
      this.isSaving.set(false);
    }
  }

  /** Uploads are saved immediately by the backend, so persist photoUrl right
   * away instead of waiting for the next "Guardar" - otherwise a user could
   * navigate away and lose the new avatar even though the file already exists. */
  onPhotoUploaded(photoUrl: string): void {
    const user = this.currentUser();
    if (!user) {
      return;
    }
    this.userService.updateUser(user.id, { photoUrl }).subscribe({
      next: () => this.authService.syncProfile({ ...user, photoUrl }),
    });
  }

  goToEvents(): void {
    this.router.navigateByUrl('/user-events');
  }

  goToFollowers(): void {
    this.router.navigateByUrl('/followers');
  }

  goToFollowing(): void {
    this.router.navigateByUrl('/following');
  }
}
