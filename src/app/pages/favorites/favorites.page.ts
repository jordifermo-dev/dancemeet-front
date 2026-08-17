import { AfterViewInit, Component, ElementRef, NgZone, OnDestroy, OnInit, ViewChild, computed, effect, inject, signal, untracked } from '@angular/core';
import { Router } from '@angular/router';
import {
  IonHeader,
  IonToolbar,
  IonTitle,
  IonButtons,
  IonContent,
  IonSearchbar,
  IonIcon,
  IonButton,
  IonModal,
  IonSpinner,
  ViewWillEnter,
} from '@ionic/angular/standalone';
import { TranslatePipe } from '@ngx-translate/core';
import { addIcons } from 'ionicons';
import {
  locationOutline,
  close,
  locateOutline,
  calendarOutline,
  listOutline,
  optionsOutline,
  chevronDownOutline,
  addCircleOutline,
  refreshOutline,
  checkmarkOutline,
  closeOutline,
} from 'ionicons/icons';
import { AuthService } from '../../services/auth.service';
import { FavoriteService } from '../../services/favorite.service';
import { EventListRefreshService } from '../../services/event-list-refresh.service';
import { DisciplineService } from '../../services/discipline.service';
import { EventTypeService } from '../../services/event-type.service';
import { CitySuggestion, GeocodingService } from '../../services/geocoding.service';
import { LanguageService } from '../../services/language.service';
import {
  Discipline,
  DISCIPLINE_NAMES,
  EventType,
  EVENT_TYPE_NAMES,
  EventStatus,
  EVENT_STATUSES,
  PriceOption,
  RelationOption,
  FavoritedEvent,
} from '../../models';
import { sortByNameOrder, STATUS_LABEL_KEYS } from '../../shared/icon-catalog';
import { haversineDistanceMeters } from '../../shared/maps';
import { toggleWithMinimum } from '../../shared/min-selection';
import { MinSelectionWarningService } from '../../shared/min-selection-warning.service';
import { EventCardComponent } from '../../shared/event-card/event-card.component';
import { NotificationBellComponent } from '../../shared/notification-bell/notification-bell.component';
import { EventCardView } from '../../shared/event-card/event-card.model';
import { buildEventCardView } from '../../shared/event-card/build-event-card-view';
import { EventCalendarComponent } from '../../shared/event-calendar/event-calendar.component';
import { CalendarGranularityToggleComponent } from '../../shared/event-calendar/calendar-granularity-toggle.component';
import { CalendarGranularity } from '../../shared/event-calendar/event-calendar.model';
import { recoverAttendState } from '../../shared/attend-toggle';
import { EVENT_SORT_OPTIONS, EventSortMode, sortEvents } from '../../shared/event-sort';
import { SortPreferenceService } from '../../services/sort-preference.service';
import { DateQuickOption, ExplorerFiltersService } from '../explorer/explorer-filters.service';
import { createApplyFlash } from '../../shared/success-flash';
import { FilterSheetHeaderComponent } from '../../shared/filter-sheet-header/filter-sheet-header.component';
import { FilterActionsRowComponent } from '../../shared/filter-actions-row/filter-actions-row.component';
import { ChipGridComponent } from '../../shared/chip-grid/chip-grid.component';
import { FilterAllChipEvent, FilterAllComponent } from '../../shared/filter-all/filter-all.component';
import { DatePickerFieldComponent } from '../../shared/date-picker-field/date-picker-field.component';
import { LocationPickerComponent } from '../../shared/location-picker/location-picker.component';
import { MapType } from '../../shared/maps';
import {
  disciplineChipItems,
  eventTypeChipItems,
  optionChipItems,
  priceChipItems,
  quickDateChipItems,
  statusChipItems,
} from '../../shared/chip-grid/chip-grid-presets';

type RelationFilter = RelationOption;
const RELATION_OPTIONS: { id: RelationFilter; labelKey: string }[] = [
  { id: 'attendee', labelKey: 'favorites.relationAttendee' },
  { id: 'organizer', labelKey: 'favorites.relationOrganizer' },
];
const PRICE_OPTIONS: { id: PriceOption; labelKey: string }[] = [
  { id: 'free', labelKey: 'explorer.priceFreeOption' },
  { id: 'paid', labelKey: 'explorer.pricePaidOption' },
];
const MIN_ZOOM = 3;
const MAX_ZOOM = 20;

