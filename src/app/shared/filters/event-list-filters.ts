import { NgZone, computed, inject, signal } from '@angular/core';
import { AuthService } from '../../services/core/auth.service';
import { DisciplineService } from '../../services/event/discipline.service';
import { EventTypeService } from '../../services/event/event-type.service';
import { CitySuggestion, GeocodingService } from '../../services/location/geocoding.service';
import { GalleryService } from '../../services/gallery/gallery.service';
import { EventListViewMode } from '../event/view-mode-menu/view-mode-menu.component';
import { SortPreferenceService } from '../../services/filters/sort-preference.service';
import { MinSelectionWarningService } from './min-selection-warning.service';
import { toggleWithMinimum } from './min-selection';
import { createApplyFlash } from '../common/success-flash';
import { EVENT_SORT_OPTIONS, EventSortMode } from '../event/event-sort';
import { DateQuickOption, ExplorerFiltersService } from '../../services/filters/explorer-filters.service';
import { sortByNameOrder, STATUS_LABEL_KEYS } from '../event/icon-catalog';
import { MapType } from '../location/maps';
import {
  Discipline,
  DISCIPLINE_NAMES,
  EventType,
  EVENT_TYPE_NAMES,
  EventStatus,
  EVENT_STATUSES,
  GalleryCover,
  PriceOption,
} from '../../models';
import {
  disciplineChipItems,
  eventTypeChipItems,
  optionChipItems,
  priceChipItems,
  quickDateChipItems,
  statusChipItems,
} from './chip-grid/chip-grid-presets';
import { FilterAllChipEvent } from './filter-all/filter-all.component';
import { CalendarGranularity } from '../calendar/event-calendar/event-calendar.model';

export type RelationFilter = 'organizer' | 'attendee';

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

/** Whether the date filter (and its "reestablecer" fallback) defaults to
 * "today onward" (Favorites - showing every event ever favorited, including
 * long-past ones, isn't a useful default) or fully unbounded (My/someone
 * else's events - past and finished/cancelled ones should still show up). */
export type EventListDateMode = 'upcomingOnly' | 'unbounded';

/** Everything Favorites and User-events share: discipline/event type/status/
 * relation/price/date/location filters (draft + applied, their 8 modals,
 * chip computeds), sort, search debounce, and the generic "all filters"
 * modal - previously hand-duplicated across the two ~1000-line page files
 * almost verbatim. Each page still owns its own data loading, attend-toggle
 * behavior and cardViews computed (they differ in real, page-specific ways -
 * see FavoritesPage/UserEventsPage's own comments). */
