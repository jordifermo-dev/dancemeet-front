import { Location } from '@angular/common';
import { Component, ElementRef, computed, inject, signal, viewChild } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
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
  IonCheckbox,
  ViewWillEnter,
} from '@ionic/angular/standalone';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
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
  checkmarkOutline,
  trashOutline,
  heart,
  heartOutline,
  personAddOutline,
  personRemoveOutline,
  peopleOutline,
  refreshOutline,
  arrowUndoOutline,
  arrowRedoOutline,
  closeOutline,
  copyOutline,
  informationCircleOutline,
  gridOutline,
  cameraOutline,
} from 'ionicons/icons';
import { AuthService } from '../../../../services/core/auth.service';
import { EventService } from '../../../../services/event/event.service';
import { FavoriteService } from '../../../../services/favorites/favorite.service';
import { AttendanceService } from '../../../../services/attendance/attendance.service';
import { EventListRefreshService } from '../../../../services/event/event-list-refresh.service';
import { DisciplineService } from '../../../../services/event/discipline.service';
import { EventTypeService } from '../../../../services/event/event-type.service';
import { LanguageService } from '../../../../services/core/language.service';
import { CitySuggestion, GeocodingService } from '../../../../services/location/geocoding.service';
import { GalleryService } from '../../../../services/gallery/gallery.service';
import {
  CreateEventPayload,
  CreateEventSeriesPayload,
  Discipline,
  DISCIPLINE_NAMES,
  EventType,
  EVENT_TYPE_NAMES,
  EventStatus,
  EVENT_STATUSES,
  EventWithCreatorName,
  GalleryPhotoWithPoster,
  RecurrenceRule,
  SocialLinks,
  UpdateEventPayload,
} from '../../../../models';
import {
  disciplineIconUrl,
  eventTypeIconUrl,
  socialIconUrl,
  statusIconUrl,
  STATUS_LABEL_KEYS,
  sortByNameOrder,
} from '../../../../shared/event/icon-catalog';
import { MapType } from '../../../../shared/location/maps';
import { formatEventDateRange, formatEventDateOnly, INTL_LOCALES } from '../../../../shared/calendar/event-date-format';
import { buildGoogleCalendarUrl, buildIcs, downloadIcs } from '../../../../shared/calendar/calendar-export';
import { LocationPickerComponent } from '../../../../shared/location/location-picker/location-picker.component';
import { PhotoEditorComponent } from '../../../../shared/user/photo-editor/photo-editor.component';
import { FilterSheetHeaderComponent } from '../../../../shared/filters/filter-sheet-header/filter-sheet-header.component';
import { FilterActionsRowComponent } from '../../../../shared/filters/filter-actions-row/filter-actions-row.component';
import { ChipGridComponent } from '../../../../shared/filters/chip-grid/chip-grid.component';
import { TimeRangePickerComponent } from '../../../../shared/calendar/time-range-picker/time-range-picker.component';
import { RecurrenceQuickPickerComponent } from '../../../../shared/calendar/recurrence-quick-picker/recurrence-quick-picker.component';
import { SeriesAttendConfirmComponent } from '../../../../shared/event/series-attend-confirm/series-attend-confirm.component';
import { disciplineChipItems, eventTypeChipItems, statusChipItems } from '../../../../shared/filters/chip-grid/chip-grid-presets';
import { normalizeSocialUrl, SOCIAL_URL_PATTERNS, SOCIAL_URL_PREFIXES } from '../../../../shared/user/social-link-patterns';
import {
  ALL_SOCIAL_NETWORKS,
  SOCIAL_NETWORK_ERROR_KEYS,
  SOCIAL_NETWORK_LABEL_KEYS,
  SocialNetworkKey,
} from '../../../../shared/user/social-networks';
import { ComponentWithUnsavedChanges } from '../../../../guards/unsaved-changes.guard';
import { MinSelectionWarningService } from '../../../../shared/filters/min-selection-warning.service';
import { toggleWithMinimum } from '../../../../shared/filters/min-selection';
import { createSuccessFlash } from '../../../../shared/common/success-flash';
import { dismissSharePreviewHint, isSharePreviewHintDismissed } from '../../../../shared/sharing/share-hint';
import { EventShareService, escapeHtml } from '../../../../services/sharing/event-share.service';
import { EventManagerService } from '../../../../services/event-managers/event-manager.service';
import { EventManager } from '../../../../models';
import { canManageEvent, findMyParticipantRow } from '../../../../shared/event/event-manager-permissions';
import { PhotoGridComponent } from '../../../../shared/gallery/photo-grid/photo-grid.component';
import { LightboxPhoto, PhotoLightboxComponent } from '../../../../shared/gallery/photo-lightbox/photo-lightbox.component';

const MIN_ZOOM = 3;
const MAX_ZOOM = 20;
// Keeps organizers from pasting in a novel - long enough for a real event
// title/description/note, short enough that the share text (which embeds
// all three verbatim) stays a readable message instead of a wall of text.
const TITLE_MAX_LENGTH = 50;
const DESCRIPTION_MAX_LENGTH = 200;
const ADDITIONAL_INFO_MAX_LENGTH = 200;
const STATUS_OPTIONS = EVENT_STATUSES.map((id) => ({ id, labelKey: STATUS_LABEL_KEYS[id] }));
// "Finalizado" isn't a manual choice - it should reflect that the event's date
// has already passed, not something the organizer picks when creating/editing.
const EDITABLE_STATUS_OPTIONS = STATUS_OPTIONS.filter((option) => option.id !== 'finished');
const DEFAULT_EVENT_DURATION_MS = 2 * 60 * 60 * 1000;