@Component({
  selector: 'app-favorites',
  standalone: true,
  templateUrl: 'favorites.page.html',
  styleUrls: ['favorites.page.scss'],
  imports: [
    IonHeader,
    IonToolbar,
    IonTitle,
    IonButtons,
    IonContent,
    IonSearchbar,
    IonIcon,
    IonButton,
    IonModal,
    IonSpinner,
    TranslatePipe,
    EventCardComponent,
    NotificationBellComponent,
    FilterSheetHeaderComponent,
    FilterActionsRowComponent,
    ChipGridComponent,
    FilterAllComponent,
    DatePickerFieldComponent,
    LocationPickerComponent,
    EventCalendarComponent,
    CalendarGranularityToggleComponent,
  ],
})
export class FavoritesPage implements OnInit, AfterViewInit, OnDestroy, ViewWillEnter {
  private readonly router = inject(Router);
  private readonly authService = inject(AuthService);
  private readonly favoriteService = inject(FavoriteService);
  private readonly refreshNotifier = inject(EventListRefreshService);
  private readonly disciplineService = inject(DisciplineService);
  private readonly eventTypeService = inject(EventTypeService);
  private readonly geocodingService = inject(GeocodingService);
  private readonly languageService = inject(LanguageService);
  readonly minSelectionWarning = inject(MinSelectionWarningService);
  /** Only its pure date helpers (quickDateRange/toDateOnlyIso/...) are reused
   * here - Favorites keeps its own draft/applied signals, entirely separate
   * from Explorer's shared filter state. */
  private readonly dateUtils = inject(ExplorerFiltersService);
  private readonly ngZone = inject(NgZone);
  private readonly sortPreference = inject(SortPreferenceService);

  @ViewChild('topOverlay') private topOverlayRef?: ElementRef<HTMLDivElement>;
  private overlayResizeObserver?: ResizeObserver;
  /** Real measured height of the fixed search/filter overlay, so the list's
   * top padding always clears it exactly - a hardcoded guess drifts the
   * moment a pill wraps to a second line or a translation runs longer. */
  readonly listTopPadding = signal(110);

  private searchInputTimer: ReturnType<typeof setTimeout> | null = null;
  private cityInputTimer: ReturnType<typeof setTimeout> | null = null;

  readonly loading = signal(true);
  readonly searchTerm = signal('');
  readonly allEvents = signal<FavoritedEvent[]>([]);
  readonly disciplines = signal<Discipline[]>([]);
  readonly eventTypes = signal<EventType[]>([]);
  readonly statusOptions = EVENT_STATUSES.map((id) => ({ id, labelKey: STATUS_LABEL_KEYS[id] }));
  readonly relationOptions = RELATION_OPTIONS;
  readonly priceOptions = PRICE_OPTIONS;
  readonly sortOptions = EVENT_SORT_OPTIONS;
  // Shared with Events so the chosen order survives switching tabs.
  readonly sortMode = this.sortPreference.eventSortMode;
  readonly isSortModalOpen = signal(false);
  readonly currentSortLabelKey = computed(
    () => this.sortOptions.find((option) => option.id === this.sortMode())?.labelKey ?? this.sortOptions[0].labelKey,
  );

  // --- Local filter state (independent from Explorer's) --------------------
  readonly draftDisciplineIds = signal<string[]>([]);
  readonly appliedDisciplineIds = signal<string[]>([]);
  readonly draftEventTypeIds = signal<string[]>([]);
  readonly appliedEventTypeIds = signal<string[]>([]);
  readonly draftStatuses = signal<EventStatus[]>([...EVENT_STATUSES]);
  readonly appliedStatuses = signal<EventStatus[]>([...EVENT_STATUSES]);
  readonly draftRelation = signal<RelationFilter[]>(['organizer', 'attendee']);
  readonly appliedRelation = signal<RelationFilter[]>(['organizer', 'attendee']);
  readonly draftPriceOptions = signal<PriceOption[]>(['free', 'paid']);
  readonly appliedPriceOptions = signal<PriceOption[]>(['free', 'paid']);
  /** Default date range matches Explorer's baseline (today onward, no end
   * date) instead of leaving both ends unbounded - showing every event ever
   * favorited, including long-past ones, isn't a useful default. */
  private readonly initialDateRange = this.dateUtils.quickDateRange('today');
  readonly draftDateFrom = signal<number | undefined>(this.initialDateRange.from);
  readonly appliedDateFrom = signal<number | undefined>(this.initialDateRange.from);
  readonly draftDateTo = signal<number | undefined>(this.initialDateRange.to);
  readonly appliedDateTo = signal<number | undefined>(this.initialDateRange.to);
  /** Fallback seed for <app-date-picker-field>'s [value] when draftDateFrom/
   * draftDateTo are unset - it always needs a real timestamp to open the
   * calendar on, even though "unset" is a valid filter state. */
  readonly nowTimestamp = Date.now();

