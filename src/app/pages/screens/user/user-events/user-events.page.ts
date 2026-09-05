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
import { ActivatedRoute, Router } from '@angular/router';
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
  optionsOutline,
  chevronDownOutline,
  refreshOutline,
  checkmarkOutline,
  closeOutline,
} from 'ionicons/icons';
import { AuthService } from '../../../../services/core/auth.service';
import { FavoriteService } from '../../../../services/favorites/favorite.service';
import { AttendanceService } from '../../../../services/attendance/attendance.service';
import { EventListRefreshService } from '../../../../services/event/event-list-refresh.service';
import { LanguageService } from '../../../../services/core/language.service';
import { FavoritedEvent } from '../../../../models';
import { haversineDistanceMeters } from '../../../../shared/location/maps';
import { LocationPickerComponent } from '../../../../shared/location/location-picker/location-picker.component';
import { EventCardComponent } from '../../../../shared/event/event-card/event-card.component';
import { EventCardView } from '../../../../shared/event/event-card/event-card.model';
import { buildEventCardView } from '../../../../shared/event/event-card/build-event-card-view';
import { EventCalendarComponent } from '../../../../shared/calendar/event-calendar/event-calendar.component';
import { CalendarGranularityToggleComponent } from '../../../../shared/calendar/event-calendar/calendar-granularity-toggle.component';
import { recoverAttendState } from '../../../../shared/event/attend-toggle';
import { createEventListFilters } from '../../../../shared/filters/event-list-filters';
import { sortEvents } from '../../../../shared/event/event-sort';
import { FilterSheetHeaderComponent } from '../../../../shared/filters/filter-sheet-header/filter-sheet-header.component';
import { FilterActionsRowComponent } from '../../../../shared/filters/filter-actions-row/filter-actions-row.component';
import { ChipGridComponent } from '../../../../shared/filters/chip-grid/chip-grid.component';
import { FilterAllComponent } from '../../../../shared/filters/filter-all/filter-all.component';
import { DatePickerFieldComponent } from '../../../../shared/calendar/date-picker-field/date-picker-field.component';
import { PhotoGridComponent } from '../../../../shared/gallery/photo-grid/photo-grid.component';
import { ViewModeMenuComponent } from '../../../../shared/event/view-mode-menu/view-mode-menu.component';

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
    IonSpinner,
    TranslatePipe,
    EventCardComponent,
    FilterSheetHeaderComponent,
    FilterActionsRowComponent,
    ChipGridComponent,
    FilterAllComponent,
    DatePickerFieldComponent,
    LocationPickerComponent,
    EventCalendarComponent,
    CalendarGranularityToggleComponent,
    PhotoGridComponent,
    ViewModeMenuComponent,
  ],
})
export class UserEventsPage implements OnInit, AfterViewInit, OnDestroy, ViewWillEnter {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly authService = inject(AuthService);
  private readonly favoriteService = inject(FavoriteService);
  private readonly attendanceService = inject(AttendanceService);
  private readonly refreshNotifier = inject(EventListRefreshService);
  private readonly languageService = inject(LanguageService);
  private readonly ngZone = inject(NgZone);

  /** Every discipline/event type/status/relation/price/date/location filter,
   * their 8 modals, sort and search - shared with FavoritesPage (see
   * shared/filters/event-list-filters.ts's own doc comment). "unbounded" matches
   * this page's previous default: no date filter, since past and finished/
   * cancelled events should still show up here unlike in Favorites. */
  readonly filters = createEventListFilters('unbounded');

  @ViewChild('topOverlay') private topOverlayRef?: ElementRef<HTMLDivElement>;
  private overlayResizeObserver?: ResizeObserver;

  readonly allEvents = signal<FavoritedEvent[]>([]);
  /** IDs of events the *logged-in* user has liked - unlike `relation` on each
   * event (which describes how the *viewed* profile relates to it), this is
   * always about "me", so it stays correct whether this is my own events
   * list or someone else's. Drives the heart on each card. */
  readonly likedEventIds = signal<Set<string>>(new Set());
  /** IDs of events the *viewed* profile really attends (not just likes) -
   * the "Asistente" filter pill checks against this instead of `relation`,
   * which only reflects that profile's heart (see filteredEvents' own
   * comment). Scoped to whichever profile is being viewed, unlike likedEventIds. */
  readonly attendingEventIds = signal<Set<string>>(new Set());

