import {
  AfterViewInit,
  Component,
  ElementRef,
  NgZone,
  OnDestroy,
  OnInit,
  ViewChild,
  computed,
  effect,
  inject,
  signal,
  untracked,
} from '@angular/core';
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
  optionsOutline,
  calendarOutline,
  chevronDownOutline,
  bookmarkOutline,
  refreshOutline,
  checkmarkOutline,
  closeOutline,
} from 'ionicons/icons';
import { AuthService } from '../../../services/core/auth.service';
import { DisciplineService } from '../../../services/event/discipline.service';
import { EventTypeService } from '../../../services/event/event-type.service';
import { EventService } from '../../../services/event/event.service';
import { EventListRefreshService } from '../../../services/event/event-list-refresh.service';
import { FavoriteService } from '../../../services/favorites/favorite.service';
import { GalleryService } from '../../../services/gallery/gallery.service';
import { LanguageService } from '../../../services/core/language.service';
import {
  Discipline,
  DISCIPLINE_NAMES,
  EventType,
  EVENT_TYPE_NAMES,
  EventStatus,
  EVENT_STATUSES,
  GalleryCover,
  PriceOption,
  EventWithCreatorName,
} from '../../../models';
import { sortByNameOrder, STATUS_LABEL_KEYS } from '../../../shared/event/icon-catalog';
import { LocationFilterButtonComponent } from '../../../shared/filters/location-filter-button/location-filter-button.component';
import { ChipGridComponent } from '../../../shared/filters/chip-grid/chip-grid.component';
import { SortRowComponent } from '../../../shared/filters/sort-row/sort-row.component';
import { SortOptionsModalComponent } from '../../../shared/filters/sort-options-modal/sort-options-modal.component';
import { DatePickerFieldComponent } from '../../../shared/calendar/date-picker-field/date-picker-field.component';
import {
  disciplineChipItems,
  eventTypeChipItems,
  priceChipItems,
  quickDateChipItems,
  statusChipItems,
} from '../../../shared/filters/chip-grid/chip-grid-presets';
import { NotificationBellComponent } from '../../../shared/notifications/notification-bell/notification-bell.component';
import { FilterSheetHeaderComponent } from '../../../shared/filters/filter-sheet-header/filter-sheet-header.component';
import { FilterActionsRowComponent } from '../../../shared/filters/filter-actions-row/filter-actions-row.component';
import { EventCardComponent } from '../../../shared/event/event-card/event-card.component';
import { EventCardView } from '../../../shared/event/event-card/event-card.model';
import { buildEventCardView } from '../../../shared/event/event-card/build-event-card-view';
import { EventCalendarComponent } from '../../../shared/calendar/event-calendar/event-calendar.component';
import { CalendarGranularityToggleComponent } from '../../../shared/calendar/event-calendar/calendar-granularity-toggle.component';
import { CalendarGranularity } from '../../../shared/calendar/event-calendar/event-calendar.model';
import { recoverAttendState } from '../../../shared/event/attend-toggle';
import { EVENT_SORT_OPTIONS, EventSortMode, sortEvents } from '../../../shared/event/event-sort';
import { SortPreferenceService } from '../../../services/filters/sort-preference.service';
import { ExplorerFiltersService, DateQuickOption } from '../../../services/filters/explorer-filters.service';
import { createApplyFlash } from '../../../shared/common/success-flash';
import { PhotoGridComponent } from '../../../shared/gallery/photo-grid/photo-grid.component';
import { EventListViewMode, ViewModeMenuComponent } from '../../../shared/event/view-mode-menu/view-mode-menu.component';

const STATUS_OPTIONS = EVENT_STATUSES.map((id) => ({ id, labelKey: STATUS_LABEL_KEYS[id] }));
const PRICE_OPTIONS: { id: PriceOption; labelKey: string }[] = [
  { id: 'free', labelKey: 'explorer.priceFreeOption' },
  { id: 'paid', labelKey: 'explorer.pricePaidOption' },
];

/** The Events tab: the exact same events/filters as Explorer (same shared
 * ExplorerFiltersService, same search()) just rendered as a scrollable card
 * list instead of a map - two views onto one filtered result set. */