  /** Distance/location default to whatever's saved on the user's profile
   * (see profile.page.ts's own distanceRange/city/lat/lng), same fallback
   * (50km, no coordinates) ExplorerFiltersService.seedLocationFromProfile()
   * uses when the profile has none set. */
  private readonly profileDefaults = this.authService.currentUser();
  readonly draftCity = signal(this.profileDefaults?.city || '');
  readonly appliedCity = signal(this.profileDefaults?.city || '');
  readonly appliedAddress = signal(this.profileDefaults?.address || '');
  readonly draftDistanceRange = signal(this.profileDefaults?.distanceRange || 50);
  readonly appliedDistanceRange = signal(this.profileDefaults?.distanceRange || 50);
  readonly draftLatitude = signal<number | null>(this.profileDefaults?.latitude || null);
  readonly appliedLatitude = signal<number | null>(this.profileDefaults?.latitude || null);
  readonly draftLongitude = signal<number | null>(this.profileDefaults?.longitude || null);
  readonly appliedLongitude = signal<number | null>(this.profileDefaults?.longitude || null);

  readonly citySuggestions = signal<CitySuggestion[]>([]);
  readonly locatingMe = signal(false);
  readonly zoomLevel = signal(15);
  readonly mapType = signal<MapType>('roadmap');
  /** Search box text (register/profile's `editAddress` pattern) - live while
   * typing, then overwritten with the full formatted address once a
   * suggestion is picked, GPS resolves, or a pin is dropped. Kept separate
   * from `draftCity`, which only ever holds the short, *resolved* city name
   * (never a half-typed fragment) since that's the value that actually gets
   * applied/saved as the filter's "city". */
  readonly draftAddress = signal('');
  /** Only truthy once a real location is resolved (mirrors `draftCity` being
   * empty while still typing) - shows the full address line below the search
   * box, or the hint text while nothing's resolved yet. */
  readonly resolvedAddressLine = computed(() => (this.draftCity() ? this.draftAddress() : null));

  readonly isDisciplineModalOpen = signal(false);
  readonly isEventTypeModalOpen = signal(false);
  readonly isStatusModalOpen = signal(false);
  readonly isRelationModalOpen = signal(false);
  readonly isPriceModalOpen = signal(false);
  readonly isDateModalOpen = signal(false);
  readonly isLocationModalOpen = signal(false);
  readonly isGenericFilterModalOpen = signal(false);

  readonly draftDateFromIso = computed(() => {
    const from = this.draftDateFrom();
    return from !== undefined ? this.dateUtils.toDateOnlyIso(from) : null;
  });
  readonly draftDateToIso = computed(() => {
    const to = this.draftDateTo();
    return to !== undefined ? this.dateUtils.toDateOnlyIso(to) : null;
  });
  readonly draftActiveQuickDate = computed(() => this.dateUtils.matchQuickDate(this.draftDateFrom(), this.draftDateTo()));

  readonly disciplineChips = computed(() => disciplineChipItems(this.disciplines(), this.draftDisciplineIds()));
  readonly eventTypeChips = computed(() => eventTypeChipItems(this.eventTypes(), this.draftEventTypeIds()));
  readonly statusChips = computed(() => statusChipItems(this.statusOptions, this.draftStatuses()));
  readonly relationChips = computed(() => optionChipItems(this.relationOptions, this.draftRelation()));
  readonly priceChips = computed(() => priceChipItems(this.priceOptions, this.draftPriceOptions()));
  readonly quickDateChips = computed(() => quickDateChipItems(this.draftActiveQuickDate()));

  readonly disciplinesById = computed(() => new Map(this.disciplines().map((d) => [d.id, d])));
  readonly eventTypesById = computed(() => new Map(this.eventTypes().map((e) => [e.id, e])));

  /** List vs calendar - independent per screen (not shared with Events/
   * user-events, unlike sort mode), so it's just a local signal, not
   * SortPreferenceService-style shared state. */
  readonly viewMode = signal<'list' | 'calendar'>('list');
  /** Owns the Mes/Semana/Día choice so the toggle (rendered in this page's
   * own fixed top-overlay) and <app-event-calendar>'s grid (rendered below,
   * scrollable) stay in sync. */
  readonly calendarGranularity = signal<CalendarGranularity>('month');