interface SocialLinkRow {
  key: keyof SocialLinks;
  url: string;
}

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
    IonCheckbox,
    TranslatePipe,
    LocationPickerComponent,
    PhotoEditorComponent,
    FilterSheetHeaderComponent,
    FilterActionsRowComponent,
    ChipGridComponent,
    TimeRangePickerComponent,
    RecurrenceQuickPickerComponent,
    SeriesAttendConfirmComponent,
    PhotoGridComponent,
    PhotoLightboxComponent,
  ],
})
export class EventDetailPage implements ComponentWithUnsavedChanges, ViewWillEnter {
  private readonly fb = inject(FormBuilder);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly location = inject(Location);
  private readonly authService = inject(AuthService);
  private readonly eventService = inject(EventService);
  private readonly favoriteService = inject(FavoriteService);
  private readonly attendanceService = inject(AttendanceService);
  private readonly refreshNotifier = inject(EventListRefreshService);
  private readonly disciplineService = inject(DisciplineService);
  private readonly eventTypeService = inject(EventTypeService);
  private readonly languageService = inject(LanguageService);
  private readonly geocodingService = inject(GeocodingService);
  private readonly shareService = inject(EventShareService);
  private readonly eventManagerService = inject(EventManagerService);
  private readonly galleryService = inject(GalleryService);
  private readonly translate = inject(TranslateService);
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
  readonly savedFlash = createSuccessFlash();
  readonly isEditMode = signal(false);
  readonly isCreateMode = signal(false);
  readonly showValidationModal = signal(false);
  readonly showDateInvalidModal = signal(false);
  /** Plain "me gusta" - the heart. See isAttending below for the real RSVP. */
  readonly isLiked = signal(false);
  readonly likeLoading = signal(false);
  readonly likeFlash = createSuccessFlash();
  /** Badge on the heart - how many people have liked this event, same idea
   * as attendeesCount below but for Favorite rather than Attendance. */
  readonly likesCount = signal(0);
  /** Real RSVP (AttendanceService) - drives the attendee list/count, gallery-
   * posting permission (see canPostPhoto) and the organizer's notification.
   * Not the same as isLiked - see this page's own "Like"/"Attend" sections. */
  readonly isAttending = signal(false);
  readonly attendLoading = signal(false);
  readonly attendFlash = createSuccessFlash();
  readonly attendeesCount = signal(0);
  readonly shareFlash = createSuccessFlash();
  readonly shareFeedback = signal<'shared' | 'copied'>('shared');
  readonly showSharePreviewModal = signal(false);
  readonly directionsFlash = createSuccessFlash();
  readonly calendarFlash = createSuccessFlash();

  /** Only networks with a saved link (or just added this session) render
   * their own field - see openAddSocialSheet()/addSocialNetwork() for how a
   * network moves from the picker sheet into this list. Same pattern as
   * profile.page.ts's own social links section. */
  readonly activeSocialNetworks = signal<SocialNetworkKey[]>([]);
  readonly availableSocialNetworks = computed(() =>
    ALL_SOCIAL_NETWORKS.filter((key) => !this.activeSocialNetworks().includes(key)),
  );
  readonly showAddSocialSheet = signal(false);

  readonly showUnsavedChangesModal = signal(false);
  private pendingLeaveResolve: ((shouldLeave: boolean) => void) | null = null;
  private pendingLeaveApplied = false;
  /** URL of the list/tab this page instance was reached from - carried in via
   * the `origin` query param (see event-card.component.ts and the various
   * goToCreateEvent()/goToEvent() call sites), and forwarded again when
   * "Reutilizar evento" opens the create form, so saveEdit()'s create-success
   * handler can navigate straight back there instead of forward into either
   * event's own detail page. A raw history.go(-N) was tried first, but Ionic
   * only reliably re-fires ionViewWillEnter (which is what refreshes the
   * list) on a normal forward navigation, not a multi-step history jump. */
  private originUrl: string | null = null;
  /** Snapshot of the edit form the last time it was loaded/saved, used to
   * detect unsaved edits when navigating away - same pattern as Profile's
   * own baseline/buildSnapshot. Only meaningful while isEditMode() is true. */
  private editBaseline: string | null = null;

  readonly isOwnEvent = computed(() => {
    const event = this.event();
    const me = this.authService.currentUser();
    return !!event && !!me && event.creatorId === me.id;
  });

  readonly participants = signal<EventManager[]>([]);
  /** Creator or accepted manager - gates edit/delete/reuse the same way
   * isOwnEvent used to on its own (see canManageEvent's own doc comment for
   * why this rule lives in one shared place). */
  readonly canManage = computed(() =>
    canManageEvent(this.event(), this.participants(), this.authService.currentUser()?.id),
  );
  /** Drives the "you've been invited" accept/decline banner - null once
   * there's no row for me at all, or after I've already accepted. Its role
   * (attendee vs manager) picks which message/notification text was shown. */
  readonly myPendingInvite = computed(() => {
    const row = findMyParticipantRow(this.participants(), this.authService.currentUser()?.id);
    return row?.status === 'pending' ? row : null;
  });
  readonly inviteResponseBusy = signal(false);

  // --- Instagram-style info/gallery toggle ------------------------------

  readonly detailViewMode = signal<'info' | 'gallery'>('info');
  readonly eventGallery = signal<GalleryPhotoWithPoster[]>([]);

  readonly galleryGridItems = computed(() => this.eventGallery().map((photo) => ({ id: photo.id, photoUrl: photo.photoUrl })));

  readonly lightboxItems = computed<LightboxPhoto[]>(() =>
    this.eventGallery().map((photo) => ({
      id: photo.id,
      photoUrl: photo.photoUrl,
      createdAt: photo.createdAt,
      relatedLinkRoute: ['/users', photo.posterUserId],
      relatedLinkLabel: photo.posterUserName,
    })),
  );

  readonly lightboxOpen = signal(false);
  readonly lightboxStartIndex = signal(0);

  openLightbox(photoId: string): void {
    const index = this.eventGallery().findIndex((photo) => photo.id === photoId);
    if (index === -1) {
      return;
    }
    this.lightboxStartIndex.set(index);
    this.lightboxOpen.set(true);
  }

  /** Gates the "Añadir foto" button - only a UI-level shortcut, the real
   * authorization check (assertCanPostPhoto) runs again on the backend. */
  readonly canPostPhoto = computed(() => {
    const event = this.event();
    return this.canManage() || (!!event?.allowAttendeePhotos && this.isAttending());
  });

  private refreshGallery(eventId: string): void {
    this.galleryService.getEventGallery(eventId).subscribe({
      next: (photos) => this.eventGallery.set(photos),
      error: () => this.eventGallery.set([]),
    });
  }

  onGalleryPhotoUploaded(url: string): void {
    const event = this.event();
    if (!event) {
      return;
    }
    this.galleryService.postEventPhoto(event.id, url).subscribe({
      next: () => this.refreshGallery(event.id),
    });
  }

