import {
  AfterViewInit,
  Component,
  ElementRef,
  OnDestroy,
  OnInit,
  ViewChild,
  computed,
  inject,
  signal,
} from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import {
  IonHeader,
  IonToolbar,
  IonTitle,
  IonButtons,
  IonBackButton,
  IonContent,
  IonSearchbar,
  IonIcon,
  IonButton,
  IonModal,
  IonRange,
  IonSpinner,
  IonDatetime,
  IonDatetimeButton,
  ViewWillEnter,
} from '@ionic/angular/standalone';
import { TranslatePipe } from '@ngx-translate/core';
import { addIcons } from 'ionicons';
import { locationOutline, close, locateOutline, calendarOutline, optionsOutline } from 'ionicons/icons';
import { AuthService } from '../../services/auth.service';
import { FavoriteService } from '../../services/favorite.service';
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
  FavoritedEvent,
} from '../../models';
import { disciplineIconUrl, eventTypeIconUrl, statusIconUrl, sortByNameOrder, STATUS_LABEL_KEYS } from '../../shared/icon-catalog';
import { haversineDistanceMeters } from '../../shared/maps';
import { toggleWithMinimum } from '../../shared/min-selection';
import { MinSelectionWarningService } from '../../shared/min-selection-warning.service';
import { EventCardComponent } from '../../shared/event-card/event-card.component';
import { EventCardView } from '../../shared/event-card/event-card.model';
import { buildEventCardView } from '../../shared/event-card/build-event-card-view';
import { DateQuickOption, ExplorerFiltersService } from '../explorer/explorer-filters.service';

type RelationFilter = 'organizer' | 'attendee';
const RELATION_OPTIONS: { id: RelationFilter; labelKey: string }[] = [
  { id: 'organizer', labelKey: 'favorites.relationOrganizer' },
  { id: 'attendee', labelKey: 'favorites.relationAttendee' },
];

/** "X's events" list (organized + favorited) - your own (no ?userId) or
 * someone else's (from their follower/following profile). Same card,
 * filters and behavior as Favorites, just scoped to whichever user the
 * ?userId query param points at instead of always "me". */
@Component({
  selector: 'app-user-events',
  standalone: true,
  templateUrl: 'user-events.page.html',
  styleUrls: ['user-events.page.scss'],
  imports: [
    IonHeader,
    IonToolbar,
    IonTitle,
    IonButtons,
    IonBackButton,
    IonContent,
    IonSearchbar,
    IonIcon,
    IonButton,
    IonModal,
    IonRange,
    IonSpinner,
    IonDatetime,
    IonDatetimeButton,
    TranslatePipe,
    EventCardComponent,
  ],
})
export class UserEventsPage implements OnInit, AfterViewInit, OnDestroy, ViewWillEnter {
  private readonly route = inject(ActivatedRoute);
  private readonly authService = inject(AuthService);
  private readonly favoriteService = inject(FavoriteService);
  private readonly disciplineService = inject(DisciplineService);
  private readonly eventTypeService = inject(EventTypeService);
  private readonly geocodingService = inject(GeocodingService);
  private readonly languageService = inject(LanguageService);
  readonly minSelectionWarning = inject(MinSelectionWarningService);
  /** Only its pure date helpers (quickDateRange/toDateOnlyIso/...) are reused
   * here - this page keeps its own draft/applied signals, entirely separate
   * from Explorer's shared filter state. */
  private readonly dateUtils = inject(ExplorerFiltersService);

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

  readonly disciplineIconUrl = disciplineIconUrl;
  readonly eventTypeIconUrl = eventTypeIconUrl;
  readonly statusIconUrl = statusIconUrl;