  /** Same filter dimensions as Explorer (discipline/event type/status/date/
   * location/search), plus "organize vs attend", applied client-side since a
   * user's own events are already a small, fully-loaded list - entirely
   * local to this screen, no shared state and nothing gets persisted. Kept
   * as its own computed (rather than inlined into cardViews) so the
   * calendar view can bucket these same raw, already-filtered events by day
   * instead of duplicating this whole filter chain. */
  readonly filteredEvents = computed<FavoritedEvent[]>(() => {
    const term = this.searchTerm().trim().toLowerCase();
    const disciplineIds = this.appliedDisciplineIds();
    const typeIds = this.appliedEventTypeIds();
    const statuses = this.appliedStatuses();
    const relations = this.appliedRelation();
    const priceOptions = this.appliedPriceOptions();
    const dateFrom = this.appliedDateFrom();
    const dateTo = this.appliedDateTo();
    const lat = this.appliedLatitude();
    const lng = this.appliedLongitude();
    const radiusMeters = this.appliedDistanceRange() * 1000;
    const wantsOrganizer = relations.includes('organizer');
    const wantsAttendee = relations.includes('attendee');

    return this.allEvents()
      .filter((event) => event.disciplineIds.some((id) => disciplineIds.includes(id)))
      .filter((event) => event.typeIds.some((id) => typeIds.includes(id)))
      .filter((event) => statuses.includes(event.status))
      .filter((event) => {
        const isOrganizer = event.relation === 'creator';
        const isAttendee = event.relation === 'favorite';
        return (wantsOrganizer && isOrganizer) || (wantsAttendee && isAttendee);
      })
      .filter((event) => priceOptions.includes(event.isFree ? 'free' : 'paid'))
      .filter((event) => dateFrom === undefined || event.eventDateFrom >= dateFrom)
      .filter((event) => dateTo === undefined || event.eventDateFrom <= dateTo)
      .filter((event) => !term || event.title.toLowerCase().includes(term) || event.creatorName.toLowerCase().includes(term))
      .filter((event) => {
        if (lat === null || lng === null) {
          return true;
        }
        return haversineDistanceMeters(lat, lng, event.latitude, event.longitude) <= radiusMeters;
      });
  });

  readonly cardViews = computed<EventCardView[]>(() => {
    const disciplinesById = this.disciplinesById();
    const eventTypesById = this.eventTypesById();
    const lang = this.languageService.currentLang();
    const currentUserId = this.authService.currentUser()?.id;
    return sortEvents(this.filteredEvents(), this.sortMode()).map((event) =>
      buildEventCardView(event, disciplinesById, eventTypesById, lang, currentUserId),
    );
  });

  constructor() {
    addIcons({
      locationOutline,
      close,
      locateOutline,
      calendarOutline,
      listOutline,
      optionsOutline,
      chevronDownOutline,
      addCircleOutline,
      refreshOutline,
      checkmarkOutline,
      closeOutline,
    });

    // A just-created/reused event shows up here without waiting for
    // ionViewWillEnter, which doesn't reliably re-fire on the forward
    // navigation saveEdit() uses to return here (see EventListRefreshService).
    effect(() => {
      this.refreshNotifier.version();
      untracked(() => this.loadFavorites());
    });
  }

  ngOnInit(): void {
    this.disciplineService.getAll().subscribe({
      next: (disciplines) => {
        if (disciplines.length) {
          const sorted = sortByNameOrder(disciplines, DISCIPLINE_NAMES);
          this.disciplines.set(sorted);
          const ids = sorted.map((d) => d.id);
          this.draftDisciplineIds.set(ids);
          this.appliedDisciplineIds.set(ids);
        }
      },
    });
    this.eventTypeService.getAll().subscribe({
      next: (eventTypes) => {
        if (eventTypes.length) {
          const sorted = sortByNameOrder(eventTypes, EVENT_TYPE_NAMES);
          this.eventTypes.set(sorted);
          const ids = sorted.map((e) => e.id);
          this.draftEventTypeIds.set(ids);
          this.appliedEventTypeIds.set(ids);
        }
      },
    });
    this.loadFavorites();
  }

  /** Ionic keeps this tab's instance alive, so re-fetch every time it's
   * re-entered - otherwise editing an event on its detail page and coming
   * back here would still show the stale, pre-edit card. */
  ionViewWillEnter(): void {
    this.loadFavorites();
  }

