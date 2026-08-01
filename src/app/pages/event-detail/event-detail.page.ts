import { Location } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import {
  IonHeader,
  IonToolbar,
  IonTitle,
  IonButtons,
  IonBackButton,
  IonContent,
  IonIcon,
  IonButton,
  IonSpinner,
  IonModal,
  IonItem,
  IonInput,
  IonTextarea,
  IonToggle,
  IonDatetime,
  IonDatetimeButton,
  IonSearchbar,
} from '@ionic/angular/standalone';
import { TranslatePipe } from '@ngx-translate/core';
import { addIcons } from 'ionicons';
import {
  navigateOutline,
  addOutline,
  removeOutline,
  layersOutline,
  downloadOutline,
  shareSocialOutline,
  createOutline,
  calendarOutline,
  timeOutline,
  locationOutline,
  locateOutline,
  addCircleOutline,
  checkmarkCircleOutline,
} from 'ionicons/icons';
import { AuthService } from '../../services/auth.service';
import { EventService } from '../../services/event.service';
import { FavoriteService } from '../../services/favorite.service';
import { DisciplineService } from '../../services/discipline.service';
import { EventTypeService } from '../../services/event-type.service';
import { LanguageService } from '../../services/language.service';
import { CitySuggestion, GeocodingService } from '../../services/geocoding.service';
import {
  CreateEventPayload,
  Discipline,
  DISCIPLINE_NAMES,
  EventType,
  EVENT_TYPE_NAMES,
  EventStatus,
  EVENT_STATUSES,
  EventWithCreatorName,
  SocialLinks,
  UpdateEventPayload,
} from '../../models';
import {
  disciplineIconUrl,
  eventTypeIconUrl,
  formatSocialUrl,
  socialIconUrl,
  statusIconUrl,
  STATUS_LABEL_KEYS,
  sortByNameOrder,
} from '../../shared/icon-catalog';
import { MapType, mapEmbedUrl as buildMapEmbedUrl } from '../../shared/maps';
import { formatEventDateRange } from '../../shared/event-date-format';
import { buildGoogleCalendarUrl, buildIcs, downloadIcs } from '../../shared/calendar-export';
import { PhotoEditorComponent } from '../../shared/photo-editor/photo-editor.component';
import { SOCIAL_URL_PATTERNS } from '../../shared/social-link-patterns';
import { MinSelectionWarningService } from '../../shared/min-selection-warning.service';
import { toggleWithMinimum } from '../../shared/min-selection';

const MIN_ZOOM = 3;
const MAX_ZOOM = 20;
const STATUS_OPTIONS = EVENT_STATUSES.map((id) => ({ id, labelKey: STATUS_LABEL_KEYS[id] }));
// "Finalizado" isn't a manual choice - it should reflect that the event's date
// has already passed, not something the organizer picks when creating/editing.
const EDITABLE_STATUS_OPTIONS = STATUS_OPTIONS.filter((option) => option.id !== 'finished');
const DEFAULT_EVENT_DURATION_MS = 2 * 60 * 60 * 1000;

interface SocialLinkRow {
  key: keyof SocialLinks;
  url: string;
}

const SOCIAL_LINK_ORDER: (keyof SocialLinks)[] = ['instagram', 'facebook', 'tiktok', 'youtube', 'website'];

function pad2(value: number): string {
  return value.toString().padStart(2, '0');
}

function formatTimeInputValue(timestamp: number): string {
  const date = new Date(timestamp);
  return `${pad2(date.getHours())}:${pad2(date.getMinutes())}`;
}

/** Merges an ion-datetime date-only ISO value ("2026-07-31", parsed as UTC
 * midnight per the ISO 8601 spec) into `base`, keeping base's own local
 * time-of-day untouched. */
function withDatePart(base: number, dateOnlyIso: string): number {
  const datePart = new Date(dateOnlyIso);
  const merged = new Date(base);
  merged.setFullYear(datePart.getUTCFullYear(), datePart.getUTCMonth(), datePart.getUTCDate());
  return merged.getTime();
}