  readonly confirmDelete = signal(false);
  readonly deleting = signal(false);

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
    return ALL_SOCIAL_NETWORKS.filter((key) => !!links[key]).map((key) => ({ key, url: links[key]! }));
  });

  readonly zoomLevel = signal(15);
  readonly mapType = signal<MapType>('roadmap');
  readonly eventAddressLine = computed(() => {
    const event = this.event();
    return event ? `${event.address}, ${event.city}` : null;
  });

  readonly socialIconUrl = socialIconUrl;

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
    const control = this.editForm.controls[key];
    const prefix = SOCIAL_URL_PREFIXES[key];
    if (prefix && !control.value) {
      control.setValue(prefix);
    }
    this.showAddSocialSheet.set(false);
  }

  /** Clears the field's value (not just hides it) - otherwise a removed-then-
   * unsaved link would silently come back on the next save. */
  removeSocialNetwork(key: SocialNetworkKey): void {
    this.editForm.controls[key].reset('');
    this.activeSocialNetworks.update((keys) => keys.filter((k) => k !== key));
  }

  /** Reduces a pasted full URL (e.g. "https://www.instagram.com/nick" typed
   * or pasted over the pre-filled prefix) back down to "prefix + handle" -
   * see normalizeSocialUrl's own doc comment for what it does and doesn't
   * catch. Runs on blur rather than every keystroke so it never fights an
   * actively-typing cursor. */
  onSocialUrlBlur(key: SocialNetworkKey): void {
    const control = this.editForm.controls[key];
    const normalized = normalizeSocialUrl(key, control.value);
    if (normalized !== control.value) {
      control.setValue(normalized);
    }
  }

  /** Serializes every field the edit form actually saves (see saveEdit's
   * payload) so it can be compared against editBaseline to detect unsaved
   * changes - covers both the reactive form controls and the plain signals
   * (chips, dates, location) the custom pickers write to directly. */
  private buildEditSnapshot(): string {
    const raw = this.editForm.getRawValue();
    return JSON.stringify({
      title: raw.title,
      description: raw.description,
      additionalInfo: raw.additionalInfo,
      imageUrl: raw.imageUrl,
      isFree: raw.isFree,
      price: raw.price,
      allowAttendeePhotos: raw.allowAttendeePhotos,
      socialLinks: {
        instagram: raw.instagram,
        facebook: raw.facebook,
        tiktok: raw.tiktok,
        youtube: raw.youtube,
        website: raw.website,
        whatsapp: raw.whatsapp,
        pinterest: raw.pinterest,
      },
      typeIds: [...this.editTypeIds()].sort(),
      disciplineIds: [...this.editDisciplineIds()].sort(),
      status: this.editStatus(),
      dateFrom: this.editDateFrom(),
      dateTo: this.editDateTo(),
      address: this.editAddress(),
      city: this.editCity(),
      latitude: this.editLatitude(),
      longitude: this.editLongitude(),
    });
  }

  private captureEditBaseline(): void {
    this.editBaseline = this.buildEditSnapshot();
  }

  /** Whether the create-mode form still looks like its just-opened, blank
   * state - ignores fields the page fills in on its own before the user has
   * touched anything (auto-picked discipline/type, default isFree/price/
   * dates), so those never register as "the user changed something". A plain
   * baseline diff (like edit-existing-event uses below) is the wrong tool
   * here: those auto-picks land asynchronously, and whether they've resolved
   * yet by the time the baseline is captured isn't something worth hinging
   * "did the user actually do anything?" on. */
  private isCreateFormEmpty(): boolean {
    const raw = this.editForm.getRawValue();
    return (
      !raw.title &&
      !raw.description &&
      !raw.additionalInfo &&
      !raw.imageUrl &&
      !raw.instagram &&
      !raw.facebook &&
      !raw.tiktok &&
      !raw.youtube &&
      !raw.website &&
      !raw.whatsapp &&
      !raw.pinterest &&
      !this.editAddress() &&
      !this.editCity()
    );
  }

  private isEditDirty(): boolean {
    if (this.isCreateMode()) {
      return !this.isCreateFormEmpty();
    }
    return this.editBaseline !== null && this.buildEditSnapshot() !== this.editBaseline;
  }

  /** Invoked by unsavedChangesGuard (see app.routes.ts) before navigating
   * away from /events/new or /events/:id while mid-edit. Resolves to whether
   * the guard should actually let the navigation proceed - false keeps the
   * user on the form (see onUnsavedChangesModalDismiss's invalid-apply case). */
  async canLeave(): Promise<boolean> {
    if (!this.isEditMode() || !this.isEditDirty()) {
      return true;
    }
    this.pendingLeaveApplied = false;
    this.showUnsavedChangesModal.set(true);
    // Waits for (didDismiss), not the button click itself - same reasoning
    // as Profile's own version of this modal.
    return new Promise<boolean>((resolve) => {
      this.pendingLeaveResolve = resolve;
    });
  }

  confirmDiscardChanges(): void {
    this.pendingLeaveApplied = false;
    this.showUnsavedChangesModal.set(false);
  }

  confirmApplyChanges(): void {
    this.pendingLeaveApplied = true;
    this.showUnsavedChangesModal.set(false);
  }

  /** Fires once the sheet has fully closed. Applying an invalid form shows
   * what's missing and keeps the user on it (blocks the pending navigation)
   * instead of silently discarding the in-progress edit and leaving anyway -
   * that used to be the tradeoff here, but it meant tapping "Aplicar" on an
   * incomplete form quietly lost whatever had been typed with no feedback. */
  onUnsavedChangesModalDismiss(): void {
    if (this.pendingLeaveApplied) {
      if (!this.editValid()) {
        this.showValidationModal.set(true);
        this.pendingLeaveResolve?.(false);
        this.pendingLeaveResolve = null;
        return;
      }
      this.saveEdit();
    } else if (this.event()) {
      // Existing event: revert the form to the last-saved state. Nothing to
      // revert to in create mode - the page is being navigated away from anyway.
      this.enterEditMode();
    }
    this.pendingLeaveResolve?.(true);
    this.pendingLeaveResolve = null;
  }

  /** Edit mode - reference implementation for CreateEventDto/UpdateEventDto.
   * Simple flat fields live on this form; single-select category pickers and
   * location/date live as plain signals below, same split as profile.page.ts
   * (its own account form vs. its chip-grid/city-search state). */
  // Exposed for the template's [maxlength]/[counter] bindings - ion-input
  // and ion-textarea need the number as an input, not just enforced via
  // the form's own Validators.maxLength above.
  readonly titleMaxLength = TITLE_MAX_LENGTH;
  readonly descriptionMaxLength = DESCRIPTION_MAX_LENGTH;
  readonly additionalInfoMaxLength = ADDITIONAL_INFO_MAX_LENGTH;

  readonly editForm = this.fb.nonNullable.group({
    title: ['', [Validators.required, Validators.maxLength(TITLE_MAX_LENGTH)]],
    description: ['', [Validators.required, Validators.maxLength(DESCRIPTION_MAX_LENGTH)]],
    additionalInfo: ['', Validators.maxLength(ADDITIONAL_INFO_MAX_LENGTH)],
    imageUrl: ['', Validators.required],
    isFree: [true],
    price: [0],
    allowAttendeePhotos: [true],
    instagram: ['', Validators.pattern(SOCIAL_URL_PATTERNS.instagram)],
    facebook: ['', Validators.pattern(SOCIAL_URL_PATTERNS.facebook)],
    tiktok: ['', Validators.pattern(SOCIAL_URL_PATTERNS.tiktok)],
    youtube: ['', Validators.pattern(SOCIAL_URL_PATTERNS.youtube)],
    website: [''],
    whatsapp: ['', Validators.pattern(SOCIAL_URL_PATTERNS.whatsapp)],
    pinterest: ['', Validators.pattern(SOCIAL_URL_PATTERNS.pinterest)],
  });

  readonly editTypeIds = signal<string[]>([]);
  readonly editDisciplineIds = signal<string[]>([]);
  readonly editStatus = signal<EventStatus>('published');

  readonly editTypeChips = computed(() => eventTypeChipItems(this.eventTypes(), this.editTypeIds()));
  readonly editDisciplineChips = computed(() => disciplineChipItems(this.disciplines(), this.editDisciplineIds()));
  readonly editStatusChips = computed(() => statusChipItems(this.editableStatusOptions, [this.editStatus()]));
  readonly editDateFrom = signal(Date.now());
  readonly editDateTo = signal(Date.now() + DEFAULT_EVENT_DURATION_MS);
  /** Only ever set in create mode (see the "Repetir" field, shown only while
   * isCreateMode()) - non-null means saveEdit() calls createSeries() instead
   * of createEvent(), with editDateFrom/editDateTo contributing only their
   * time-of-day (the "Fecha inicio/fin" date buttons hide themselves while
   * this is set - see event-detail.page.html). */
  readonly recurrenceRule = signal<RecurrenceRule | null>(null);
  // <ion-datetime-button>'s own date-target slot stopped reflecting further
  // value changes after the first render when that value was set
  // programmatically (confirmed with device logging: the computed label was
  // right, the actual DOM text stayed stuck on whatever first rendered) - so
  // these drive a plain <button> instead, opening the calendar modal
  // ourselves rather than relying on ion-datetime-button's built-in trigger.
  readonly showDateFromPicker = signal(false);
  readonly showDateToPicker = signal(false);
  readonly editAddress = signal('');
  readonly editCity = signal('');
  readonly editLatitude = signal(0);
  readonly editLongitude = signal(0);
  readonly editCitySuggestions = signal<CitySuggestion[]>([]);
  readonly editLocatingMe = signal(false);
  private locationInputTimer: ReturnType<typeof setTimeout> | null = null;

  readonly editDateFromIso = computed(() => new Date(this.editDateFrom()).toISOString());
  readonly editDateToIso = computed(() => new Date(this.editDateTo()).toISOString());
  // ion-datetime's own year picker defaults to starting at 1926 - narrows it
  // to a sensible window around today instead.
  readonly dateMinIso = `${new Date().getFullYear() - 10}-01-01`;
  readonly dateMaxIso = `${new Date().getFullYear() + 5}-12-31`;
  // ion-datetime's month/weekday names follow its own `locale` input, which
  // defaults to the device's system locale rather than the app's own
  // language selection.
  readonly dateLocaleTag = computed(() => INTL_LOCALES[this.languageService.currentLang() ?? 'es']);
  // Text for the plain-<button> date triggers above (see showDateFromPicker).
  readonly editDateFromLabel = computed(() => formatEventDateOnly(this.editDateFrom(), this.languageService.currentLang()));
  readonly editDateToLabel = computed(() => formatEventDateOnly(this.editDateTo(), this.languageService.currentLang()));

  // null (not 0) means "nothing picked yet" - editLatitude/editLongitude
  // default to plain 0, which is otherwise indistinguishable from a real
  // (admittedly implausible) null-island event location.
  readonly editMapLat = computed(() => (this.editLatitude() || this.editLongitude() ? this.editLatitude() : null));
  readonly editMapLng = computed(() => (this.editLatitude() || this.editLongitude() ? this.editLongitude() : null));
  readonly editAddressLine = computed(() => (this.editCity() ? `${this.editAddress()}, ${this.editCity()}` : null));

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
    if (this.editForm.controls.whatsapp.invalid) {
      messages.push('eventDetail.validationWhatsapp');
    }
    if (this.editForm.controls.pinterest.invalid) {
      messages.push('eventDetail.validationPinterest');
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
      checkmarkOutline,
      trashOutline,
      heart,
      heartOutline,
      personAddOutline,
      personRemoveOutline,
      peopleOutline,
      refreshOutline,
      arrowUndoOutline,
      arrowRedoOutline,
      closeOutline,
      copyOutline,
      informationCircleOutline,
      gridOutline,
      cameraOutline,
    });

    this.disciplineService.getAll().subscribe({
      next: (list) => {
        if (list.length) {
          const sorted = sortByNameOrder(list, DISCIPLINE_NAMES);
          this.disciplines.set(sorted);
          if (this.isCreateMode() && !this.editDisciplineIds().length) {
            this.editDisciplineIds.set([sorted[0].id]);
            // Re-baseline over this auto-picked default so it doesn't itself
            // count as an unsaved edit - but only if the user hasn't actually
            // started editing yet in the meantime.
            if (!this.isEditDirty()) {
              this.captureEditBaseline();
            }
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
            if (!this.isEditDirty()) {
              this.captureEditBaseline();
            }
          }
        }
      },
    });

    this.originUrl = this.route.snapshot.queryParamMap.get('origin');

    const id = this.route.snapshot.paramMap.get('id');
    if (!id) {
      // /events/new?reuseFrom=<id> - "Reutilizar evento" on a finished event:
      // prefill this blank create form from it instead of starting from zero.
      // Stays on the loading spinner (isEditMode still false) until this
      // resolves, so the form - and its date pickers - render for the very
      // first time already showing the reused values. The pickers' buttons
      // are plain <button>s driven by editDateFromLabel/editDateToLabel, not
      // <ion-datetime-button> - see showDateFromPicker's comment for why.
      const reuseFromId = this.route.snapshot.queryParamMap.get('reuseFrom');
      if (reuseFromId) {
        this.eventService.getById(reuseFromId).subscribe({
          next: (source) => {
            if (source) {
              this.populateFormFromReuse(source);
            }
            this.finishEnteringCreateMode();
          },
          error: () => this.finishEnteringCreateMode(),
        });
        return;
      }
      // Plain /events/new - no event to load, start straight in (create) edit mode.
      this.finishEnteringCreateMode();
      return;
    }
    this.loadEvent(id);
  }

  /** Ionic keeps this page's instance alive for reuse (IonicRouteStrategy),
   * so all the constructor logic above only runs once - without this,
   * returning here from the "Gestores" screen (e.g. after removing yourself,
   * or someone else, as a manager) kept showing stale canManage()/relation
   * state until the whole app was reloaded. Re-fetching is skipped while
   * actively editing/creating, so it can't clobber in-progress form edits. */
  ionViewWillEnter(): void {
    // Always land on Información, not whatever tab this cached instance was
    // last left on (Ionic reuses the same page instance when you return to
    // an event you've already visited this session) - most noticeably, the
    // gallery lightbox's own "go to this event/user" link kept dropping you
    // straight into Galería if you'd left that event there before.
    this.detailViewMode.set('info');
    const event = this.event();
    if (!event || this.isEditMode()) {
      return;
    }
    this.loadEvent(event.id);
  }

  private finishEnteringCreateMode(): void {
    this.isCreateMode.set(true);
    this.isEditMode.set(true);
    // Starts wide (shows all of Catalunya around the map's default Barcelona
    // center) only for a genuinely blank new event - populateFormFromReuse
    // (called right before this, for "reutilizar evento") already set a real
    // lat/lng, so that case keeps the normal close-up zoom instead of
    // zooming back out. Jumps to close-up once a real location is picked, in
    // selectLocationSuggestion/reverseGeocodeEditTo above.
    if (!this.editLatitude() && !this.editLongitude()) {
      this.zoomLevel.set(8);
    }
    this.captureEditBaseline();
    this.loading.set(false);
  }

  /** Copies over everything that's likely to repeat for the next edition of
   * a recurring event (details, categories, price, location). The date/time
   * fields copy the *old* (past) dates rather than defaulting to right now -
   * a fresh "now" would look like an already-valid date and could slip
   * through unnoticed, while the old one is obviously stale and, if left
   * untouched, trips the existing "date must be in the future" check on
   * Guardar - forcing the organizer to actually pick the next edition's date. */
  private populateFormFromReuse(source: EventWithCreatorName): void {
    this.editForm.patchValue({
      title: source.title,
      description: source.description,
      additionalInfo: source.additionalInfo ?? '',
      imageUrl: source.imageUrl,
      isFree: source.isFree,
      price: source.price,
    });
    this.editTypeIds.set([...source.typeIds]);
    this.editDisciplineIds.set([...source.disciplineIds]);
    this.editDateFrom.set(source.eventDateFrom);
    this.editDateTo.set(source.eventDateTo);
    this.editAddress.set(source.address);
    this.editCity.set(source.city);
    this.editLatitude.set(source.latitude);
    this.editLongitude.set(source.longitude);
    this.editCitySuggestions.set([]);
  }

  private loadEvent(id: string): void {
    this.eventService.getById(id).subscribe({
      next: (event) => {
        this.event.set(event);
        this.notFound.set(!event);
        this.loading.set(false);
        this.refreshLikedState(event);
        this.refreshAttendanceState(event);
        this.refreshAttendeesCount(id);
        this.refreshLikesCount(id);
        this.refreshParticipants(id);
        this.refreshGallery(id);
      },
      error: () => {
        this.notFound.set(true);
        this.loading.set(false);
      },
    });
  }

  private refreshAttendeesCount(eventId: string): void {
    this.attendanceService.countByEvent(eventId).subscribe({
      next: (count) => this.attendeesCount.set(count),
      error: () => this.attendeesCount.set(0),
    });
  }

  private refreshLikesCount(eventId: string): void {
    this.favoriteService.countByEvent(eventId).subscribe({
      next: (count) => this.likesCount.set(count),
      error: () => this.likesCount.set(0),
    });
  }

  private refreshParticipants(eventId: string): void {
    this.eventManagerService.getParticipants(eventId).subscribe({
      next: (participants) => this.participants.set(participants),
      error: () => this.participants.set([]),
    });
  }

  respondToManagerInvite(accept: boolean): void {
    const event = this.event();
    if (!event || this.inviteResponseBusy()) {
      return;
    }
    this.inviteResponseBusy.set(true);
    this.eventManagerService.respondToInvite(event.id, accept).subscribe({
      next: () => {
        this.inviteResponseBusy.set(false);
        this.refreshParticipants(event.id);
      },
      error: () => this.inviteResponseBusy.set(false),
    });
  }

  confirmDeleteEvent(): void {
    this.confirmDelete.set(true);
  }

  deleteEventConfirmed(): void {
    const event = this.event();
    if (!event || this.deleting()) {
      return;
    }
    this.deleting.set(true);
    this.eventService.deleteEvent(event.id).subscribe({
      next: () => {
        this.deleting.set(false);
        this.confirmDelete.set(false);
        this.refreshNotifier.notifyChanged();
        this.router.navigateByUrl(this.originUrl ?? '/tabs/explorer');
      },
      error: () => this.deleting.set(false),
    });
  }

  /** The organizer always likes their own event - the backend creates a
   * Favorite record for the creator on createEvent(), so this is true
   * without needing to ask, same as the heart on <app-event-card>. */
  private refreshLikedState(event: EventWithCreatorName | null): void {
    const me = this.authService.currentUser();
    if (!event || !me) {
      this.isLiked.set(false);
      return;
    }
    if (event.creatorId === me.id) {
      this.isLiked.set(true);
      return;
    }
    this.favoriteService.isFavorited(me.id, event.id).subscribe({
      next: (isFavorited) => this.isLiked.set(isFavorited),
      error: () => this.isLiked.set(false),
    });
  }

  /** The organizer always attends their own event too - the backend creates
   * a real Attendance record for the creator on createEvent(). */
  private refreshAttendanceState(event: EventWithCreatorName | null): void {
    const me = this.authService.currentUser();
    if (!event || !me) {
      this.isAttending.set(false);
      return;
    }
    if (event.creatorId === me.id) {
      this.isAttending.set(true);
      return;
    }
    this.attendanceService.isAttending(me.id, event.id).subscribe({
      next: (isAttending) => this.isAttending.set(isAttending),
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
    this.directionsFlash.trigger();
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
    this.calendarFlash.trigger();
    if (this.isIOS()) {
      downloadIcs(buildIcs(event));
    } else {
      window.open(buildGoogleCalendarUrl(event), '_blank');
    }
  }

  // --- Share ----------------------------------------------------------------

  readonly shareText = signal('');
  readonly shareTextLoading = signal(false);
  readonly shareTextEditing = signal(false);
  // Editable HTML shown in the contenteditable box while editing (real
  // <b>/<i>/<s> markup, not the Unicode substitutes buildShareText uses).
  readonly shareTextDraft = signal('');
  // Set once the organizer has actually edited the text - lets copyShareText
  // offer a real rich-text clipboard payload instead of always falling back
  // to plain (see EXPERIMENTAL comment on copyShareText).
  private shareHtml: string | null = null;

  private readonly richTextEl = viewChild<ElementRef<HTMLDivElement>>('richTextEl');

  // Some share targets only keep one of {image, text} (see confirmShare's own
  // comment) - embedding the event/maps links straight into the text means
  // whichever one survives on its own still carries a working link, instead
  // of the link only existing in the `url` field Share.share() drops on
  // those targets.
  async openSharePreview(): Promise<void> {
    const event = this.event();
    if (!event) {
      return;
    }
    this.showSharePreviewModal.set(true);
    this.shareTextEditing.set(false);
    this.shareHtml = null;
    this.shareTextLoading.set(true);
    const preferences = [
      ...this.eventTypeTags().map((tag) => tag.name),
      ...this.disciplineTags().map((tag) => tag.name),
      event.isFree ? this.translate.instant('eventCard.free') : `${event.price} €`,
    ].join(' - ');
    const { text, html } = await this.shareService.buildShareText(event, preferences, this.dateLabel());
    this.shareHtml = html;
    this.shareText.set(text);
    this.shareTextLoading.set(false);
  }

  closeSharePreview(): void {
    this.showSharePreviewModal.set(false);
  }

  // See shared/sharing/share-hint.ts - Settings offers a way to reset this, same as
  // it does for the welcome tour.
  readonly showSharePreviewHint = signal(!isSharePreviewHintDismissed());

  onSharePreviewHintDismissChange(checked: boolean): void {
    if (!checked) {
      return;
    }
    dismissSharePreviewHint();
    this.showSharePreviewHint.set(false);
  }

  // Generated wording is a reasonable default, not the last word - the
  // organizer knows the event better than any template does, so they can
  // tweak the copy (fix a typo, add an emoji, shorten it) before it's
  // copied/shared, the same way they could if they'd typed it by hand.
  //
  // EXPERIMENTAL: editing now happens in a real contenteditable box so
  // bold/italic/strikethrough are genuine HTML formatting (via
  // execCommand), not the Unicode-lookalike trick buildShareText uses for
  // the auto-generated portions - trying this to see whether a rich
  // clipboard payload (see copyShareText) actually survives being pasted
  // into WhatsApp/Instagram/etc.'s composers, or gets stripped to plain
  // text the way a normal paste there does.
  startShareTextEdit(): void {
    this.shareTextDraft.set(this.shareHtml ?? escapeHtml(this.shareText()).replace(/\n/g, '<br>'));
    this.shareTextEditing.set(true);
  }

  // Discards whatever's in the contenteditable box - it was never written
  // back to shareText/shareHtml, so simply leaving edit mode is enough.
  cancelShareTextEdit(): void {
    this.shareTextEditing.set(false);
  }

  applyShareTextEdit(): void {
    const el = this.richTextEl()?.nativeElement;
    const html = el?.innerHTML ?? this.shareTextDraft();
    this.shareHtml = html;
    // htmlToShareText (not el.innerText) - innerText discards formatting
    // outright, so any bold/strikethrough just applied by hand would
    // silently vanish from the plain-text fallback that some share targets
    // end up using instead of the rich clipboard payload.
    this.shareText.set(this.shareService.htmlToShareText(html));
    this.shareTextEditing.set(false);
  }

  // mousedown on the toolbar buttons must not steal focus/selection away
  // from the contenteditable box before the click's execCommand runs, or
  // there'd be nothing left selected to format/undo/redo.
  preventFormatButtonFocusSteal(event: MouseEvent): void {
    event.preventDefault();
  }

  applyShareTextBold(): void {
    document.execCommand('bold');
  }

  applyShareTextItalic(): void {
    document.execCommand('italic');
  }

  applyShareTextStrikethrough(): void {
    document.execCommand('strikeThrough');
  }

  undoShareTextEdit(): void {
    document.execCommand('undo');
  }

  redoShareTextEdit(): void {
    document.execCommand('redo');
  }

  // Not every target the native share sheet offers actually combines the
  // image and text together (see confirmShare's own comment) - a dedicated
  // copy button lets the user grab the text on its own to paste by hand
  // wherever the image alone ended up (a WhatsApp Status, an Instagram
  // Story...).
  //
  // EXPERIMENTAL: once the text has been through the rich editor (see
  // applyShareTextEdit), this writes both an HTML and a plain-text payload
  // to the clipboard - real bold/italic/strikethrough for whatever target
  // paste is smart enough to use it, the same plain fallback as before for
  // everything else.
  async copyShareText(): Promise<void> {
    if (!navigator.clipboard) {
      return;
    }
    if (this.shareHtml && window.ClipboardItem) {
      try {
        await navigator.clipboard.write([
          new ClipboardItem({
            'text/html': new Blob([this.shareHtml], { type: 'text/html' }),
            'text/plain': new Blob([this.shareText()], { type: 'text/plain' }),
          }),
        ]);
        this.shareFeedback.set('copied');
        this.shareFlash.trigger();
        return;
      } catch {
        // Some platforms restrict multi-type clipboard writes - fall back
        // to the plain-text copy below rather than leaving nothing copied.
      }
    }
    await navigator.clipboard.writeText(this.shareText());
    this.shareFeedback.set('copied');
    this.shareFlash.trigger();
  }

  // Shares the event's own photo as a real image file rather than a link -
  // a URL-only share is *why* Instagram/Facebook only ever offered Message
  // as a target and WhatsApp Status stayed text-only (none of those unfurl
  // link previews the way a chat message does, but they all handle a real
  // image perfectly well, Reels/Story/Feed included). No `text` alongside
  // it: sharing both together is exactly what caused every earlier
  // platform-specific mismatch (Facebook dropping the text, Telegram
  // dropping the image...) - the copy-text button above is the deliberate,
  // reliable way to get the caption in, pasted by hand wherever it belongs.
  async confirmShare(): Promise<void> {
    const event = this.event();
    if (!event) {
      return;
    }
    this.shareFeedback.set('shared');
    this.shareFlash.trigger();
    // Falls back image -> native text share -> clipboard copy inside the
    // service (see EventShareService.shareEventImage) - only re-flash here
    // if it ended up on the "copied" fallback, correcting the optimistic
    // "shared" guess above with the more accurate wording.
    const outcome = await this.shareService.shareEventImage(event.imageUrl, event.id!, this.shareText());
    if (outcome === 'copied') {
      this.shareFeedback.set('copied');
      this.shareFlash.trigger();
    }
    this.showSharePreviewModal.set(false);
  }


  // --- Like (heart) -----------------------------------------------------

  /** Simple, immediate toggle - a plain "me gusta" with no further
   * implications and no series question, even on a recurring instance (see
   * toggleAttend below for the real RSVP, which does ask "this day or the
   * whole series?"). Same Favorite record the Favorites tab and Profile's
   * "Eventos" stat already read from. */
  toggleLike(): void {
    const event = this.event();
    const me = this.authService.currentUser();
    if (!event || !me || this.canManage() || this.likeLoading()) {
      return;
    }
    this.likeLoading.set(true);
    const wasLiked = this.isLiked();
    const request$ = wasLiked
      ? this.favoriteService.removeFromFavorites(me.id, event.id)
      : this.favoriteService.addToFavorites(me.id, event.id);
    request$.subscribe({
      next: () => {
        this.likesCount.update((count) => Math.max(0, count + (wasLiked ? -1 : 1)));
        this.likeFlash.trigger();
        setTimeout(() => {
          this.isLiked.set(!wasLiked);
          this.likeLoading.set(false);
        }, 900);
      },
      error: () => this.likeLoading.set(false),
    });
  }

  // --- Attend (real RSVP) ------------------------------------------------

  /** Set instead of immediately toggling when this event belongs to a
   * recurring series - see toggleAttend below and
   * <app-series-attend-confirm>'s own doc comment. */
  readonly pendingSeriesToggle = signal<{ wasAttending: boolean } | null>(null);

  /** The single attend icon does double duty: an organizer/manager (always
   * attending their own event, nothing to toggle) taps it to open the real
   * attendee list/management screen instead; anyone else toggles their own
   * attendance. */
  onAttendIconClick(): void {
    if (this.canManage()) {
      this.goToAttendees();
      return;
    }
    this.toggleAttend();
  }

  /** The real RSVP (AttendanceService) - creates/removes the Attendance
   * record behind the attendee list, the count, gallery-posting permission
   * and the organizer's notification, unlike the heart above. A series
   * instance asks "this day or the whole series?" first instead of assuming. */
  toggleAttend(): void {
    const event = this.event();
    const me = this.authService.currentUser();
    if (!event || !me || this.canManage() || this.attendLoading() || this.isEventOver()) {
      return;
    }
    if (event.seriesId) {
      this.pendingSeriesToggle.set({ wasAttending: this.isAttending() });
      return;
    }
    this.toggleSingleAttend();
  }

  confirmSeriesDayOnly(): void {
    this.pendingSeriesToggle.set(null);
    this.toggleSingleAttend();
  }

  confirmSeriesWhole(): void {
    const pending = this.pendingSeriesToggle();
    const event = this.event();
    const me = this.authService.currentUser();
    this.pendingSeriesToggle.set(null);
    if (!pending || !event?.seriesId || !me) {
      return;
    }
    this.attendLoading.set(true);
    const wasAttending = pending.wasAttending;
    const request$ = wasAttending
      ? this.attendanceService.removeSeriesAttendance(me.id, event.seriesId)
      : this.attendanceService.addSeriesAttendance(me.id, event.seriesId);
    request$.subscribe({
      next: () => {
        this.attendeesCount.update((count) => Math.max(0, count + (wasAttending ? -1 : 1)));
        this.attendFlash.trigger();
        if (!wasAttending) {
          // Marking attendance also likes the instance being viewed - see
          // toggleLike's own doc comment on the like/attend split.
          this.favoriteService.addToFavorites(me.id, event.id).subscribe({
            next: () => {
              this.isLiked.set(true);
              this.likesCount.update((count) => count + 1);
            },
          });
        }
        setTimeout(() => {
          this.isAttending.set(!wasAttending);
          this.attendLoading.set(false);
        }, 900);
      },
      error: () => this.attendLoading.set(false),
    });
  }

  cancelSeriesToggle(): void {
    this.pendingSeriesToggle.set(null);
  }

  private toggleSingleAttend(): void {
    const event = this.event();
    const me = this.authService.currentUser();
    if (!event || !me) {
      return;
    }
    this.attendLoading.set(true);
    const wasAttending = this.isAttending();
    const request$ = wasAttending
      ? this.attendanceService.removeAttendance(me.id, event.id)
      : this.attendanceService.addAttendance(me.id, event.id);
    request$.subscribe({
      next: () => {
        this.attendeesCount.update((count) => Math.max(0, count + (wasAttending ? -1 : 1)));
        this.attendFlash.trigger();
        if (!wasAttending) {
          this.favoriteService.addToFavorites(me.id, event.id).subscribe({
            next: () => {
              this.isLiked.set(true);
              this.likesCount.update((count) => count + 1);
            },
          });
        }
        // Same "flash the confirmation, then settle into the real state"
        // beat as saveEdit() - flipping isAttending immediately would swap
        // the icon/label straight to "No asistir" before anyone saw the
        // "Guardado ✓" confirmation.
        setTimeout(() => {
          this.isAttending.set(!wasAttending);
          this.attendLoading.set(false);
        }, 900);
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

  selectEditStatus(id: string): void {
    this.editStatus.set(id as EventStatus);
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
    const value = (ev as CustomEvent<{ value: string | string[] | null }>).detail.value;
    const iso = Array.isArray(value) ? value[0] : value;
    if (iso) {
      this.editDateFrom.update((current) => withTimePart(current, formatTimeInputValue(new Date(iso).getTime())));
      this.ensureDateOrder();
    }
  }

  onTimeToChange(ev: Event): void {
    const value = (ev as CustomEvent<{ value: string | string[] | null }>).detail.value;
    const iso = Array.isArray(value) ? value[0] : value;
    if (iso) {
      this.editDateTo.update((current) => withTimePart(current, formatTimeInputValue(new Date(iso).getTime())));
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
        this.zoomLevel.set(15);
      },
    });
  }

  /** Shared by "use my current location" (GPS) and tapping a pin on the map. */
  private reverseGeocodeEditTo(lat: number, lng: number): void {
    this.geocodingService.reverse(lat, lng).subscribe({
      next: (result) => {
        this.editLatitude.set(lat);
        this.editLongitude.set(lng);
        this.editAddress.set(result?.formattedAddress ?? '');
        this.editCity.set(result?.city ?? '');
        this.editLocatingMe.set(false);
        this.zoomLevel.set(15);
      },
      error: () => {
        this.editLatitude.set(lat);
        this.editLongitude.set(lng);
        this.editLocatingMe.set(false);
      },
    });
  }

  onEditPinMoved(coords: { lat: number; lng: number }): void {
    this.reverseGeocodeEditTo(coords.lat, coords.lng);
  }

  useCurrentLocationForEdit(): void {
    if (!navigator.geolocation) {
      return;
    }
    this.editLocatingMe.set(true);
    navigator.geolocation.getCurrentPosition(
      (position) => this.reverseGeocodeEditTo(position.coords.latitude, position.coords.longitude),
      () => this.editLocatingMe.set(false),
    );
  }

  // --- Edit mode: enter/cancel/save ------------------------------------------

  /** "Reutilizar evento" on a finished event - opens a blank create form
   * (see populateFormFromReuse) instead of editing this now-past one in
   * place, which would just fail validation on its stale date. */
  reuseEvent(): void {
    const event = this.event();
    if (!event) {
      return;
    }
    this.router.navigate(['/events/new'], {
      queryParams: { reuseFrom: event.id, origin: this.originUrl },
    });
  }

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
      allowAttendeePhotos: event.allowAttendeePhotos,
      instagram: event.socialLinks?.instagram ?? '',
      facebook: event.socialLinks?.facebook ?? '',
      tiktok: event.socialLinks?.tiktok ?? '',
      youtube: event.socialLinks?.youtube ?? '',
      website: event.socialLinks?.website ?? '',
      whatsapp: event.socialLinks?.whatsapp ?? '',
      pinterest: event.socialLinks?.pinterest ?? '',
    });
    this.activeSocialNetworks.set(ALL_SOCIAL_NETWORKS.filter((key) => !!event.socialLinks?.[key]));
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
    this.captureEditBaseline();
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
    if (!this.editValid()) {
      this.showValidationModal.set(true);
      return;
    }
    // Checked separately from editValid()/editValidationMessages() - unlike a
    // missing field, this isn't "fix it and tap Guardar again", it's "your
    // edits can't be saved as-is", so it gets its own modal (Ignorar/Corregir
    // fecha) instead of joining the generic missing-fields list.
    if (!this.recurrenceRule() && this.editDateFrom() < Date.now()) {
      this.showDateInvalidModal.set(true);
      return;
    }
    this.saveEdit();
  }

  closeValidationModal(): void {
    this.showValidationModal.set(false);
  }

  /** "Ignorar" on the date-invalid modal - same as tapping Cancelar: discard
   * the in-progress edit and leave (back to the list for a new event, back to
   * view mode for an existing one). */
  discardDateInvalidChanges(): void {
    this.showDateInvalidModal.set(false);
    this.cancelEdit();
  }

  /** The other option isn't "Aplicar" (the date is still invalid, saving
   * would just fail the same check again) - it closes the modal and leaves
   * the form as-is so the organizer can correct the date/time themselves. */
  dismissDateInvalidModal(): void {
    this.showDateInvalidModal.set(false);
  }

  saveEdit(): void {
    // Guards re-entrancy at the method itself, not just via the Guardar
    // button's [disabled]="saving()" - saveEdit() has a second call site
    // (onUnsavedChangesModalDismiss's "Aplicar" path), which bypasses that
    // binding entirely. Two real duplicate events got created this way: tap
    // Guardar, then - while that request is still in flight - navigate away
    // and confirm "Aplicar" on the resulting unsaved-changes prompt.
    if (this.saving() || !this.editValid()) {
      return;
    }
    const formValue = this.editForm.getRawValue();
    const socialLinks: SocialLinks = {
      instagram: formValue.instagram || undefined,
      facebook: formValue.facebook || undefined,
      tiktok: formValue.tiktok || undefined,
      youtube: formValue.youtube || undefined,
      website: formValue.website || undefined,
      whatsapp: formValue.whatsapp || undefined,
      pinterest: formValue.pinterest || undefined,
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
      const rule = this.recurrenceRule();
      if (rule) {
        // status isn't part of CreateEventSeriesPayload - every instance is
        // created 'published' (see EventService.createEventSeries, backend).
        const { status: _status, eventDateFrom: _from, eventDateTo: _to, ...seriesFields } = commonFields;
        const seriesPayload: CreateEventSeriesPayload = {
          ...seriesFields,
          creatorId: me.id,
          recurrence: rule,
          timeFrom: formatTimeInputValue(this.editDateFrom()),
          timeTo: formatTimeInputValue(this.editDateTo()),
        };
        this.eventService.createSeries(seriesPayload).subscribe({
          next: ({ events }) => {
            this.saving.set(false);
            this.isEditMode.set(false);
            this.refreshNotifier.notifyChanged();
            const first = events[0];
            if (this.originUrl) {
              this.router.navigateByUrl(this.originUrl, { replaceUrl: true });
            } else if (first) {
              this.router.navigate(['/events', first.id], { replaceUrl: true });
            }
          },
          error: () => this.saving.set(false),
        });
        return;
      }
      const payload: CreateEventPayload = { ...commonFields, creatorId: me.id };
      this.eventService.createEvent(payload).subscribe({
        next: (created) => {
          this.saving.set(false);
          // Leaves isEditMode() true and the form still full of the content
          // that was just saved - canLeave() (the CanDeactivate guard) reads
          // that as "unsaved changes" and would otherwise pop its own
          // "Cambios sin guardar" prompt right on top of *this* navigation.
          // Tapping "Aplicar" there re-ran saveEdit() a second time, which is
          // exactly how a "reused" event ended up created twice.
          this.isEditMode.set(false);
          // Ionic's tab pages don't reliably re-fire ionViewWillEnter on the
          // forward navigation below (see EventListRefreshService), so the
          // origin list is told directly instead of relying on it noticing
          // the new event on its own.
          this.refreshNotifier.notifyChanged();
          // Returns to wherever this create flow actually started (the
          // origin tab/screen - see originUrl) via a normal forward
          // navigation, so Ionic's own view-cache/lifecycle handling stays
          // intact and ionViewWillEnter re-fires there to refresh the list
          // with the new event. Falls back to the new event's own detail
          // page if no origin was carried through (e.g. opened from
          // Notifications, which doesn't set one).
          if (this.originUrl) {
            this.router.navigateByUrl(this.originUrl, { replaceUrl: true });
          } else {
            this.router.navigate(['/events', created.id], { replaceUrl: true });
          }
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
    // allowAttendeePhotos isn't part of commonFields - it's excluded from
    // CreateEventPayload/CreateEventSeriesPayload (backend defaults it, see
    // Event.allowAttendeePhotos's doc comment), so it's only added here, on
    // the update-an-existing-event branch.
    const payload: UpdateEventPayload = { ...commonFields, allowAttendeePhotos: formValue.allowAttendeePhotos };
    const rule = this.recurrenceRule();
    this.eventService.updateEvent(event.id, payload).subscribe({
      next: () => {
        this.event.set({ ...event, ...payload });
        // Editing an event with no seriesId of its own can turn it into the
        // first instance of a brand-new series - see the "Repetir" field
        // shown below when !event().seriesId. Field edits above are saved
        // first so the newly-generated instances copy the up-to-date content.
        if (rule && !event.seriesId) {
          this.eventService.attachRecurrence(event.id, rule).subscribe({
            next: ({ events }) => {
              const first = events[0];
              if (first) {
                this.event.set({ ...this.event()!, ...first });
              }
              this.recurrenceRule.set(null);
              this.finishSaveEdit();
            },
            error: () => this.finishSaveEdit(),
          });
          return;
        }
        this.finishSaveEdit();
      },
      error: () => this.saving.set(false),
    });
  }

  /** Shared tail of saveEdit()'s edit-mode branch - keeps the form (and its
   * now-disabled Save button, still reading "saving") on screen just long
   * enough to read "Guardado ✓" before collapsing back to view mode,
   * whether or not attachRecurrence() also ran. */
  private finishSaveEdit(): void {
    this.savedFlash.trigger();
    setTimeout(() => {
      this.saving.set(false);
      this.isEditMode.set(false);
    }, 900);
  }
}