@Component({
  selector: 'app-events',
  standalone: true,
  templateUrl: 'events.page.html',
  styleUrls: ['events.page.scss'],
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
    LocationFilterButtonComponent,
    EventCardComponent,
    NotificationBellComponent,
    FilterSheetHeaderComponent,
    FilterActionsRowComponent,
    ChipGridComponent,
    SortRowComponent,
    SortOptionsModalComponent,
    DatePickerFieldComponent,
    EventCalendarComponent,
    CalendarGranularityToggleComponent,
    PhotoGridComponent,
    ViewModeMenuComponent,
  ],
})
export class EventsPage implements OnInit, AfterViewInit, OnDestroy, ViewWillEnter {
  private readonly disciplineService = inject(DisciplineService);
  private readonly eventTypeService = inject(EventTypeService);
  private readonly eventService = inject(EventService);
  private readonly refreshNotifier = inject(EventListRefreshService);
  private readonly favoriteService = inject(FavoriteService);
  private readonly galleryService = inject(GalleryService);
  private readonly authService = inject(AuthService);
  private readonly languageService = inject(LanguageService);
  private readonly router = inject(Router);
  private readonly ngZone = inject(NgZone);
  private readonly sortPreference = inject(SortPreferenceService);
  readonly filters = inject(ExplorerFiltersService);
  /** Fallback seed for <app-date-picker-field>'s [value] when draftDateFrom/
   * draftDateTo are both unset ("Sin límite" both ends). */
  readonly nowTimestamp = Date.now();

  @ViewChild('topOverlay') private topOverlayRef?: ElementRef<HTMLDivElement>;
  private overlayResizeObserver?: ResizeObserver;
  /** Real measured height of the fixed search/filter overlay, so the list's
   * top padding always clears it exactly - a hardcoded guess drifts the
   * moment a pill wraps to a second line or a translation runs longer. */
  readonly listTopPadding = signal(110);

  private searchInputTimer: ReturnType<typeof setTimeout> | null = null;

  readonly loading = signal(true);
  readonly events = signal<EventWithCreatorName[]>([]);
  readonly searchTerm = signal('');
  /** List vs calendar vs gallery ("browse by photo", Wikiloc-style) -
   * independent per screen (not shared with Favorites/user-events, unlike
   * sort mode), so it's just a local signal, not SortPreferenceService-style
   * shared state. */
  readonly viewMode = signal<EventListViewMode>('list');
  /** Owns the Mes/Semana/Día choice so the toggle (rendered in this page's
   * own fixed top-overlay) and <app-event-calendar>'s grid (rendered below,
   * scrollable) stay in sync. */
  readonly calendarGranularity = signal<CalendarGranularity>('month');
  /** Cover photo (+count) per event, keyed by event id - only fetched on
   * demand while viewMode is 'gallery' (see the effect below), so the
   * normal search response stays unbloated. */
  readonly galleryCoverUrls = signal<Record<string, GalleryCover>>({});
  /** IDs of events the logged-in user has liked - a plain search result has
   * no per-event relation of its own (see buildEventCardView), so the heart
   * on each card is driven by this separately-fetched set instead. */
  readonly likedEventIds = signal<Set<string>>(new Set());
  /** Guards like/unlike requests in flight per event id - a doubled tap
   * otherwise fires the handler twice before the first request's response
   * updates likedEventIds, sending a duplicate add/remove call the backend
   * rejects with an "already favorited"/"not found" error. */
  private readonly likeBusyIds = signal<Set<string>>(new Set());

  readonly disciplines = signal<Discipline[]>([]);
  readonly disciplinesById = computed(() => new Map(this.disciplines().map((d) => [d.id, d])));
  readonly eventTypes = signal<EventType[]>([]);
  readonly eventTypesById = computed(() => new Map(this.eventTypes().map((e) => [e.id, e])));
  readonly statusOptions = STATUS_OPTIONS;
  readonly priceOptions = PRICE_OPTIONS;
  readonly sortOptions = EVENT_SORT_OPTIONS;
  // Shared with Favorites so the chosen order survives switching tabs.
  readonly sortMode = this.sortPreference.eventSortMode;
  readonly isSortModalOpen = signal(false);
  readonly currentSortLabelKey = computed(
    () => this.sortOptions.find((option) => option.id === this.sortMode())?.labelKey ?? this.sortOptions[0].labelKey,
  );