/** Merges a native <input type="time"> value ("HH:mm") into `base`, keeping
 * base's own date untouched. */
function withTimePart(base: number, timeValue: string): number {
  const [hours, minutes] = timeValue.split(':').map(Number);
  const merged = new Date(base);
  merged.setHours(hours, minutes, 0, 0);
  return merged.getTime();
}

/** Event detail: expands <app-event-card> into a full screen, the same way
 * user-detail expands a user row - reached by tapping an event card anywhere
 * (Explorer's map, Events, Favorites, any user's events list), or by "Crear
 * evento" on the Profile tab (/events/new - no id, starts straight in edit
 * mode with empty fields). Doubles as a field-by-field reference for
 * CreateEventDto/UpdateEventDto: every editable field shows up here, read-only
 * unless you're the organizer (or always editable in create mode). */
@Component({
  selector: 'app-event-detail',
  standalone: true,
  templateUrl: 'event-detail.page.html',
  styleUrls: ['event-detail.page.scss'],
  imports: [
    ReactiveFormsModule,
    RouterLink,
    IonHeader,
    IonToolbar,
    IonTitle,
    IonButtons,
    IonBackButton,
    IonContent,
    IonIcon,
    IonButton,
    IonSpinner,
    IonModal,
    IonItem,
    IonInput,
    IonTextarea,
    IonToggle,
    IonDatetime,
    IonDatetimeButton,
    IonSearchbar,
    TranslatePipe,
    PhotoEditorComponent,
  ],
})
export class EventDetailPage {
  private readonly fb = inject(FormBuilder);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly location = inject(Location);
  private readonly sanitizer = inject(DomSanitizer);
  private readonly authService = inject(AuthService);
  private readonly eventService = inject(EventService);
  private readonly favoriteService = inject(FavoriteService);
  private readonly disciplineService = inject(DisciplineService);
  private readonly eventTypeService = inject(EventTypeService);
  private readonly languageService = inject(LanguageService);
  private readonly geocodingService = inject(GeocodingService);
  readonly minSelectionWarning = inject(MinSelectionWarningService);

  private readonly disciplinesById = computed(() => new Map(this.disciplines().map((d) => [d.id, d])));
  private readonly eventTypesById = computed(() => new Map(this.eventTypes().map((e) => [e.id, e])));
  readonly disciplines = signal<Discipline[]>([]);
  readonly eventTypes = signal<EventType[]>([]);
  readonly statusOptions = STATUS_OPTIONS;
  readonly editableStatusOptions = EDITABLE_STATUS_OPTIONS;

  readonly loading = signal(true);
  readonly notFound = signal(false);
  readonly event = signal<EventWithCreatorName | null>(null);
  readonly saving = signal(false);
  readonly isEditMode = signal(false);
  readonly isCreateMode = signal(false);
  readonly showValidationModal = signal(false);
  readonly isAttending = signal(false);
  readonly attendLoading = signal(false);
  readonly attendeesCount = signal(0);

  readonly isOwnEvent = computed(() => {
    const event = this.event();
    const me = this.authService.currentUser();
    return !!event && !!me && event.creatorId === me.id;
  });

  readonly creatorProfileLink = computed<string[]>(() => {
    const event = this.event();
    const me = this.authService.currentUser();
    if (!event) {
      return [];
    }
    return me && event.creatorId === me.id ? ['/tabs/profile'] : ['/users', event.creatorId];
  });