  ngAfterViewInit(): void {
    const el = this.topOverlayRef?.nativeElement;
    if (!el) {
      return;
    }
    // Measure synchronously right away too - ResizeObserver's first callback
    // is async, so relying on it alone left the initial paint using the
    // rough `110` default guess, which was short enough for the first card
    // to peek out from under the overlay until that first callback landed.
    this.listTopPadding.set(Math.ceil(el.offsetHeight) + 16);
    if (typeof ResizeObserver === 'undefined') {
      return;
    }
    this.overlayResizeObserver = new ResizeObserver(() => {
      // Runs outside Angular's zone (native ResizeObserver isn't zone-patched
      // here), so without an explicit ngZone.run the signal update could sit
      // unrendered until some unrelated zone event happened to trigger CD -
      // leaving the first card visibly peeking out from under the overlay
      // until then.
      this.ngZone.run(() => {
        // offsetHeight (not entries[0].contentRect, which excludes the
        // overlay's own padding) - the smaller content-box figure left the
        // list's first card peeking out from under the overlay by that amount.
        this.listTopPadding.set(Math.ceil(el.offsetHeight) + 16);
      });
    });
    this.overlayResizeObserver.observe(el);
  }

  ngOnDestroy(): void {
    this.overlayResizeObserver?.disconnect();
  }

  /** Guards attend/unattend requests in flight per event id - a doubled tap
   * otherwise fires the handler twice before the first request's response
   * updates the list, sending a duplicate remove call the backend rejects
   * with a "not found" error. */
  private readonly attendBusyIds = signal<Set<string>>(new Set());

  /** <app-event-card>'s (attendToggle) - it already refuses to emit for the
   * organizer's own event or a finished/cancelled one, so every card here
   * that can fire this is currently attending (that's the only way a
   * non-organizer event lands in this list); un-attending removes it from
   * the list entirely, since it's no longer one of "my" events. */
  onAttendToggle(eventId: string): void {
    const userId = this.authService.currentUser()?.id;
    if (!userId || this.attendBusyIds().has(eventId)) {
      return;
    }
    this.attendBusyIds.update((ids) => new Set(ids).add(eventId));
    this.favoriteService.removeFromFavorites(userId, eventId).subscribe({
      next: () => this.allEvents.update((events) => events.filter((event) => event.id !== eventId)),
      error: (err) => {
        if (recoverAttendState(err, true) === false) {
          this.allEvents.update((events) => events.filter((event) => event.id !== eventId));
        }
        this.attendBusyIds.update((ids) => {
          const next = new Set(ids);
          next.delete(eventId);
          return next;
        });
      },
    });
  }

  private loadFavorites(): void {
    const user = this.authService.currentUser();
    if (!user) {
      this.loading.set(false);
      return;
    }
    this.loading.set(true);
    this.favoriteService.getFavoritedEvents(user.id).subscribe({
      next: (events) => {
        this.allEvents.set(events);
        this.loading.set(false);
      },
      error: () => this.loading.set(false),
    });
  }

  onSearchChange(value: string | null | undefined): void {
    const term = value ?? '';
    if (this.searchInputTimer) {
      clearTimeout(this.searchInputTimer);
    }
    this.searchInputTimer = setTimeout(() => this.searchTerm.set(term), 300);
  }

  openSortModal(): void {
    this.isSortModalOpen.set(true);
  }

  selectSort(value: EventSortMode): void {
    this.sortMode.set(value);
    this.isSortModalOpen.set(false);
  }

  // --- "Reestablecer filtros" helpers: restore whatever's saved on the
  // profile (same fields Explorer's resetX() pulls from), falling back to
  // "everything selected"/neutral only when the user never set a preference. --

  private profileDisciplineIds(): string[] {
    const user = this.authService.currentUser();
    return user?.disciplineIds?.length ? [...user.disciplineIds] : this.disciplines().map((d) => d.id);
  }

  private profileEventTypeIds(): string[] {
    const user = this.authService.currentUser();
    return user?.eventTypeIds?.length ? [...user.eventTypeIds] : this.eventTypes().map((e) => e.id);
  }

  private profileStatuses(): EventStatus[] {
    const user = this.authService.currentUser();
    return (user?.statusIds?.length ? [...user.statusIds] : [...EVENT_STATUSES]) as EventStatus[];
  }

  private profileDateRange(): { from: number | undefined; to: number | undefined } {
    const user = this.authService.currentUser();
    if (user?.eventDateFrom !== undefined && user?.eventDateFrom !== null) {
      return { from: user.eventDateFrom, to: user.eventDateTo ?? undefined };
    }
    const { from, to } = this.dateUtils.quickDateRange('today');
    return { from, to };
  }