  readonly eventTypeChips = computed(() => eventTypeChipItems(this.eventTypes(), this.filters.draftEventTypeIds()));
  readonly disciplineChips = computed(() => disciplineChipItems(this.disciplines(), this.filters.draftDisciplineIds()));
  readonly statusChips = computed(() => statusChipItems(this.statusOptions, this.filters.draftStatuses()));
  readonly priceChips = computed(() => priceChipItems(this.priceOptions, this.filters.draftPriceOptions()));
  readonly quickDateChips = computed(() => quickDateChipItems(this.filters.draftActiveQuickDate()));

  /** An empty discipline or event-type selection filters down to zero events
   * (see explorer-filters.service.ts), so an empty result needs a distinct,
   * actionable message pointing at the filters instead of the generic one. */
  readonly noCategorySelected = computed(
    () => this.filters.appliedDisciplineIds().length === 0 || this.filters.appliedEventTypeIds().length === 0,
  );

  readonly cardViews = computed<EventCardView[]>(() => {
    const disciplinesById = this.disciplinesById();
    const eventTypesById = this.eventTypesById();
    const lang = this.languageService.currentLang();
    const currentUserId = this.authService.currentUser()?.id;
    const likedEventIds = this.likedEventIds();
    return sortEvents(this.events(), this.sortMode()).map((event) =>
      buildEventCardView(event, disciplinesById, eventTypesById, lang, currentUserId, likedEventIds),
    );
  });

  /** "Browse by photo" mode (see viewMode's own doc comment) - each event's
   * gallery cover, falling back to its own imageUrl until it has a real
   * shared photo, so this mode is never emptier than the list. photoCount
   * (0 when falling back to imageUrl) drives the grid's own "several
   * photos"/"no photos shared yet" badge. */
  readonly galleryGridItems = computed(() => {
    const covers = this.galleryCoverUrls();
    return this.cardViews().map((view) => {
      const cover = covers[view.id];
      return { id: view.id, photoUrl: cover?.photoUrl ?? view.imageUrl, photoCount: cover?.count ?? 0 };
    });
  });

  readonly isEventTypeModalOpen = signal(false);
  readonly isDisciplineModalOpen = signal(false);
  readonly isStatusModalOpen = signal(false);
  readonly isPriceModalOpen = signal(false);
  readonly isDateModalOpen = signal(false);

  constructor() {
    addIcons({
      optionsOutline,
      calendarOutline,
      chevronDownOutline,
      bookmarkOutline,
      refreshOutline,
      checkmarkOutline,
      closeOutline,
    });

    // Re-run the search whenever any applied filter, the location, the radius
    // or the search term changes - all in one effect so every trigger stays in sync.
    // Also tracks refreshNotifier.version() so a just-created/reused event
    // shows up here without waiting for ionViewWillEnter, which doesn't
    // reliably re-fire on the forward navigation saveEdit() uses to return
    // here (see EventListRefreshService).
    effect(() => {
      this.filters.appliedDisciplineIds();
      this.filters.appliedEventTypeIds();
      this.filters.appliedStatuses();
      this.filters.appliedPriceOptions();
      this.filters.appliedDateFrom();
      this.filters.appliedDateTo();
      this.filters.appliedDistanceRange();
      this.filters.appliedLatitude();
      this.filters.appliedLongitude();
      this.refreshNotifier.version();
      const term = this.searchTerm();
      untracked(() => this.loadEvents(term));
    });

    // Only fetched while "browse by photo" is actually active - re-runs
    // whenever the underlying event list changes while that mode stays
    // selected.
    effect(() => {
      if (this.viewMode() !== 'gallery') {
        return;
      }
      const eventIds = this.cardViews().map((view) => view.id);
      untracked(() => this.refreshGalleryCovers(eventIds));
    });
  }