  /** Read-mode tags - an event can be more than one type/discipline, so each
   * renders as its own icon+name pill instead of a single value. */
  readonly eventTypeTags = computed<{ name: string; iconUrl: string }[]>(() => {
    const event = this.event();
    if (!event) {
      return [];
    }
    const byId = this.eventTypesById();
    return event.typeIds
      .map((id) => byId.get(id))
      .filter((eventType): eventType is EventType => !!eventType)
      .map((eventType) => ({ name: eventType.name, iconUrl: eventTypeIconUrl(eventType.name) }));
  });
  readonly disciplineTags = computed<{ name: string; iconUrl: string }[]>(() => {
    const event = this.event();
    if (!event) {
      return [];
    }
    const byId = this.disciplinesById();
    return event.disciplineIds
      .map((id) => byId.get(id))
      .filter((discipline): discipline is Discipline => !!discipline)
      .map((discipline) => ({ name: discipline.name, iconUrl: disciplineIconUrl(discipline) }));
  });
  readonly statusLabelKey = computed(() => STATUS_LABEL_KEYS[this.event()?.status ?? 'published']);
  readonly statusIconSrc = computed(() => statusIconUrl(this.event()?.status ?? 'published'));
  readonly isEventOver = computed(() => {
    const status = this.event()?.status;
    return status === 'finished' || status === 'cancelled';
  });

  readonly dateLabel = computed(() => {
    const event = this.event();
    if (!event) {
      return '';
    }
    return formatEventDateRange(event.eventDateFrom, event.eventDateTo, this.languageService.currentLang());
  });

  readonly socialLinks = computed<SocialLinkRow[]>(() => {
    const links = this.event()?.socialLinks;
    if (!links) {
      return [];
    }
    return SOCIAL_LINK_ORDER.filter((key) => !!links[key]).map((key) => ({ key, url: links[key]! }));
  });

  readonly zoomLevel = signal(15);
  readonly mapType = signal<MapType>('roadmap');
  readonly mapEmbedUrl = computed<SafeResourceUrl | null>(() => {
    const event = this.event();
    if (!event) {
      return null;
    }
    const url = buildMapEmbedUrl(event.latitude, event.longitude, this.zoomLevel(), this.mapType());
    return this.sanitizer.bypassSecurityTrustResourceUrl(url);
  });

  readonly disciplineIconUrl = disciplineIconUrl;
  readonly eventTypeIconUrl = eventTypeIconUrl;
  readonly statusIconUrl = statusIconUrl;
  readonly socialIconUrl = socialIconUrl;
  readonly formatSocialUrl = formatSocialUrl;

  /** Edit mode - reference implementation for CreateEventDto/UpdateEventDto.
   * Simple flat fields live on this form; single-select category pickers and
   * location/date live as plain signals below, same split as profile.page.ts
   * (its own account form vs. its chip-grid/city-search state). */
  readonly editForm = this.fb.nonNullable.group({
    title: ['', Validators.required],
    description: ['', Validators.required],
    additionalInfo: [''],
    imageUrl: ['', Validators.required],
    isFree: [true],
    price: [0],
    instagram: ['', Validators.pattern(SOCIAL_URL_PATTERNS.instagram)],
    facebook: ['', Validators.pattern(SOCIAL_URL_PATTERNS.facebook)],
    tiktok: ['', Validators.pattern(SOCIAL_URL_PATTERNS.tiktok)],
    youtube: ['', Validators.pattern(SOCIAL_URL_PATTERNS.youtube)],
    website: [''],
  });

  readonly editTypeIds = signal<string[]>([]);
  readonly editDisciplineIds = signal<string[]>([]);
  readonly editStatus = signal<EventStatus>('published');
  readonly editDateFrom = signal(Date.now());
  readonly editDateTo = signal(Date.now() + DEFAULT_EVENT_DURATION_MS);
  readonly editAddress = signal('');
  readonly editCity = signal('');
  readonly editLatitude = signal(0);
  readonly editLongitude = signal(0);
  readonly editCitySuggestions = signal<CitySuggestion[]>([]);
  readonly editLocatingMe = signal(false);
  private locationInputTimer: ReturnType<typeof setTimeout> | null = null;

  readonly editDateFromIso = computed(() => new Date(this.editDateFrom()).toISOString());
  readonly editDateToIso = computed(() => new Date(this.editDateTo()).toISOString());

  // ion-datetime's wheel-style time picker is awkward with a mouse in Chrome,
  // so the time of day is entered through a plain native <input type="time">
  // instead (date stays on ion-datetime, which is fine as a calendar grid) -
  // these two derive the "HH:mm" the native input needs from the timestamp.
  readonly editTimeFromValue = computed(() => formatTimeInputValue(this.editDateFrom()));
  readonly editTimeToValue = computed(() => formatTimeInputValue(this.editDateTo()));