  // --- Discipline modal ------------------------------------------------

  openDisciplineModal(): void {
    this.draftDisciplineIds.set([...this.appliedDisciplineIds()]);
    this.isDisciplineModalOpen.set(true);
  }

  toggleDraftDiscipline(id: string): void {
    this.draftDisciplineIds.update((ids) => toggleWithMinimum(ids, id, () => this.minSelectionWarning.flash('disciplines')));
  }

  readonly disciplineApplyFlash = createApplyFlash(() => this.isDisciplineModalOpen.set(false));

  applyDisciplineFilter(): void {
    this.appliedDisciplineIds.set(this.draftDisciplineIds());
    this.disciplineApplyFlash.trigger();
  }

  clearDisciplineFilter(): void {
    const ids = this.profileDisciplineIds();
    this.draftDisciplineIds.set(ids);
    this.appliedDisciplineIds.set(ids);
    this.isDisciplineModalOpen.set(false);
  }

  // --- Event type modal --------------------------------------------------

  openEventTypeModal(): void {
    this.draftEventTypeIds.set([...this.appliedEventTypeIds()]);
    this.isEventTypeModalOpen.set(true);
  }

  toggleDraftEventType(id: string): void {
    this.draftEventTypeIds.update((ids) => toggleWithMinimum(ids, id, () => this.minSelectionWarning.flash('eventTypes')));
  }

  readonly eventTypeApplyFlash = createApplyFlash(() => this.isEventTypeModalOpen.set(false));

  applyEventTypeFilter(): void {
    this.appliedEventTypeIds.set(this.draftEventTypeIds());
    this.eventTypeApplyFlash.trigger();
  }

  clearEventTypeFilter(): void {
    const ids = this.profileEventTypeIds();
    this.draftEventTypeIds.set(ids);
    this.appliedEventTypeIds.set(ids);
    this.isEventTypeModalOpen.set(false);
  }

  // --- Status modal --------------------------------------------------------

  openStatusModal(): void {
    this.draftStatuses.set([...this.appliedStatuses()]);
    this.isStatusModalOpen.set(true);
  }

  toggleDraftStatus(id: string): void {
    const status = id as EventStatus;
    this.draftStatuses.update((ids) => toggleWithMinimum(ids, status, () => this.minSelectionWarning.flash('statuses')));
  }

  readonly statusApplyFlash = createApplyFlash(() => this.isStatusModalOpen.set(false));

  applyStatusFilter(): void {
    this.appliedStatuses.set(this.draftStatuses());
    this.statusApplyFlash.trigger();
  }

  clearStatusFilter(): void {
    const statuses = this.profileStatuses();
    this.draftStatuses.set(statuses);
    this.appliedStatuses.set(statuses);
    this.isStatusModalOpen.set(false);
  }

  // --- Relation modal (organize / attend) -----------------------------------

  openRelationModal(): void {
    this.draftRelation.set([...this.appliedRelation()]);
    this.isRelationModalOpen.set(true);
  }

  toggleDraftRelation(id: string): void {
    const relation = id as RelationFilter;
    this.draftRelation.update((ids) => toggleWithMinimum(ids, relation, () => this.minSelectionWarning.flash('relation')));
  }

  readonly relationApplyFlash = createApplyFlash(() => this.isRelationModalOpen.set(false));

  applyRelationFilter(): void {
    this.appliedRelation.set(this.draftRelation());
    this.relationApplyFlash.trigger();
  }

  clearRelationFilter(): void {
    const all: RelationFilter[] = ['organizer', 'attendee'];
    this.draftRelation.set(all);
    this.appliedRelation.set(all);
    this.isRelationModalOpen.set(false);
  }

  // --- Price modal (free / paid) --------------------------------------------

  openPriceModal(): void {
    this.draftPriceOptions.set([...this.appliedPriceOptions()]);
    this.isPriceModalOpen.set(true);
  }

  toggleDraftPriceOption(id: string): void {
    const price = id as PriceOption;
    this.draftPriceOptions.update((ids) => toggleWithMinimum(ids, price, () => this.minSelectionWarning.flash('priceOptions')));
  }

  readonly priceApplyFlash = createApplyFlash(() => this.isPriceModalOpen.set(false));

  applyPriceFilter(): void {
    this.appliedPriceOptions.set(this.draftPriceOptions());
    this.priceApplyFlash.trigger();
  }

  clearPriceFilter(): void {
    const all: PriceOption[] = ['free', 'paid'];
    this.draftPriceOptions.set(all);
    this.appliedPriceOptions.set(all);
    this.isPriceModalOpen.set(false);
  }