  // --- Local filter state (independent from Explorer's/Favorites') --------
  readonly draftDisciplineIds = signal<string[]>([]);
  readonly appliedDisciplineIds = signal<string[]>([]);
  readonly draftEventTypeIds = signal<string[]>([]);
  readonly appliedEventTypeIds = signal<string[]>([]);
  readonly draftStatuses = signal<EventStatus[]>([...EVENT_STATUSES]);
  readonly appliedStatuses = signal<EventStatus[]>([...EVENT_STATUSES]);
  readonly draftRelation = signal<RelationFilter[]>(['organizer', 'attendee']);
  readonly appliedRelation = signal<RelationFilter[]>(['organizer', 'attendee']);
  readonly draftDateFrom = signal<number | undefined>(undefined);
  readonly appliedDateFrom = signal<number | undefined>(undefined);
  readonly draftDateTo = signal<number | undefined>(undefined);
  readonly appliedDateTo = signal<number | undefined>(undefined);

  readonly draftCity = signal('');
  readonly appliedCity = signal('');
  readonly draftDistanceRange = signal(100);
  readonly appliedDistanceRange = signal(100);
  readonly draftLatitude = signal<number | null>(null);
  readonly appliedLatitude = signal<number | null>(null);
  readonly draftLongitude = signal<number | null>(null);
  readonly appliedLongitude = signal<number | null>(null);

  readonly citySuggestions = signal<CitySuggestion[]>([]);
  readonly locatingMe = signal(false);

  readonly isDisciplineModalOpen = signal(false);
  readonly isEventTypeModalOpen = signal(false);
  readonly isStatusModalOpen = signal(false);
  readonly isRelationModalOpen = signal(false);
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

  private readonly disciplinesById = computed(() => new Map(this.disciplines().map((d) => [d.id, d])));
  private readonly eventTypesById = computed(() => new Map(this.eventTypes().map((e) => [e.id, e])));

  /** Same filter dimensions as Favorites (discipline/event type/status/date/
   * location/search/organize-attend), applied client-side since one user's
   * events are already a small, fully-loaded list. */
  readonly cardViews = computed<EventCardView[]>(() => {
    const term = this.searchTerm().trim().toLowerCase();
    const disciplineIds = this.appliedDisciplineIds();
    const typeIds = this.appliedEventTypeIds();
    const statuses = this.appliedStatuses();
    const relations = this.appliedRelation();
    const dateFrom = this.appliedDateFrom();
    const dateTo = this.appliedDateTo();
    const lat = this.appliedLatitude();
    const lng = this.appliedLongitude();
    const radiusMeters = this.appliedDistanceRange() * 1000;
    const disciplinesById = this.disciplinesById();
    const eventTypesById = this.eventTypesById();
    const lang = this.languageService.currentLang();
    const currentUserId = this.authService.currentUser()?.id;
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
      .filter((event) => dateFrom === undefined || event.eventDateFrom >= dateFrom)
      .filter((event) => dateTo === undefined || event.eventDateFrom <= dateTo)
      .filter((event) => !term || event.title.toLowerCase().includes(term))
      .filter((event) => {
        if (lat === null || lng === null) {
          return true;
        }
        return haversineDistanceMeters(lat, lng, event.latitude, event.longitude) <= radiusMeters;
      })
      .sort((a, b) => b.eventDateFrom - a.eventDateFrom)
      .map((event) => buildEventCardView(event, disciplinesById, eventTypesById, lang, currentUserId));
  });

  constructor() {
    addIcons({ locationOutline, close, locateOutline, calendarOutline, optionsOutline });

    // queryParamMap emits immediately on subscribe (covers the initial load)
    // and again whenever ?userId changes without recreating this component -
    // e.g. browsing from one user's events into another's.
    this.route.queryParamMap.subscribe(() => this.loadEvents());
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
  }

  ngAfterViewInit(): void {
    const el = this.topOverlayRef?.nativeElement;
    if (!el || typeof ResizeObserver === 'undefined') {
      return;
    }
    this.overlayResizeObserver = new ResizeObserver(() => {
      // offsetHeight (not entries[0].contentRect, which excludes the
      // overlay's own padding) - the smaller content-box figure left the
      // list's first card peeking out from under the overlay by that amount.
      this.listTopPadding.set(Math.ceil(el.offsetHeight) + 16);
    });
    this.overlayResizeObserver.observe(el);
  }

  ngOnDestroy(): void {
    this.overlayResizeObserver?.disconnect();
  }

  /** Re-fetch every time this page is re-entered - Ionic keeps the instance
   * alive, so coming back here should still show fresh data. */
  ionViewWillEnter(): void {
    this.loadEvents();
  }