  private refreshGalleryCovers(eventIds: string[]): void {
    if (!eventIds.length) {
      this.galleryCoverUrls.set({});
      return;
    }
    this.galleryService.getCoverPhotos(eventIds).subscribe({
      next: (covers) => this.galleryCoverUrls.set(covers),
      error: () => this.galleryCoverUrls.set({}),
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

  /** Ionic keeps this tab's instance alive, so re-fetch every time it's
   * re-entered - otherwise editing an event on its detail page and coming
   * back here would still show the stale, pre-edit card. */
  ionViewWillEnter(): void {
    this.loadEvents(this.searchTerm());
    this.loadLikedEventIds();
  }

  private loadLikedEventIds(): void {
    const userId = this.authService.currentUser()?.id;
    if (!userId) {
      this.likedEventIds.set(new Set());
      return;
    }
    this.favoriteService.getFavoritedEvents(userId).subscribe({
      next: (events) => this.likedEventIds.set(new Set(events.map((event) => event.id))),
      error: () => this.likedEventIds.set(new Set()),
    });
  }

  /** <app-event-card>'s (likeToggle) - it already refuses to emit for the
   * organizer's own event or a finished/cancelled one, so this only ever
   * needs to flip between liked and not. A simple, immediate toggle per
   * instance - even for a recurring series, liking doesn't ask "this day or
   * the whole series?" the way attending does (see event-detail.page.ts). */
  onLikeToggle(eventId: string): void {
    const userId = this.authService.currentUser()?.id;
    if (!userId || this.likeBusyIds().has(eventId)) {
      return;
    }
    this.likeBusyIds.update((ids) => new Set(ids).add(eventId));
    const wasLiked = this.likedEventIds().has(eventId);
    const request$ = wasLiked
      ? this.favoriteService.removeFromFavorites(userId, eventId)
      : this.favoriteService.addToFavorites(userId, eventId);
    request$.subscribe({
      next: () => {
        this.likedEventIds.update((ids) => {
          const next = new Set(ids);
          if (wasLiked) {
            next.delete(eventId);
          } else {
            next.add(eventId);
          }
          return next;
        });
        this.likeBusyIds.update((ids) => {
          const next = new Set(ids);
          next.delete(eventId);
          return next;
        });
      },
      error: (err) => {
        const recovered = recoverAttendState(err, wasLiked);
        if (recovered !== null) {
          this.likedEventIds.update((ids) => {
            const next = new Set(ids);
            if (recovered) {
              next.add(eventId);
            } else {
              next.delete(eventId);
            }
            return next;
          });
        }
        this.likeBusyIds.update((ids) => {
          const next = new Set(ids);
          next.delete(eventId);
          return next;
        });
      },
    });
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

  private loadEvents(search: string): void {
    this.loading.set(true);
    this.eventService
      .search({
        disciplineIds: this.filters.appliedDisciplineIds(),
        typeIds: this.filters.appliedEventTypeIds(),
        statuses: this.filters.appliedStatuses(),
        priceOptions: this.filters.appliedPriceOptions(),
        dateFrom: this.filters.appliedDateFrom(),
        dateTo: this.filters.appliedDateTo(),
        latitude: this.filters.appliedLatitude() ?? undefined,
        longitude: this.filters.appliedLongitude() ?? undefined,
        radius: this.filters.appliedDistanceRange() * 1000,
        search: search.trim() || undefined,
      })
      .subscribe({
        next: (events) => {
          this.events.set(events);
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

  selectSort(value: string): void {
    this.sortMode.set(value as EventSortMode);
    this.isSortModalOpen.set(false);
  }

  goToFullFilters(): void {
    this.router.navigateByUrl('/explorer-filters');
  }

  setViewMode(mode: EventListViewMode): void {
    this.viewMode.set(mode);
  }

  goToCreateEvent(): void {
    this.router.navigate(['/events/new'], { queryParams: { origin: '/tabs/events' } });
  }

  /** Tapping a photo here jumps straight to that event's detail page - unlike
   * user-detail/event-detail's own galleries, there's no lightbox in this
   * mode, since the point is browsing *events*, not viewing photos. */
  openGalleryEvent(eventId: string): void {
    this.router.navigate(['/events', eventId], { queryParams: { origin: '/tabs/events' } });
  }

  // --- Individual quick filter modals (mirrors Explorer's, same shared filter state) --

  openEventTypeModal(): void {
    this.filters.draftEventTypeIds.set([...this.filters.appliedEventTypeIds()]);
    this.isEventTypeModalOpen.set(true);
  }

  openDisciplineModal(): void {
    this.filters.draftDisciplineIds.set([...this.filters.appliedDisciplineIds()]);
    this.isDisciplineModalOpen.set(true);
  }

  openStatusModal(): void {
    this.filters.draftStatuses.set([...this.filters.appliedStatuses()]);
    this.isStatusModalOpen.set(true);
  }

  openPriceModal(): void {
    this.filters.draftPriceOptions.set([...this.filters.appliedPriceOptions()]);
    this.isPriceModalOpen.set(true);
  }

  openDateModal(): void {
    this.filters.draftDateFrom.set(this.filters.appliedDateFrom());
    this.filters.draftDateTo.set(this.filters.appliedDateTo());
    this.isDateModalOpen.set(true);
  }

  toggleDraftEventType(id: string): void {
    this.filters.toggleDraftEventTypeId(id);
  }

  toggleDraftDiscipline(id: string): void {
    this.filters.toggleDraftDisciplineId(id);
  }

  toggleDraftStatus(id: string): void {
    this.filters.toggleDraftStatusId(id as EventStatus);
  }

  toggleDraftPriceOption(id: string): void {
    this.filters.toggleDraftPriceOption(id as PriceOption);
  }

  setDraftQuickDate(id: string): void {
    this.filters.setDraftQuickDate(id as DateQuickOption);
  }

  onDraftDateFromChange(event: Event): void {
    const value = (event as CustomEvent<{ value: string | string[] | null }>).detail.value;
    const iso = Array.isArray(value) ? value[0] : value;
    if (!iso) {
      return;
    }
    this.filters.setDraftDateFromIso(iso);
  }

  onDraftDateToChange(event: Event): void {
    const value = (event as CustomEvent<{ value: string | string[] | null }>).detail.value;
    const iso = Array.isArray(value) ? value[0] : value;
    if (!iso) {
      return;
    }
    this.filters.setDraftDateToIso(iso);
  }

  clearDraftDateTo(): void {
    this.filters.draftDateTo.set(undefined);
  }

  readonly eventTypeApplyFlash = createApplyFlash(() => this.isEventTypeModalOpen.set(false));

  applyEventTypeFilter(): void {
    this.filters.applyEventTypes();
    this.eventTypeApplyFlash.trigger();
  }

  resetEventTypeFilter(): void {
    this.filters.resetEventTypes();
    this.isEventTypeModalOpen.set(false);
  }

  saveEventTypeFilter(): void {
    this.filters.saveEventTypes();
    this.isEventTypeModalOpen.set(false);
  }

  readonly disciplineApplyFlash = createApplyFlash(() => this.isDisciplineModalOpen.set(false));

  applyDisciplineFilter(): void {
    this.filters.applyDisciplines();
    this.disciplineApplyFlash.trigger();
  }

  resetDisciplineFilter(): void {
    this.filters.resetDisciplines();
    this.isDisciplineModalOpen.set(false);
  }

  saveDisciplineFilter(): void {
    this.filters.saveDisciplines();
    this.isDisciplineModalOpen.set(false);
  }

  readonly statusApplyFlash = createApplyFlash(() => this.isStatusModalOpen.set(false));

  applyStatusFilter(): void {
    this.filters.applyStatuses();
    this.statusApplyFlash.trigger();
  }

  resetStatusFilter(): void {
    this.filters.resetStatuses();
    this.isStatusModalOpen.set(false);
  }

  saveStatusFilter(): void {
    this.filters.saveStatuses();
    this.isStatusModalOpen.set(false);
  }

  readonly priceApplyFlash = createApplyFlash(() => this.isPriceModalOpen.set(false));

  applyPriceFilter(): void {
    this.filters.applyPriceOptions();
    this.priceApplyFlash.trigger();
  }

  clearPriceFilter(): void {
    this.filters.clearPriceOptions();
    this.isPriceModalOpen.set(false);
  }

  readonly dateApplyFlash = createApplyFlash(() => this.isDateModalOpen.set(false));

  applyDateFilter(): void {
    this.filters.applyDate();
    this.dateApplyFlash.trigger();
  }


  resetDateFilter(): void {
    this.filters.resetDate();
    this.isDateModalOpen.set(false);
  }

  saveDateFilter(): void {
    this.filters.saveDate();
    this.isDateModalOpen.set(false);
  }
}