  // --- Date modal ------------------------------------------------------

  openDateModal(): void {
    this.draftDateFrom.set(this.appliedDateFrom());
    this.draftDateTo.set(this.appliedDateTo());
    this.isDateModalOpen.set(true);
  }

  setDraftQuickDate(option: string): void {
    const { from, to } = this.dateUtils.quickDateRange(option as DateQuickOption);
    this.draftDateFrom.set(from);
    this.draftDateTo.set(to);
  }

  /** Keeps "hasta" always on/after "desde" - whichever field the user just
   * touched wins, the other snaps to match instead of silently allowing an
   * inverted range that matches zero events. */
  onDraftDateFromChange(event: Event): void {
    const value = (event as CustomEvent<{ value: string | string[] | null }>).detail.value;
    const iso = Array.isArray(value) ? value[0] : value;
    if (!iso) {
      return;
    }
    const from = this.dateUtils.startOfDayFromIso(iso);
    this.draftDateFrom.set(from);
    const to = this.draftDateTo();
    if (to !== undefined && to < from) {
      this.draftDateTo.set(this.dateUtils.endOfDayFromIso(iso));
    }
  }

  onDraftDateToChange(event: Event): void {
    const value = (event as CustomEvent<{ value: string | string[] | null }>).detail.value;
    const iso = Array.isArray(value) ? value[0] : value;
    if (!iso) {
      return;
    }
    const to = this.dateUtils.endOfDayFromIso(iso);
    this.draftDateTo.set(to);
    const from = this.draftDateFrom();
    if (from !== undefined && to < from) {
      this.draftDateFrom.set(this.dateUtils.startOfDayFromIso(iso));
    }
  }

  clearDraftDateFrom(): void {
    this.draftDateFrom.set(undefined);
  }

  clearDraftDateTo(): void {
    this.draftDateTo.set(undefined);
  }

  readonly dateApplyFlash = createApplyFlash(() => this.isDateModalOpen.set(false));

  applyDateFilter(): void {
    this.appliedDateFrom.set(this.draftDateFrom());
    this.appliedDateTo.set(this.draftDateTo());
    this.dateApplyFlash.trigger();
  }

  clearDateFilter(): void {
    const { from, to } = this.profileDateRange();
    this.draftDateFrom.set(from);
    this.draftDateTo.set(to);
    this.appliedDateFrom.set(from);
    this.appliedDateTo.set(to);
    this.isDateModalOpen.set(false);
  }

  // --- Location modal ----------------------------------------------------

  goToCreateEvent(): void {
    this.router.navigate(['/events/new'], { queryParams: { origin: '/tabs/favorites' } });
  }

  toggleViewMode(): void {
    this.viewMode.update((mode) => (mode === 'list' ? 'calendar' : 'list'));
  }