  constructor() {
    addIcons({
      locationOutline,
      close,
      locateOutline,
      calendarOutline,
      optionsOutline,
      chevronDownOutline,
      refreshOutline,
      checkmarkOutline,
      closeOutline,
    });

    // queryParamMap emits immediately on subscribe (covers the initial load)
    // and again whenever ?userId changes without recreating this component -
    // e.g. browsing from one user's events into another's.
    this.route.queryParamMap.subscribe(() => this.loadEvents());

    // A just-created/reused event shows up here without waiting for
    // ionViewWillEnter, which doesn't reliably re-fire on the forward
    // navigation saveEdit() uses to return here (see EventListRefreshService).
    effect(() => {
      this.refreshNotifier.version();
      untracked(() => this.loadEvents());
    });

    // Only fetched while "browse by photo" is actually active (see
    // event-list-filters.ts's own refreshGalleryCovers) - re-runs whenever
    // the filtered event list changes while that mode stays selected.
    effect(() => {
      if (this.filters.viewMode() !== 'gallery') {
        return;
      }
      const eventIds = this.cardViews().map((view) => view.id);
      untracked(() => this.filters.refreshGalleryCovers(eventIds));
    });
  }

  /** Same filter dimensions as Favorites (discipline/event type/status/date/
   * location/search/organize-attend), applied client-side since one user's
   * events are already a small, fully-loaded list. Kept as its own computed
   * (rather than inlined into cardViews) so the calendar view can bucket
   * these same raw, already-filtered events by day instead of duplicating
   * this whole filter chain. */
  readonly filteredEvents = computed<FavoritedEvent[]>(() => {
    const term = this.filters.searchTerm().trim().toLowerCase();
    const disciplineIds = this.filters.appliedDisciplineIds();
    const typeIds = this.filters.appliedEventTypeIds();
    const statuses = this.filters.appliedStatuses();
    const relations = this.filters.appliedRelation();
    const priceOptions = this.filters.appliedPriceOptions();
    const dateFrom = this.filters.appliedDateFrom();
    const dateTo = this.filters.appliedDateTo();
    const lat = this.filters.appliedLatitude();
    const lng = this.filters.appliedLongitude();
    const radiusMeters = this.filters.appliedDistanceRange() * 1000;
    const wantsOrganizer = relations.includes('organizer');
    const wantsAttendee = relations.includes('attendee');

    return this.allEvents()
      // A draft that hasn't set a discipline/type/date/location yet always
      // passes those filter dimensions - there's nothing to filter on, and
      // it shouldn't disappear from this list just for being incomplete.
      .filter((event) => !event.disciplineIds?.length || event.disciplineIds.some((id) => disciplineIds.includes(id)))
      .filter((event) => !event.typeIds?.length || event.typeIds.some((id) => typeIds.includes(id)))
      .filter((event) => statuses.includes(event.status))
      .filter((event) => {
        const isOrganizer = event.relation === 'creator';
        const isAttendee = this.attendingEventIds().has(event.id);
        return (wantsOrganizer && isOrganizer) || (wantsAttendee && isAttendee);
      })
      .filter((event) => priceOptions.includes(event.isFree ? 'free' : 'paid'))
      .filter((event) => dateFrom === undefined || event.eventDateFrom === undefined || event.eventDateFrom >= dateFrom)
      .filter((event) => dateTo === undefined || event.eventDateFrom === undefined || event.eventDateFrom <= dateTo)
      .filter((event) => !term || event.title.toLowerCase().includes(term))
      .filter((event) => {
        if (lat === null || lng === null || event.latitude === undefined || event.longitude === undefined) {
          return true;
        }
        return haversineDistanceMeters(lat, lng, event.latitude, event.longitude) <= radiusMeters;
      });
  });

  readonly cardViews = computed<EventCardView[]>(() => {
    const disciplinesById = this.filters.disciplinesById();
    const eventTypesById = this.filters.eventTypesById();
    const lang = this.languageService.currentLang();
    const currentUserId = this.authService.currentUser()?.id;
    return sortEvents(this.filteredEvents(), this.filters.sortMode()).map((event) =>
      buildEventCardView(event, disciplinesById, eventTypesById, lang, currentUserId, this.likedEventIds()),
    );
  });