export function createEventListFilters(dateMode: EventListDateMode) {
  const authService = inject(AuthService);
  const disciplineService = inject(DisciplineService);
  const eventTypeService = inject(EventTypeService);
  const geocodingService = inject(GeocodingService);
  const minSelectionWarning = inject(MinSelectionWarningService);
  const dateUtils = inject(ExplorerFiltersService);
  const sortPreference = inject(SortPreferenceService);
  const galleryService = inject(GalleryService);

  const defaultDateRange = (): { from: number | undefined; to: number | undefined } => {
    if (dateMode !== 'upcomingOnly') {
      return { from: undefined, to: undefined };
    }
    const range = dateUtils.quickDateRange('today');
    return { from: range.from, to: range.to };
  };

  let searchInputTimer: ReturnType<typeof setTimeout> | null = null;
  let cityInputTimer: ReturnType<typeof setTimeout> | null = null;

  const loading = signal(true);
  const searchTerm = signal('');
  const disciplines = signal<Discipline[]>([]);
  const eventTypes = signal<EventType[]>([]);
  const statusOptions = EVENT_STATUSES.map((id) => ({ id, labelKey: STATUS_LABEL_KEYS[id] }));
  const relationOptions = RELATION_OPTIONS;
  const priceOptions = PRICE_OPTIONS;
  const sortOptions = EVENT_SORT_OPTIONS;
  // Shared with Events (and each other) so the chosen order survives switching screens.
  const sortMode = sortPreference.eventSortMode;
  const isSortModalOpen = signal(false);
  const currentSortLabelKey = computed(
    () => sortOptions.find((option) => option.id === sortMode())?.labelKey ?? sortOptions[0].labelKey,
  );

  const draftDisciplineIds = signal<string[]>([]);
  const appliedDisciplineIds = signal<string[]>([]);
  const draftEventTypeIds = signal<string[]>([]);
  const appliedEventTypeIds = signal<string[]>([]);
  const draftStatuses = signal<EventStatus[]>([...EVENT_STATUSES]);
  const appliedStatuses = signal<EventStatus[]>([...EVENT_STATUSES]);
  const draftRelation = signal<RelationFilter[]>(['organizer', 'attendee']);
  const appliedRelation = signal<RelationFilter[]>(['organizer', 'attendee']);
  const draftPriceOptions = signal<PriceOption[]>(['free', 'paid']);
  const appliedPriceOptions = signal<PriceOption[]>(['free', 'paid']);
  const initialDateRange = defaultDateRange();
  const draftDateFrom = signal<number | undefined>(initialDateRange.from);
  const appliedDateFrom = signal<number | undefined>(initialDateRange.from);
  const draftDateTo = signal<number | undefined>(initialDateRange.to);
  const appliedDateTo = signal<number | undefined>(initialDateRange.to);
  /** Fallback seed for <app-date-picker-field>'s [value] when draftDateFrom/
   * draftDateTo are unset - it always needs a real timestamp to open the
   * calendar on, even though "unset" is a valid filter state. */
  const nowTimestamp = Date.now();

  /** Distance/location default to whatever's saved on the logged-in user's
   * own profile (see profile.page.ts's own distanceRange/city/lat/lng), same
   * fallback (50km, no coordinates) ExplorerFiltersService.
   * seedLocationFromProfile() uses when the profile has none set. */
  const profileDefaults = authService.currentUser();
  const draftCity = signal(profileDefaults?.city || '');
  const appliedCity = signal(profileDefaults?.city || '');
  const appliedAddress = signal(profileDefaults?.address || '');
  const draftDistanceRange = signal(profileDefaults?.distanceRange || 50);
  const appliedDistanceRange = signal(profileDefaults?.distanceRange || 50);
  const draftLatitude = signal<number | null>(profileDefaults?.latitude || null);
  const appliedLatitude = signal<number | null>(profileDefaults?.latitude || null);
  const draftLongitude = signal<number | null>(profileDefaults?.longitude || null);
  const appliedLongitude = signal<number | null>(profileDefaults?.longitude || null);

  const citySuggestions = signal<CitySuggestion[]>([]);
  const locatingMe = signal(false);
  const zoomLevel = signal(15);
  const mapType = signal<MapType>('roadmap');
  /** Search box text (register/profile's `editAddress` pattern) - live while
   * typing, then overwritten with the full formatted address once a
   * suggestion is picked, GPS resolves, or a pin is dropped. Kept separate
   * from `draftCity`, which only ever holds the short, *resolved* city name
   * (never a half-typed fragment) since that's the value that actually gets
   * applied/saved as the filter's "city". */
  const draftAddress = signal('');
  /** Only truthy once a real location is resolved (mirrors `draftCity` being
   * empty while still typing) - shows the full address line below the search
   * box, or the hint text while nothing's resolved yet. */
  const resolvedAddressLine = computed(() => (draftCity() ? draftAddress() : null));

  const isDisciplineModalOpen = signal(false);
  const isEventTypeModalOpen = signal(false);
  const isStatusModalOpen = signal(false);
  const isRelationModalOpen = signal(false);
  const isPriceModalOpen = signal(false);
  const isDateModalOpen = signal(false);
  const isLocationModalOpen = signal(false);
  const isGenericFilterModalOpen = signal(false);

  const draftDateFromIso = computed(() => {
    const from = draftDateFrom();
    return from !== undefined ? dateUtils.toDateOnlyIso(from) : null;
  });
  const draftDateToIso = computed(() => {
    const to = draftDateTo();
    return to !== undefined ? dateUtils.toDateOnlyIso(to) : null;
  });
  const draftActiveQuickDate = computed(() => dateUtils.matchQuickDate(draftDateFrom(), draftDateTo()));

  const disciplineChips = computed(() => disciplineChipItems(disciplines(), draftDisciplineIds()));
  const eventTypeChips = computed(() => eventTypeChipItems(eventTypes(), draftEventTypeIds()));
  const statusChips = computed(() => statusChipItems(statusOptions, draftStatuses()));
  const relationChips = computed(() => optionChipItems(relationOptions, draftRelation()));
  const priceChips = computed(() => priceChipItems(priceOptions, draftPriceOptions()));
  const quickDateChips = computed(() => quickDateChipItems(draftActiveQuickDate()));

  const disciplinesById = computed(() => new Map(disciplines().map((d) => [d.id, d])));
  const eventTypesById = computed(() => new Map(eventTypes().map((e) => [e.id, e])));

  /** List vs calendar vs gallery ("browse by photo", Wikiloc-style) -
   * independent per screen, so it's just a local signal, not
   * SortPreferenceService-style shared state. */
  const viewMode = signal<EventListViewMode>('list');
  /** Owns the Mes/Semana/Día choice so the toggle (rendered in the page's own
   * fixed top-overlay) and <app-event-calendar>'s grid stay in sync. */
  const calendarGranularity = signal<CalendarGranularity>('month');

  /** Cover photo (+count) per event, keyed by event id - only fetched on
   * demand (see refreshGalleryCovers) while viewMode is 'gallery', so the
   * normal list/calendar responses stay unbloated. */
  const galleryCoverUrls = signal<Record<string, GalleryCover>>({});

  /** Called by the consuming page (with whatever event ids it's currently
   * showing) whenever viewMode flips to 'gallery' or the underlying list
   * changes while already in that mode. */
  function refreshGalleryCovers(eventIds: string[]): void {
    if (!eventIds.length) {
      galleryCoverUrls.set({});
      return;
    }
    galleryService.getCoverPhotos(eventIds).subscribe({
      next: (covers) => galleryCoverUrls.set(covers),
      error: () => galleryCoverUrls.set({}),
    });
  }

  /** Real measured height of the fixed search/filter overlay, so the list's
   * top padding always clears it exactly - a hardcoded guess drifts the
   * moment a pill wraps to a second line or a translation runs longer. */
  const listTopPadding = signal(110);

  function loadTaxonomies(): void {
    disciplineService.getAll().subscribe({
      next: (result) => {
        if (result.length) {
          const sorted = sortByNameOrder(result, DISCIPLINE_NAMES);
          disciplines.set(sorted);
          const ids = sorted.map((d) => d.id);
          draftDisciplineIds.set(ids);
          appliedDisciplineIds.set(ids);
        }
      },
    });
    eventTypeService.getAll().subscribe({
      next: (result) => {
        if (result.length) {
          const sorted = sortByNameOrder(result, EVENT_TYPE_NAMES);
          eventTypes.set(sorted);
          const ids = sorted.map((e) => e.id);
          draftEventTypeIds.set(ids);
          appliedEventTypeIds.set(ids);
        }
      },
    });
  }

  /** Measures the fixed top overlay synchronously on first paint (a
   * ResizeObserver's first callback is async, which would otherwise leave
   * the initial render using the rough `110` default guess - short enough
   * for the first card to peek out from under the overlay) and keeps
   * measuring on every resize thereafter. Wraps the observer callback in
   * ngZone.run() - native ResizeObserver isn't zone-patched, so without it
   * the signal update could sit unrendered until some unrelated zone event
   * happened to trigger change detection. */
  function observeOverlay(el: HTMLElement | undefined, ngZone: NgZone): ResizeObserver | undefined {
    if (!el) {
      return undefined;
    }
    listTopPadding.set(Math.ceil(el.offsetHeight) + 16);
    if (typeof ResizeObserver === 'undefined') {
      return undefined;
    }
    const observer = new ResizeObserver(() => {
      ngZone.run(() => {
        listTopPadding.set(Math.ceil(el.offsetHeight) + 16);
      });
    });
    observer.observe(el);
    return observer;
  }

  function onSearchChange(value: string | null | undefined): void {
    const term = value ?? '';
    if (searchInputTimer) {
      clearTimeout(searchInputTimer);
    }
    searchInputTimer = setTimeout(() => searchTerm.set(term), 300);
  }

  function setViewMode(mode: EventListViewMode): void {
    viewMode.set(mode);
  }

  function openSortModal(): void {
    isSortModalOpen.set(true);
  }

  function selectSort(value: EventSortMode): void {
    sortMode.set(value);
    isSortModalOpen.set(false);
  }

  // --- "Reestablecer filtros" helpers: restore whatever's saved on the
  // profile (same fields Explorer's resetX() pulls from), falling back to
  // "everything selected"/neutral only when the user never set a preference. --

  function profileDisciplineIds(): string[] {
    const user = authService.currentUser();
    return user?.disciplineIds?.length ? [...user.disciplineIds] : disciplines().map((d) => d.id);
  }

  function profileEventTypeIds(): string[] {
    const user = authService.currentUser();
    return user?.eventTypeIds?.length ? [...user.eventTypeIds] : eventTypes().map((e) => e.id);
  }

  function profileStatuses(): EventStatus[] {
    const user = authService.currentUser();
    return (user?.statusIds?.length ? [...user.statusIds] : [...EVENT_STATUSES]) as EventStatus[];
  }

  function profileDateRange(): { from: number | undefined; to: number | undefined } {
    const user = authService.currentUser();
    if (user?.eventDateFrom !== undefined && user?.eventDateFrom !== null) {
      return { from: user.eventDateFrom, to: user.eventDateTo ?? undefined };
    }
    return defaultDateRange();
  }

  // --- Discipline modal ------------------------------------------------

  function openDisciplineModal(): void {
    draftDisciplineIds.set([...appliedDisciplineIds()]);
    isDisciplineModalOpen.set(true);
  }

  function toggleDraftDiscipline(id: string): void {
    draftDisciplineIds.update((ids) => toggleWithMinimum(ids, id, () => minSelectionWarning.flash('disciplines')));
  }

  const disciplineApplyFlash = createApplyFlash(() => isDisciplineModalOpen.set(false));

  function applyDisciplineFilter(): void {
    appliedDisciplineIds.set(draftDisciplineIds());
    disciplineApplyFlash.trigger();
  }

  function clearDisciplineFilter(): void {
    const ids = profileDisciplineIds();
    draftDisciplineIds.set(ids);
    appliedDisciplineIds.set(ids);
    isDisciplineModalOpen.set(false);
  }

  // --- Event type modal --------------------------------------------------

  function openEventTypeModal(): void {
    draftEventTypeIds.set([...appliedEventTypeIds()]);
    isEventTypeModalOpen.set(true);
  }

  function toggleDraftEventType(id: string): void {
    draftEventTypeIds.update((ids) => toggleWithMinimum(ids, id, () => minSelectionWarning.flash('eventTypes')));
  }

  const eventTypeApplyFlash = createApplyFlash(() => isEventTypeModalOpen.set(false));

  function applyEventTypeFilter(): void {
    appliedEventTypeIds.set(draftEventTypeIds());
    eventTypeApplyFlash.trigger();
  }

  function clearEventTypeFilter(): void {
    const ids = profileEventTypeIds();
    draftEventTypeIds.set(ids);
    appliedEventTypeIds.set(ids);
    isEventTypeModalOpen.set(false);
  }

  // --- Status modal --------------------------------------------------------

  function openStatusModal(): void {
    draftStatuses.set([...appliedStatuses()]);
    isStatusModalOpen.set(true);
  }

  function toggleDraftStatus(id: string): void {
    const status = id as EventStatus;
    draftStatuses.update((ids) => toggleWithMinimum(ids, status, () => minSelectionWarning.flash('statuses')));
  }

  const statusApplyFlash = createApplyFlash(() => isStatusModalOpen.set(false));

  function applyStatusFilter(): void {
    appliedStatuses.set(draftStatuses());
    statusApplyFlash.trigger();
  }

  function clearStatusFilter(): void {
    const statuses = profileStatuses();
    draftStatuses.set(statuses);
    appliedStatuses.set(statuses);
    isStatusModalOpen.set(false);
  }

  // --- Relation modal (organize / attend) -----------------------------------

  function openRelationModal(): void {
    draftRelation.set([...appliedRelation()]);
    isRelationModalOpen.set(true);
  }

  function toggleDraftRelation(id: string): void {
    const relation = id as RelationFilter;
    draftRelation.update((ids) => toggleWithMinimum(ids, relation, () => minSelectionWarning.flash('relation')));
  }

  const relationApplyFlash = createApplyFlash(() => isRelationModalOpen.set(false));

  function applyRelationFilter(): void {
    appliedRelation.set(draftRelation());
    relationApplyFlash.trigger();
  }

  function clearRelationFilter(): void {
    const all: RelationFilter[] = ['organizer', 'attendee'];
    draftRelation.set(all);
    appliedRelation.set(all);
    isRelationModalOpen.set(false);
  }

  // --- Price modal (free / paid) --------------------------------------------

  function openPriceModal(): void {
    draftPriceOptions.set([...appliedPriceOptions()]);
    isPriceModalOpen.set(true);
  }

  function toggleDraftPriceOption(id: string): void {
    const price = id as PriceOption;
    draftPriceOptions.update((ids) => toggleWithMinimum(ids, price, () => minSelectionWarning.flash('priceOptions')));
  }

  const priceApplyFlash = createApplyFlash(() => isPriceModalOpen.set(false));

  function applyPriceFilter(): void {
    appliedPriceOptions.set(draftPriceOptions());
    priceApplyFlash.trigger();
  }

  function clearPriceFilter(): void {
    const all: PriceOption[] = ['free', 'paid'];
    draftPriceOptions.set(all);
    appliedPriceOptions.set(all);
    isPriceModalOpen.set(false);
  }

  // --- Date modal ------------------------------------------------------

  function openDateModal(): void {
    draftDateFrom.set(appliedDateFrom());
    draftDateTo.set(appliedDateTo());
    isDateModalOpen.set(true);
  }

  function setDraftQuickDate(option: string): void {
    const { from, to } = dateUtils.quickDateRange(option as DateQuickOption);
    draftDateFrom.set(from);
    draftDateTo.set(to);
  }

  /** Keeps "hasta" always on/after "desde" - whichever field the user just
   * touched wins, the other snaps to match instead of silently allowing an
   * inverted range that matches zero events. */
  function onDraftDateFromChange(event: Event): void {
    const value = (event as CustomEvent<{ value: string | string[] | null }>).detail.value;
    const iso = Array.isArray(value) ? value[0] : value;
    if (!iso) {
      return;
    }
    const from = dateUtils.startOfDayFromIso(iso);
    draftDateFrom.set(from);
    const to = draftDateTo();
    if (to !== undefined && to < from) {
      draftDateTo.set(dateUtils.endOfDayFromIso(iso));
    }
  }

  function onDraftDateToChange(event: Event): void {
    const value = (event as CustomEvent<{ value: string | string[] | null }>).detail.value;
    const iso = Array.isArray(value) ? value[0] : value;
    if (!iso) {
      return;
    }
    const to = dateUtils.endOfDayFromIso(iso);
    draftDateTo.set(to);
    const from = draftDateFrom();
    if (from !== undefined && to < from) {
      draftDateFrom.set(dateUtils.startOfDayFromIso(iso));
    }
  }

  function clearDraftDateFrom(): void {
    draftDateFrom.set(undefined);
  }

  function clearDraftDateTo(): void {
    draftDateTo.set(undefined);
  }

  const dateApplyFlash = createApplyFlash(() => isDateModalOpen.set(false));

  function applyDateFilter(): void {
    appliedDateFrom.set(draftDateFrom());
    appliedDateTo.set(draftDateTo());
    dateApplyFlash.trigger();
  }

  function clearDateFilter(): void {
    const { from, to } = profileDateRange();
    draftDateFrom.set(from);
    draftDateTo.set(to);
    appliedDateFrom.set(from);
    appliedDateTo.set(to);
    isDateModalOpen.set(false);
  }

  // --- Location modal ----------------------------------------------------

  function openLocationModal(): void {
    citySuggestions.set([]);
    draftDistanceRange.set(appliedDistanceRange());
    draftLatitude.set(appliedLatitude());
    draftLongitude.set(appliedLongitude());
    draftCity.set(appliedCity());
    draftAddress.set(appliedAddress());
    isLocationModalOpen.set(true);
  }

  function zoomIn(): void {
    zoomLevel.update((zoom) => Math.min(MAX_ZOOM, zoom + 1));
  }

  function zoomOut(): void {
    zoomLevel.update((zoom) => Math.max(MIN_ZOOM, zoom - 1));
  }

  function toggleMapType(): void {
    mapType.update((type) => (type === 'roadmap' ? 'satellite' : 'roadmap'));
  }

  function onDistanceChange(value: number): void {
    draftDistanceRange.set(value);
  }

  function onCityInput(value: string | null | undefined): void {
    const query = (value ?? '').trim();
    draftAddress.set(value ?? '');
    draftCity.set('');
    if (cityInputTimer) {
      clearTimeout(cityInputTimer);
    }
    if (query.length < 2) {
      citySuggestions.set([]);
      return;
    }
    cityInputTimer = setTimeout(() => {
      geocodingService.search(query, 'address').subscribe({
        next: (suggestions) => citySuggestions.set(suggestions),
        error: () => citySuggestions.set([]),
      });
    }, 300);
  }

  function selectCitySuggestion(suggestion: CitySuggestion): void {
    geocodingService.place(suggestion.placeId).subscribe({
      next: (result) => {
        if (!result) {
          return;
        }
        draftLatitude.set(result.latitude);
        draftLongitude.set(result.longitude);
        draftCity.set(result.city);
        draftAddress.set(result.formattedAddress);
        citySuggestions.set([]);
      },
    });
  }

  /** Shared by "use my current location" (GPS) and tapping a pin on the map. */
  function reverseGeocodeTo(lat: number, lng: number): void {
    geocodingService.reverse(lat, lng).subscribe({
      next: (result) => {
        draftLatitude.set(lat);
        draftLongitude.set(lng);
        draftCity.set(result?.city ?? '');
        draftAddress.set(result?.formattedAddress ?? '');
        locatingMe.set(false);
      },
      error: () => {
        draftLatitude.set(lat);
        draftLongitude.set(lng);
        locatingMe.set(false);
      },
    });
  }

  function onPinMoved(coords: { lat: number; lng: number }): void {
    reverseGeocodeTo(coords.lat, coords.lng);
  }

  function useCurrentLocation(): void {
    if (!navigator.geolocation) {
      return;
    }
    locatingMe.set(true);
    navigator.geolocation.getCurrentPosition(
      (position) => reverseGeocodeTo(position.coords.latitude, position.coords.longitude),
      () => locatingMe.set(false),
    );
  }

  const locationApplyFlash = createApplyFlash(() => isLocationModalOpen.set(false));

  function applyLocationFilter(): void {
    appliedDistanceRange.set(draftDistanceRange());
    appliedLatitude.set(draftLatitude());
    appliedLongitude.set(draftLongitude());
    appliedCity.set(draftCity());
    appliedAddress.set(draftAddress());
    locationApplyFlash.trigger();
  }

  /** Labeled "Reestablecer filtros" (there's no profile save here to make
   * "Eliminar" vs "Reestablecer" mean different things) - goes back to the
   * same profile-seeded city/distance/coordinates the page loads with. */
  function clearLocationFilter(): void {
    const user = authService.currentUser();
    const city = user?.city || '';
    const address = user?.address || '';
    const distanceRange = user?.distanceRange || 50;
    const latitude = user?.latitude || null;
    const longitude = user?.longitude || null;
    draftCity.set(city);
    draftAddress.set(address);
    draftDistanceRange.set(distanceRange);
    draftLatitude.set(latitude);
    draftLongitude.set(longitude);
    appliedCity.set(city);
    appliedAddress.set(address);
    appliedDistanceRange.set(distanceRange);
    appliedLatitude.set(latitude);
    appliedLongitude.set(longitude);
    isLocationModalOpen.set(false);
  }

  // --- Generic filter modal (all categories together, mirrors the pills) --

  function openGenericFilterModal(): void {
    draftDisciplineIds.set([...appliedDisciplineIds()]);
    draftEventTypeIds.set([...appliedEventTypeIds()]);
    draftStatuses.set([...appliedStatuses()]);
    draftRelation.set([...appliedRelation()]);
    draftPriceOptions.set([...appliedPriceOptions()]);
    draftDateFrom.set(appliedDateFrom());
    draftDateTo.set(appliedDateTo());
    isGenericFilterModalOpen.set(true);
  }

  function onGenericFilterChipToggle(event: FilterAllChipEvent): void {
    switch (event.category) {
      case 'eventTypes':
        toggleDraftEventType(event.id);
        break;
      case 'disciplines':
        toggleDraftDiscipline(event.id);
        break;
      case 'statuses':
        toggleDraftStatus(event.id);
        break;
      case 'price':
        toggleDraftPriceOption(event.id);
        break;
      case 'quickDate':
        setDraftQuickDate(event.id);
        break;
      case 'relation':
        toggleDraftRelation(event.id);
        break;
    }
  }

  const genericApplyFlash = createApplyFlash(() => isGenericFilterModalOpen.set(false));

  function applyGenericFilter(): void {
    appliedDisciplineIds.set(draftDisciplineIds());
    appliedEventTypeIds.set(draftEventTypeIds());
    appliedStatuses.set(draftStatuses());
    appliedRelation.set(draftRelation());
    appliedPriceOptions.set(draftPriceOptions());
    appliedDateFrom.set(draftDateFrom());
    appliedDateTo.set(draftDateTo());
    genericApplyFlash.trigger();
  }

  function clearGenericFilter(): void {
    const disciplineIds = profileDisciplineIds();
    const eventTypeIds = profileEventTypeIds();
    const statuses = profileStatuses();
    const allRelations: RelationFilter[] = ['organizer', 'attendee'];
    const allPriceOptions: PriceOption[] = ['free', 'paid'];

    draftDisciplineIds.set(disciplineIds);
    appliedDisciplineIds.set(disciplineIds);
    draftEventTypeIds.set(eventTypeIds);
    appliedEventTypeIds.set(eventTypeIds);
    draftStatuses.set(statuses);
    appliedStatuses.set(statuses);
    draftRelation.set(allRelations);
    appliedRelation.set(allRelations);
    draftPriceOptions.set(allPriceOptions);
    appliedPriceOptions.set(allPriceOptions);
    const { from, to } = profileDateRange();
    draftDateFrom.set(from);
    draftDateTo.set(to);
    appliedDateFrom.set(from);
    appliedDateTo.set(to);

    isGenericFilterModalOpen.set(false);
  }

  return {
    minSelectionWarning,
    disciplineApplyFlash,
    eventTypeApplyFlash,
    statusApplyFlash,
    relationApplyFlash,
    priceApplyFlash,
    dateApplyFlash,
    locationApplyFlash,
    genericApplyFlash,
    loading,
    searchTerm,
    disciplines,
    eventTypes,
    statusOptions,
    relationOptions,
    priceOptions,
    sortOptions,
    sortMode,
    isSortModalOpen,
    currentSortLabelKey,
    draftDisciplineIds,
    appliedDisciplineIds,
    draftEventTypeIds,
    appliedEventTypeIds,
    draftStatuses,
    appliedStatuses,
    draftRelation,
    appliedRelation,
    draftPriceOptions,
    appliedPriceOptions,
    draftDateFrom,
    appliedDateFrom,
    draftDateTo,
    appliedDateTo,
    nowTimestamp,
    draftCity,
    appliedCity,
    appliedAddress,
    draftDistanceRange,
    appliedDistanceRange,
    draftLatitude,
    appliedLatitude,
    draftLongitude,
    appliedLongitude,
    citySuggestions,
    locatingMe,
    zoomLevel,
    mapType,
    draftAddress,
    resolvedAddressLine,
    isDisciplineModalOpen,
    isEventTypeModalOpen,
    isStatusModalOpen,
    isRelationModalOpen,
    isPriceModalOpen,
    isDateModalOpen,
    isLocationModalOpen,
    isGenericFilterModalOpen,
    draftDateFromIso,
    draftDateToIso,
    draftActiveQuickDate,
    disciplineChips,
    eventTypeChips,
    statusChips,
    relationChips,
    priceChips,
    quickDateChips,
    disciplinesById,
    eventTypesById,
    viewMode,
    calendarGranularity,
    galleryCoverUrls,
    listTopPadding,
    loadTaxonomies,
    observeOverlay,
    onSearchChange,
    setViewMode,
    refreshGalleryCovers,
    openSortModal,
    selectSort,
    openDisciplineModal,
    toggleDraftDiscipline,
    applyDisciplineFilter,
    clearDisciplineFilter,
    openEventTypeModal,
    toggleDraftEventType,
    applyEventTypeFilter,
    clearEventTypeFilter,
    openStatusModal,
    toggleDraftStatus,
    applyStatusFilter,
    clearStatusFilter,
    openRelationModal,
    toggleDraftRelation,
    applyRelationFilter,
    clearRelationFilter,
    openPriceModal,
    toggleDraftPriceOption,
    applyPriceFilter,
    clearPriceFilter,
    openDateModal,
    setDraftQuickDate,
    onDraftDateFromChange,
    onDraftDateToChange,
    clearDraftDateFrom,
    clearDraftDateTo,
    applyDateFilter,
    clearDateFilter,
    openLocationModal,
    zoomIn,
    zoomOut,
    toggleMapType,
    onDistanceChange,
    onCityInput,
    selectCitySuggestion,
    onPinMoved,
    useCurrentLocation,
    applyLocationFilter,
    clearLocationFilter,
    openGenericFilterModal,
    onGenericFilterChipToggle,
    applyGenericFilter,
    clearGenericFilter,
    profileDisciplineIds,
    profileEventTypeIds,
    profileStatuses,
    profileDateRange,
  };
}

export type EventListFilters = ReturnType<typeof createEventListFilters>;