  openLocationModal(): void {
    this.citySuggestions.set([]);
    this.draftDistanceRange.set(this.appliedDistanceRange());
    this.draftLatitude.set(this.appliedLatitude());
    this.draftLongitude.set(this.appliedLongitude());
    this.draftCity.set(this.appliedCity());
    this.draftAddress.set(this.appliedAddress());
    this.isLocationModalOpen.set(true);
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

  onDistanceChange(value: number): void {
    this.draftDistanceRange.set(value);
  }

  onCityInput(value: string | null | undefined): void {
    const query = (value ?? '').trim();
    this.draftAddress.set(value ?? '');
    this.draftCity.set('');
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

  selectCitySuggestion(suggestion: CitySuggestion): void {
    this.geocodingService.place(suggestion.placeId).subscribe({
      next: (result) => {
        if (!result) {
          return;
        }
        this.draftLatitude.set(result.latitude);
        this.draftLongitude.set(result.longitude);
        this.draftCity.set(result.city);
        this.draftAddress.set(result.formattedAddress);
        this.citySuggestions.set([]);
      },
    });
  }

  /** Shared by "use my current location" (GPS) and tapping a pin on the map. */
  private reverseGeocodeTo(lat: number, lng: number): void {
    this.geocodingService.reverse(lat, lng).subscribe({
      next: (result) => {
        this.draftLatitude.set(lat);
        this.draftLongitude.set(lng);
        this.draftCity.set(result?.city ?? '');
        this.draftAddress.set(result?.formattedAddress ?? '');
        this.locatingMe.set(false);
      },
      error: () => {
        this.draftLatitude.set(lat);
        this.draftLongitude.set(lng);
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
      () => this.locatingMe.set(false),
    );
  }

  readonly locationApplyFlash = createApplyFlash(() => this.isLocationModalOpen.set(false));

  applyLocationFilter(): void {
    this.appliedDistanceRange.set(this.draftDistanceRange());
    this.appliedLatitude.set(this.draftLatitude());
    this.appliedLongitude.set(this.draftLongitude());
    this.appliedCity.set(this.draftCity());
    this.appliedAddress.set(this.draftAddress());
    this.locationApplyFlash.trigger();
  }

  /** Labeled "Reestablecer filtros" (there's no profile save here to make
   * "Eliminar" vs "Reestablecer" mean different things) - goes back to the
   * same profile-seeded city/distance/coordinates the page loads with. */
  clearLocationFilter(): void {
    const user = this.authService.currentUser();
    const city = user?.city || '';
    const address = user?.address || '';
    const distanceRange = user?.distanceRange || 50;
    const latitude = user?.latitude || null;
    const longitude = user?.longitude || null;
    this.draftCity.set(city);
    this.draftAddress.set(address);
    this.draftDistanceRange.set(distanceRange);
    this.draftLatitude.set(latitude);
    this.draftLongitude.set(longitude);
    this.appliedCity.set(city);
    this.appliedAddress.set(address);
    this.appliedDistanceRange.set(distanceRange);
    this.appliedLatitude.set(latitude);
    this.appliedLongitude.set(longitude);
    this.isLocationModalOpen.set(false);
  }

  // --- Generic filter modal (all categories together, mirrors the pills) --

  openGenericFilterModal(): void {
    this.draftDisciplineIds.set([...this.appliedDisciplineIds()]);
    this.draftEventTypeIds.set([...this.appliedEventTypeIds()]);
    this.draftStatuses.set([...this.appliedStatuses()]);
    this.draftRelation.set([...this.appliedRelation()]);
    this.draftPriceOptions.set([...this.appliedPriceOptions()]);
    this.draftDateFrom.set(this.appliedDateFrom());
    this.draftDateTo.set(this.appliedDateTo());
    this.isGenericFilterModalOpen.set(true);
  }

  onGenericFilterChipToggle(event: FilterAllChipEvent): void {
    switch (event.category) {
      case 'eventTypes':
        this.toggleDraftEventType(event.id);
        break;
      case 'disciplines':
        this.toggleDraftDiscipline(event.id);
        break;
      case 'statuses':
        this.toggleDraftStatus(event.id);
        break;
      case 'price':
        this.toggleDraftPriceOption(event.id);
        break;
      case 'quickDate':
        this.setDraftQuickDate(event.id);
        break;
      case 'relation':
        this.toggleDraftRelation(event.id);
        break;
    }
  }

  readonly genericApplyFlash = createApplyFlash(() => this.isGenericFilterModalOpen.set(false));

  applyGenericFilter(): void {
    this.appliedDisciplineIds.set(this.draftDisciplineIds());
    this.appliedEventTypeIds.set(this.draftEventTypeIds());
    this.appliedStatuses.set(this.draftStatuses());
    this.appliedRelation.set(this.draftRelation());
    this.appliedPriceOptions.set(this.draftPriceOptions());
    this.appliedDateFrom.set(this.draftDateFrom());
    this.appliedDateTo.set(this.draftDateTo());
    this.genericApplyFlash.trigger();
  }

  clearGenericFilter(): void {
    const disciplineIds = this.profileDisciplineIds();
    const eventTypeIds = this.profileEventTypeIds();
    const statuses = this.profileStatuses();
    const allRelations: RelationFilter[] = ['organizer', 'attendee'];
    const allPriceOptions: PriceOption[] = ['free', 'paid'];

    this.draftDisciplineIds.set(disciplineIds);
    this.appliedDisciplineIds.set(disciplineIds);
    this.draftEventTypeIds.set(eventTypeIds);
    this.appliedEventTypeIds.set(eventTypeIds);
    this.draftStatuses.set(statuses);
    this.appliedStatuses.set(statuses);
    this.draftRelation.set(allRelations);
    this.appliedRelation.set(allRelations);
    this.draftPriceOptions.set(allPriceOptions);
    this.appliedPriceOptions.set(allPriceOptions);
    const { from, to } = this.profileDateRange();
    this.draftDateFrom.set(from);
    this.draftDateTo.set(to);
    this.appliedDateFrom.set(from);
    this.appliedDateTo.set(to);

    this.isGenericFilterModalOpen.set(false);
  }
}