  readonly editMapEmbedUrl = computed<SafeResourceUrl | null>(() => {
    const latitude = this.editLatitude();
    const longitude = this.editLongitude();
    if (!latitude && !longitude) {
      return null;
    }
    const url = buildMapEmbedUrl(latitude, longitude, this.zoomLevel(), this.mapType());
    return this.sanitizer.bypassSecurityTrustResourceUrl(url);
  });

  // editForm.valid/controls.X.invalid are plain Reactive Forms properties,
  // not signals - a computed() that reads them has no way to know when a
  // control's validity flips from typing, since that's not a tracked
  // dependency. Without this, editValid/editValidationMessages would each
  // only refresh whenever one of the *other* signals below happened to
  // change, letting the two drift out of sync (e.g. the save button
  // disabled from a stale check while the message list, frozen at an
  // earlier/later snapshot, shows nothing wrong). Reading this signal at the
  // top of both computeds forces them to recompute together on every
  // validity change, whatever control caused it.
  private readonly editFormStatus = toSignal(this.editForm.statusChanges, { initialValue: this.editForm.status });

  /** At least one type and one discipline, a real address+city, and an end
   * after the start - matches CreateEventDto's own required fields. */
  readonly editValid = computed(() => {
    this.editFormStatus();
    return (
      this.editForm.valid &&
      this.editTypeIds().length > 0 &&
      this.editDisciplineIds().length > 0 &&
      !!this.editAddress() &&
      !!this.editCity() &&
      this.editDateTo() > this.editDateFrom()
    );
  });

  /** Save silently disables via editValid() with no other feedback - this
   * spells out exactly what's still missing, since e.g. typing an address
   * without picking a suggestion (or "use current location") leaves editCity
   * empty even though the address field visually looks filled in. */
  readonly editValidationMessages = computed<string[]>(() => {
    this.editFormStatus();
    const messages: string[] = [];
    if (this.editForm.controls.title.invalid) {
      messages.push('eventDetail.validationTitle');
    }
    if (this.editForm.controls.description.invalid) {
      messages.push('eventDetail.validationDescription');
    }
    if (this.editForm.controls.imageUrl.invalid) {
      messages.push('eventDetail.validationImageUrl');
    }
    if (!this.editTypeIds().length) {
      messages.push('eventDetail.validationEventType');
    }
    if (!this.editDisciplineIds().length) {
      messages.push('eventDetail.validationDiscipline');
    }
    if (!this.editAddress() || !this.editCity()) {
      messages.push('eventDetail.validationLocation');
    }
    if (this.editDateTo() <= this.editDateFrom()) {
      messages.push('eventDetail.validationDates');
    }
    if (this.editForm.controls.instagram.invalid) {
      messages.push('eventDetail.validationInstagram');
    }
    if (this.editForm.controls.facebook.invalid) {
      messages.push('eventDetail.validationFacebook');
    }
    if (this.editForm.controls.tiktok.invalid) {
      messages.push('eventDetail.validationTiktok');
    }
    if (this.editForm.controls.youtube.invalid) {
      messages.push('eventDetail.validationYoutube');
    }
    return messages;
  });

  constructor() {
    addIcons({
      navigateOutline,
      addOutline,
      removeOutline,
      layersOutline,
      downloadOutline,
      shareSocialOutline,
      createOutline,
      calendarOutline,
      timeOutline,
      locationOutline,
      locateOutline,
      addCircleOutline,
      checkmarkCircleOutline,
    });

    this.disciplineService.getAll().subscribe({
      next: (list) => {
        if (list.length) {
          const sorted = sortByNameOrder(list, DISCIPLINE_NAMES);
          this.disciplines.set(sorted);
          if (this.isCreateMode() && !this.editDisciplineIds().length) {
            this.editDisciplineIds.set([sorted[0].id]);
          }
        }
      },
    });
    this.eventTypeService.getAll().subscribe({
      next: (list) => {
        if (list.length) {
          const sorted = sortByNameOrder(list, EVENT_TYPE_NAMES);
          this.eventTypes.set(sorted);
          if (this.isCreateMode() && !this.editTypeIds().length) {
            this.editTypeIds.set([sorted[0].id]);
          }
        }
      },
    });

    const id = this.route.snapshot.paramMap.get('id');
    if (!id) {
      // /events/new - no event to load, start straight in (create) edit mode.
      this.isCreateMode.set(true);
      this.isEditMode.set(true);
      this.loading.set(false);
      return;
    }
    this.loadEvent(id);
  }