  private loadEvents(): void {
    const userId = this.route.snapshot.queryParamMap.get('userId') ?? this.authService.currentUser()?.id;
    if (!userId) {
      this.loading.set(false);
      return;
    }
    this.loading.set(true);
    this.favoriteService.getFavoritedEvents(userId).subscribe({
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

  // --- Discipline modal ------------------------------------------------

  openDisciplineModal(): void {
    this.draftDisciplineIds.set([...this.appliedDisciplineIds()]);
    this.isDisciplineModalOpen.set(true);
  }

  toggleDraftDiscipline(id: string): void {
    this.draftDisciplineIds.update((ids) => toggleWithMinimum(ids, id, () => this.minSelectionWarning.flash('disciplines')));
  }

  applyDisciplineFilter(): void {
    this.appliedDisciplineIds.set(this.draftDisciplineIds());
    this.isDisciplineModalOpen.set(false);
  }

  clearDisciplineFilter(): void {
    const allIds = this.disciplines().map((d) => d.id);
    this.draftDisciplineIds.set(allIds);
    this.appliedDisciplineIds.set(allIds);
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

  applyEventTypeFilter(): void {
    this.appliedEventTypeIds.set(this.draftEventTypeIds());
    this.isEventTypeModalOpen.set(false);
  }

  clearEventTypeFilter(): void {
    const allIds = this.eventTypes().map((e) => e.id);
    this.draftEventTypeIds.set(allIds);
    this.appliedEventTypeIds.set(allIds);
    this.isEventTypeModalOpen.set(false);
  }

  // --- Status modal --------------------------------------------------------

  openStatusModal(): void {
    this.draftStatuses.set([...this.appliedStatuses()]);
    this.isStatusModalOpen.set(true);
  }

  toggleDraftStatus(id: EventStatus): void {
    this.draftStatuses.update((ids) => toggleWithMinimum(ids, id, () => this.minSelectionWarning.flash('statuses')));
  }

  applyStatusFilter(): void {
    this.appliedStatuses.set(this.draftStatuses());
    this.isStatusModalOpen.set(false);
  }

  clearStatusFilter(): void {
    this.draftStatuses.set([...EVENT_STATUSES]);
    this.appliedStatuses.set([...EVENT_STATUSES]);
    this.isStatusModalOpen.set(false);
  }

  // --- Relation modal (organize / attend) -----------------------------------

  openRelationModal(): void {
    this.draftRelation.set([...this.appliedRelation()]);
    this.isRelationModalOpen.set(true);
  }

  toggleDraftRelation(id: RelationFilter): void {
    this.draftRelation.update((ids) => toggleWithMinimum(ids, id, () => this.minSelectionWarning.flash('relation')));
  }

  applyRelationFilter(): void {
    this.appliedRelation.set(this.draftRelation());
    this.isRelationModalOpen.set(false);
  }

  clearRelationFilter(): void {
    const all: RelationFilter[] = ['organizer', 'attendee'];
    this.draftRelation.set(all);
    this.appliedRelation.set(all);
    this.isRelationModalOpen.set(false);
  }

  // --- Date modal ------------------------------------------------------

  openDateModal(): void {
    this.draftDateFrom.set(this.appliedDateFrom());
    this.draftDateTo.set(this.appliedDateTo());
    this.isDateModalOpen.set(true);
  }

  setDraftQuickDate(option: DateQuickOption): void {
    const { from, to } = this.dateUtils.quickDateRange(option);
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

  clearDraftDateTo(): void {
    this.draftDateTo.set(undefined);
  }

  applyDateFilter(): void {
    this.appliedDateFrom.set(this.draftDateFrom());
    this.appliedDateTo.set(this.draftDateTo());
    this.isDateModalOpen.set(false);
  }

  clearDateFilter(): void {
    this.draftDateFrom.set(undefined);
    this.draftDateTo.set(undefined);
    this.appliedDateFrom.set(undefined);
    this.appliedDateTo.set(undefined);
    this.isDateModalOpen.set(false);
  }

  // --- Location modal ----------------------------------------------------

  openLocationModal(): void {
    this.citySuggestions.set([]);
    this.draftDistanceRange.set(this.appliedDistanceRange());
    this.draftLatitude.set(this.appliedLatitude());
    this.draftLongitude.set(this.appliedLongitude());
    this.draftCity.set(this.appliedCity());
    this.isLocationModalOpen.set(true);
  }

  onDistanceChange(event: Event): void {
    const value = (event as CustomEvent<{ value: number }>).detail.value;
    this.draftDistanceRange.set(value);
  }

  onCityInput(value: string | null | undefined): void {
    const query = (value ?? '').trim();
    this.draftCity.set(value ?? '');
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
        this.citySuggestions.set([]);
      },
    });
  }

  useCurrentLocation(): void {
    if (!navigator.geolocation) {
      return;
    }
    this.locatingMe.set(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const lat = position.coords.latitude;
        const lng = position.coords.longitude;
        this.geocodingService.reverse(lat, lng).subscribe({
          next: (result) => {
            this.draftLatitude.set(lat);
            this.draftLongitude.set(lng);
            this.draftCity.set(result?.city ?? '');
            this.locatingMe.set(false);
          },
          error: () => {
            this.draftLatitude.set(lat);
            this.draftLongitude.set(lng);
            this.locatingMe.set(false);
          },
        });
      },
      () => this.locatingMe.set(false),
    );
  }

  applyLocationFilter(): void {
    this.appliedDistanceRange.set(this.draftDistanceRange());
    this.appliedLatitude.set(this.draftLatitude());
    this.appliedLongitude.set(this.draftLongitude());
    this.appliedCity.set(this.draftCity());
    this.isLocationModalOpen.set(false);
  }

  clearLocationFilter(): void {
    this.draftCity.set('');
    this.draftDistanceRange.set(100);
    this.draftLatitude.set(null);
    this.draftLongitude.set(null);
    this.appliedCity.set('');
    this.appliedDistanceRange.set(100);
    this.appliedLatitude.set(null);
    this.appliedLongitude.set(null);
    this.isLocationModalOpen.set(false);
  }

  // --- Generic filter modal (all categories together, mirrors the pills) --

  openGenericFilterModal(): void {
    this.draftDisciplineIds.set([...this.appliedDisciplineIds()]);
    this.draftEventTypeIds.set([...this.appliedEventTypeIds()]);
    this.draftStatuses.set([...this.appliedStatuses()]);
    this.draftRelation.set([...this.appliedRelation()]);
    this.draftDateFrom.set(this.appliedDateFrom());
    this.draftDateTo.set(this.appliedDateTo());
    this.isGenericFilterModalOpen.set(true);
  }

  applyGenericFilter(): void {
    this.appliedDisciplineIds.set(this.draftDisciplineIds());
    this.appliedEventTypeIds.set(this.draftEventTypeIds());
    this.appliedStatuses.set(this.draftStatuses());
    this.appliedRelation.set(this.draftRelation());
    this.appliedDateFrom.set(this.draftDateFrom());
    this.appliedDateTo.set(this.draftDateTo());
    this.isGenericFilterModalOpen.set(false);
  }

  clearGenericFilter(): void {
    const allDisciplineIds = this.disciplines().map((d) => d.id);
    const allEventTypeIds = this.eventTypes().map((e) => e.id);
    const allRelations: RelationFilter[] = ['organizer', 'attendee'];

    this.draftDisciplineIds.set(allDisciplineIds);
    this.appliedDisciplineIds.set(allDisciplineIds);
    this.draftEventTypeIds.set(allEventTypeIds);
    this.appliedEventTypeIds.set(allEventTypeIds);
    this.draftStatuses.set([...EVENT_STATUSES]);
    this.appliedStatuses.set([...EVENT_STATUSES]);
    this.draftRelation.set(allRelations);
    this.appliedRelation.set(allRelations);
    this.draftDateFrom.set(undefined);
    this.draftDateTo.set(undefined);
    this.appliedDateFrom.set(undefined);
    this.appliedDateTo.set(undefined);

    this.isGenericFilterModalOpen.set(false);
  }
}