  /** "Browse by photo" mode (see event-list-filters.ts's own doc comment) -
   * each event's gallery cover, falling back to its own imageUrl until it
   * has a real shared photo, so this mode is never emptier than the list.
   * photoCount (0 when falling back to imageUrl) drives the grid's own
   * "several photos"/"no photos shared yet" badge. */
  readonly galleryGridItems = computed(() => {
    const covers = this.filters.galleryCoverUrls();
    return this.cardViews().map((view) => {
      const cover = covers[view.id];
      return { id: view.id, photoUrl: cover?.photoUrl ?? view.imageUrl, photoCount: cover?.count ?? 0 };
    });
  });

  ngOnInit(): void {
    this.filters.loadTaxonomies();
  }

  /** Tapping a photo here jumps straight to that event's detail page - unlike
   * user-detail/event-detail's own galleries, there's no lightbox in this
   * mode, since the point is browsing *events*, not viewing photos. */
  openGalleryEvent(eventId: string): void {
    this.router.navigate(['/events', eventId], { queryParams: { origin: '/user-events' } });
  }

  ngAfterViewInit(): void {
    this.overlayResizeObserver = this.filters.observeOverlay(this.topOverlayRef?.nativeElement, this.ngZone);
  }

  ngOnDestroy(): void {
    this.overlayResizeObserver?.disconnect();
  }

  /** Re-fetch every time this page is re-entered - Ionic keeps the instance
   * alive, so coming back here should still show fresh data. */
  ionViewWillEnter(): void {
    this.loadEvents();
    this.loadLikedEventIds();
  }

  private loadEvents(): void {
    const userId = this.route.snapshot.queryParamMap.get('userId') ?? this.authService.currentUser()?.id;
    if (!userId) {
      this.filters.loading.set(false);
      return;
    }
    this.filters.loading.set(true);
    this.favoriteService.getFavoritedEvents(userId).subscribe({
      next: (events) => {
        this.allEvents.set(events);
        this.filters.loading.set(false);
      },
      error: () => this.filters.loading.set(false),
    });
    this.attendanceService.getAttendedEvents(userId).subscribe({
      next: (events) => this.attendingEventIds.set(new Set(events.map((event) => event.id))),
      error: () => this.attendingEventIds.set(new Set()),
    });
  }

  private loadLikedEventIds(): void {
    const myId = this.authService.currentUser()?.id;
    if (!myId) {
      this.likedEventIds.set(new Set());
      return;
    }
    this.favoriteService.getFavoritedEvents(myId).subscribe({
      next: (events) => this.likedEventIds.set(new Set(events.map((event) => event.id))),
      error: () => this.likedEventIds.set(new Set()),
    });
  }

  /** Guards like/unlike requests in flight per event id - a doubled tap
   * otherwise fires the handler twice before the first request's response
   * updates likedEventIds, sending a duplicate add/remove call the backend
   * rejects with an "already favorited"/"not found" error. */
  private readonly likeBusyIds = signal<Set<string>>(new Set());

  /** <app-event-card>'s (likeToggle) - unliking only removes the card from
   * *this* list when it's my own (no ?userId, or ?userId is me): someone
   * else's events list is organized/favorited by *them*, so my own liking
   * shouldn't make their card disappear from their list. A simple, immediate
   * toggle per instance - even a recurring series' card only unlikes that
   * one instance, unlike attending (see event-detail.page.ts). */
  onLikeToggle(eventId: string): void {
    const myId = this.authService.currentUser()?.id;
    if (!myId || this.likeBusyIds().has(eventId)) {
      return;
    }
    this.likeBusyIds.update((ids) => new Set(ids).add(eventId));
    const wasLiked = this.likedEventIds().has(eventId);
    const request$ = wasLiked
      ? this.favoriteService.removeFromFavorites(myId, eventId)
      : this.favoriteService.addToFavorites(myId, eventId);
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
        const viewedUserId = this.route.snapshot.queryParamMap.get('userId') ?? myId;
        if (wasLiked && viewedUserId === myId) {
          this.allEvents.update((events) => events.filter((event) => event.id !== eventId));
        }
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
          const viewedUserId = this.route.snapshot.queryParamMap.get('userId') ?? myId;
          if (!recovered && viewedUserId === myId) {
            this.allEvents.update((events) => events.filter((event) => event.id !== eventId));
          }
        }
        this.likeBusyIds.update((ids) => {
          const next = new Set(ids);
          next.delete(eventId);
          return next;
        });
      },
    });
  }
}