  private loadEvent(id: string): void {
    this.eventService.getById(id).subscribe({
      next: (event) => {
        this.event.set(event);
        this.notFound.set(!event);
        this.loading.set(false);
        this.refreshAttendingState(event);
        this.refreshAttendeesCount(id);
      },
      error: () => {
        this.notFound.set(true);
        this.loading.set(false);
      },
    });
  }

  private refreshAttendeesCount(eventId: string): void {
    this.favoriteService.countByEvent(eventId).subscribe({
      next: (count) => this.attendeesCount.set(count),
      error: () => this.attendeesCount.set(0),
    });
  }

  /** Skips the check entirely for your own event - only attendees (not
   * organizers) get the Asistir button, see isOwnEvent() in the template. */
  private refreshAttendingState(event: EventWithCreatorName | null): void {
    const me = this.authService.currentUser();
    if (!event || !me || event.creatorId === me.id) {
      this.isAttending.set(false);
      return;
    }
    this.favoriteService.isFavorited(me.id, event.id).subscribe({
      next: (isFavorited) => this.isAttending.set(isFavorited),
      error: () => this.isAttending.set(false),
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

  openDirections(): void {
    const event = this.event();
    if (!event) {
      return;
    }
    window.open(`https://www.google.com/maps/dir/?api=1&destination=${event.latitude},${event.longitude}`, '_blank');
  }

  // --- Calendar export ----------------------------------------------------

  /** iOS (and iPadOS, which reports as "MacIntel" with touch support since
   * iOS 13) has no notion of a Google account tied to the system Calendar
   * app, so it gets the .ics handoff; everything else (Android, desktop)
   * gets the Google Calendar URL, which needs no plugin or native intent. */
  private isIOS(): boolean {
    const ua = navigator.userAgent;
    return /iPad|iPhone|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  }

  addToCalendar(): void {
    const event = this.event();
    if (!event) {
      return;
    }
    if (this.isIOS()) {
      downloadIcs(buildIcs(event));
    } else {
      window.open(buildGoogleCalendarUrl(event), '_blank');
    }
  }

  // --- Share ----------------------------------------------------------------

  async share(): Promise<void> {
    const event = this.event();
    if (!event) {
      return;
    }
    const url = window.location.href;
    if (navigator.share) {
      try {
        await navigator.share({ title: event.title, text: event.title, url });
      } catch {
        // User cancelled the native share sheet - nothing to do.
      }
      return;
    }
    if (navigator.clipboard) {
      await navigator.clipboard.writeText(url);
    }
  }

  // --- Attend (favorite as attendee) ---------------------------------------

  /** Same Favorite record the Favorites tab and Profile's "Eventos" stat
   * already read from - toggling this here just creates/removes that row,
   * everything downstream picks it up with no extra wiring. */
  toggleAttend(): void {
    const event = this.event();
    const me = this.authService.currentUser();
    if (!event || !me || this.attendLoading() || this.isEventOver()) {
      return;
    }
    this.attendLoading.set(true);
    const wasAttending = this.isAttending();
    const request$ = wasAttending
      ? this.favoriteService.removeFromFavorites(me.id, event.id)
      : this.favoriteService.addToFavorites(me.id, event.id);
    request$.subscribe({
      next: () => {
        this.isAttending.set(!wasAttending);
        this.attendeesCount.update((count) => Math.max(0, count + (wasAttending ? -1 : 1)));
        this.attendLoading.set(false);
      },
      error: () => this.attendLoading.set(false),
    });
  }

  goToAttendees(): void {
    const event = this.event();
    if (!event) {
      return;
    }
    this.router.navigate(['/attendees'], { queryParams: { eventId: event.id } });
  }

  onImageUploaded(url: string): void {
    this.editForm.controls.imageUrl.setValue(url);
  }

  // --- Edit mode: category pickers (multi-select chips, at least one each) --

  toggleEditType(id: string): void {
    this.editTypeIds.update((ids) => toggleWithMinimum(ids, id, () => this.minSelectionWarning.flash('eventTypes')));
  }

  toggleEditDiscipline(id: string): void {
    this.editDisciplineIds.update((ids) =>
      toggleWithMinimum(ids, id, () => this.minSelectionWarning.flash('disciplines')),
    );
  }

  selectEditStatus(id: EventStatus): void {
    this.editStatus.set(id);
  }

  // --- Edit mode: dates -----------------------------------------------------

  /** Keeps "fin" always after "inicio" - whichever field the user just
   * touched wins, the other snaps forward/back to match instead of silently
   * allowing an inverted range that only got caught later at save time. */
  private ensureDateOrder(): void {
    if (this.editDateTo() <= this.editDateFrom()) {
      this.editDateTo.set(this.editDateFrom() + DEFAULT_EVENT_DURATION_MS);
    }
  }

  onDateFromChange(ev: Event): void {
    const value = (ev as CustomEvent<{ value: string | string[] | null }>).detail.value;
    const iso = Array.isArray(value) ? value[0] : value;
    if (iso) {
      this.editDateFrom.update((current) => withDatePart(current, iso));
      this.ensureDateOrder();
    }
  }

  onDateToChange(ev: Event): void {
    const value = (ev as CustomEvent<{ value: string | string[] | null }>).detail.value;
    const iso = Array.isArray(value) ? value[0] : value;
    if (iso) {
      this.editDateTo.update((current) => withDatePart(current, iso));
      this.ensureDateOrder();
    }
  }

  onTimeFromChange(ev: Event): void {
    const value = (ev.target as HTMLInputElement).value;
    if (value) {
      this.editDateFrom.update((current) => withTimePart(current, value));
      this.ensureDateOrder();
    }
  }

  onTimeToChange(ev: Event): void {
    const value = (ev.target as HTMLInputElement).value;
    if (value) {
      this.editDateTo.update((current) => withTimePart(current, value));
      this.ensureDateOrder();
    }
  }

  // --- Edit mode: location (same search/current-location pattern as the
  // rest of the app's location pickers, just address-level instead of city-level) --

  onLocationInput(value: string | null | undefined): void {
    const query = (value ?? '').trim();
    this.editAddress.set(value ?? '');
    if (this.locationInputTimer) {
      clearTimeout(this.locationInputTimer);
    }
    if (query.length < 2) {
      this.editCitySuggestions.set([]);
      return;
    }
    this.locationInputTimer = setTimeout(() => {
      this.geocodingService.search(query, 'address').subscribe({
        next: (suggestions) => this.editCitySuggestions.set(suggestions),
        error: () => this.editCitySuggestions.set([]),
      });
    }, 300);
  }

  selectLocationSuggestion(suggestion: CitySuggestion): void {
    this.geocodingService.place(suggestion.placeId).subscribe({
      next: (result) => {
        if (!result) {
          return;
        }
        this.editAddress.set(result.formattedAddress);
        this.editCity.set(result.city);
        this.editLatitude.set(result.latitude);
        this.editLongitude.set(result.longitude);
        this.editCitySuggestions.set([]);
      },
    });
  }

  useCurrentLocationForEdit(): void {
    if (!navigator.geolocation) {
      return;
    }
    this.editLocatingMe.set(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const lat = position.coords.latitude;
        const lng = position.coords.longitude;
        this.geocodingService.reverse(lat, lng).subscribe({
          next: (result) => {
            this.editLatitude.set(lat);
            this.editLongitude.set(lng);
            this.editAddress.set(result?.formattedAddress ?? '');
            this.editCity.set(result?.city ?? '');
            this.editLocatingMe.set(false);
          },
          error: () => {
            this.editLatitude.set(lat);
            this.editLongitude.set(lng);
            this.editLocatingMe.set(false);
          },
        });
      },
      () => this.editLocatingMe.set(false),
    );
  }

  // --- Edit mode: enter/cancel/save ------------------------------------------

  enterEditMode(): void {
    const event = this.event();
    if (!event) {
      return;
    }
    this.editForm.reset({
      title: event.title,
      description: event.description,
      additionalInfo: event.additionalInfo ?? '',
      imageUrl: event.imageUrl,
      isFree: event.isFree,
      price: event.price,
      instagram: event.socialLinks?.instagram ?? '',
      facebook: event.socialLinks?.facebook ?? '',
      tiktok: event.socialLinks?.tiktok ?? '',
      youtube: event.socialLinks?.youtube ?? '',
      website: event.socialLinks?.website ?? '',
    });
    this.editTypeIds.set([...event.typeIds]);
    this.editDisciplineIds.set([...event.disciplineIds]);
    this.editStatus.set(event.status === 'finished' ? 'published' : event.status);
    this.editDateFrom.set(event.eventDateFrom);
    this.editDateTo.set(event.eventDateTo);
    this.editAddress.set(event.address);
    this.editCity.set(event.city);
    this.editLatitude.set(event.latitude);
    this.editLongitude.set(event.longitude);
    this.editCitySuggestions.set([]);
    this.isEditMode.set(true);
  }

  cancelEdit(): void {
    if (this.isCreateMode()) {
      this.location.back();
      return;
    }
    this.isEditMode.set(false);
  }

  /** The Save button is always tappable (not hard-disabled while invalid) so
   * a tap always gives feedback - if the form isn't ready, it opens a modal
   * with exactly what's missing instead of silently doing nothing. */
  onSaveClick(): void {
    if (this.editValid()) {
      this.saveEdit();
    } else {
      this.showValidationModal.set(true);
    }
  }

  closeValidationModal(): void {
    this.showValidationModal.set(false);
  }

  saveEdit(): void {
    if (!this.editValid()) {
      return;
    }
    const formValue = this.editForm.getRawValue();
    const socialLinks: SocialLinks = {
      instagram: formValue.instagram || undefined,
      facebook: formValue.facebook || undefined,
      tiktok: formValue.tiktok || undefined,
      youtube: formValue.youtube || undefined,
      website: formValue.website || undefined,
    };
    const commonFields = {
      title: formValue.title,
      description: formValue.description,
      additionalInfo: formValue.additionalInfo || undefined,
      imageUrl: formValue.imageUrl,
      typeIds: this.editTypeIds(),
      disciplineIds: this.editDisciplineIds(),
      status: this.editStatus(),
      isFree: formValue.isFree,
      price: formValue.price,
      address: this.editAddress(),
      city: this.editCity(),
      latitude: this.editLatitude(),
      longitude: this.editLongitude(),
      eventDateFrom: this.editDateFrom(),
      eventDateTo: this.editDateTo(),
      socialLinks,
    };

    this.saving.set(true);

    if (this.isCreateMode()) {
      const me = this.authService.currentUser();
      if (!me) {
        this.saving.set(false);
        return;
      }
      const payload: CreateEventPayload = { ...commonFields, creatorId: me.id };
      this.eventService.createEvent(payload).subscribe({
        next: (created) => {
          this.saving.set(false);
          this.router.navigate(['/events', created.id], { replaceUrl: true });
        },
        error: () => this.saving.set(false),
      });
      return;
    }

    const event = this.event();
    if (!event) {
      this.saving.set(false);
      return;
    }
    const payload: UpdateEventPayload = commonFields;
    this.eventService.updateEvent(event.id, payload).subscribe({
      next: () => {
        this.event.set({ ...event, ...payload });
        this.saving.set(false);
        this.isEditMode.set(false);
      },
      error: () => this.saving.set(false),
    });
  }
}
