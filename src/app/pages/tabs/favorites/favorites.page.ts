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
  optionsOutline,
  chevronDownOutline,
  refreshOutline,
  checkmarkOutline,
  closeOutline,
} from 'ionicons/icons';
import { AuthService } from '../../../services/core/auth.service';
import { FavoriteService } from '../../../services/favorites/favorite.service';
import { AttendanceService } from '../../../services/attendance/attendance.service';
import { EventListRefreshService } from '../../../services/event/event-list-refresh.service';
import { LanguageService } from '../../../services/core/language.service';
import { FavoritedEvent } from '../../../models';
import { haversineDistanceMeters } from '../../../shared/location/maps';
import { EventCardComponent } from '../../../shared/event/event-card/event-card.component';
import { NotificationBellComponent } from '../../../shared/notifications/notification-bell/notification-bell.component';
import { EventCardView } from '../../../shared/event/event-card/event-card.model';
import { buildEventCardView } from '../../../shared/event/event-card/build-event-card-view';
import { EventCalendarComponent } from '../../../shared/calendar/event-calendar/event-calendar.component';
import { CalendarGranularityToggleComponent } from '../../../shared/calendar/event-calendar/calendar-granularity-toggle.component';
import { recoverAttendState } from '../../../shared/event/attend-toggle';
import { sortEvents } from '../../../shared/event/event-sort';
import { createEventListFilters } from '../../../shared/filters/event-list-filters';
import { FilterSheetHeaderComponent } from '../../../shared/filters/filter-sheet-header/filter-sheet-header.component';
import { FilterActionsRowComponent } from '../../../shared/filters/filter-actions-row/filter-actions-row.component';
import { ChipGridComponent } from '../../../shared/filters/chip-grid/chip-grid.component';
import { FilterAllComponent } from '../../../shared/filters/filter-all/filter-all.component';
import { DatePickerFieldComponent } from '../../../shared/calendar/date-picker-field/date-picker-field.component';
import { LocationPickerComponent } from '../../../shared/location/location-picker/location-picker.component';
import { PhotoGridComponent } from '../../../shared/gallery/photo-grid/photo-grid.component';
import { ViewModeMenuComponent } from '../../../shared/event/view-mode-menu/view-mode-menu.component';

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
    PhotoGridComponent,
    ViewModeMenuComponent,
  ],
})
export class FavoritesPage implements OnInit, AfterViewInit, OnDestroy, ViewWillEnter {
  private readonly router = inject(Router);
  private readonly authService = inject(AuthService);
  private readonly favoriteService = inject(FavoriteService);
  private readonly attendanceService = inject(AttendanceService);
  private readonly refreshNotifier = inject(EventListRefreshService);
  private readonly languageService = inject(LanguageService);
  private readonly ngZone = inject(NgZone);

  /** Every discipline/event type/status/relation/price/date/location filter,
   * their 8 modals, sort and search - shared with UserEventsPage (see
   * shared/filters/event-list-filters.ts's own doc comment). "upcomingOnly" matches
   * this page's previous default: today onward, since showing every event
   * ever favorited (including long-past ones) isn't a useful default. */
  readonly filters = createEventListFilters('upcomingOnly');

  @ViewChild('topOverlay') private topOverlayRef?: ElementRef<HTMLDivElement>;
  private overlayResizeObserver?: ResizeObserver;

  readonly allEvents = signal<FavoritedEvent[]>([]);
  /** IDs of events the logged-in user really attends (not just likes) - the
   * "Asistente" filter pill checks against this instead of `relation`, which
   * only reflects the heart (see filteredEvents' own comment). */
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

    // A just-created/reused event shows up here without waiting for
    // ionViewWillEnter, which doesn't reliably re-fire on the forward
    // navigation saveEdit() uses to return here (see EventListRefreshService).
    effect(() => {
      this.refreshNotifier.version();
      untracked(() => this.loadFavorites());
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

  /** Same filter dimensions as Explorer (discipline/event type/status/date/
   * location/search), plus "organize vs attend", applied client-side since a
   * user's own events are already a small, fully-loaded list - entirely
   * local to this screen, no shared state and nothing gets persisted. Kept
   * as its own computed (rather than inlined into cardViews) so the
   * calendar view can bucket these same raw, already-filtered events by day
   * instead of duplicating this whole filter chain. */
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
      .filter((event) => event.disciplineIds.some((id) => disciplineIds.includes(id)))
      .filter((event) => event.typeIds.some((id) => typeIds.includes(id)))
      .filter((event) => statuses.includes(event.status))
      .filter((event) => {
        const isOrganizer = event.relation === 'creator';
        const isAttendee = this.attendingEventIds().has(event.id);
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
    const disciplinesById = this.filters.disciplinesById();
    const eventTypesById = this.filters.eventTypesById();
    const lang = this.languageService.currentLang();
    const currentUserId = this.authService.currentUser()?.id;
    return sortEvents(this.filteredEvents(), this.filters.sortMode()).map((event) =>
      buildEventCardView(event, disciplinesById, eventTypesById, lang, currentUserId),
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
    this.loadFavorites();
  }

  /** Tapping a photo here jumps straight to that event's detail page - unlike
   * user-detail/event-detail's own galleries, there's no lightbox in this
   * mode, since the point is browsing *events*, not viewing photos. */
  openGalleryEvent(eventId: string): void {
    this.router.navigate(['/events', eventId], { queryParams: { origin: '/tabs/favorites' } });
  }

  /** Ionic keeps this tab's instance alive, so re-fetch every time it's
   * re-entered - otherwise editing an event on its detail page and coming
   * back here would still show the stale, pre-edit card. */
  ionViewWillEnter(): void {
    this.loadFavorites();
  }

  ngAfterViewInit(): void {
    this.overlayResizeObserver = this.filters.observeOverlay(this.topOverlayRef?.nativeElement, this.ngZone);
  }

  ngOnDestroy(): void {
    this.overlayResizeObserver?.disconnect();
  }

  /** Guards like/unlike requests in flight per event id - a doubled tap
   * otherwise fires the handler twice before the first request's response
   * updates the list, sending a duplicate remove call the backend rejects
   * with a "not found" error. */
  private readonly likeBusyIds = signal<Set<string>>(new Set());

  /** <app-event-card>'s (likeToggle) - it already refuses to emit for the
   * organizer's own event or a finished/cancelled one, so every card here
   * that can fire this is currently liked (that's the only way a
   * non-organizer event lands in this list); unliking removes it from the
   * list entirely, since it's no longer one of "my" events. A simple,
   * immediate toggle per instance - even a recurring series' card only
   * unlikes that one instance, unlike attending (see event-detail.page.ts). */
  onLikeToggle(eventId: string): void {
    const userId = this.authService.currentUser()?.id;
    if (!userId || this.likeBusyIds().has(eventId)) {
      return;
    }
    this.likeBusyIds.update((ids) => new Set(ids).add(eventId));
    this.favoriteService.removeFromFavorites(userId, eventId).subscribe({
      next: () => this.allEvents.update((events) => events.filter((event) => event.id !== eventId)),
      error: (err) => {
        if (recoverAttendState(err, true) === false) {
          this.allEvents.update((events) => events.filter((event) => event.id !== eventId));
        }
        this.likeBusyIds.update((ids) => {
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
      this.filters.loading.set(false);
      return;
    }
    this.filters.loading.set(true);
    this.favoriteService.getFavoritedEvents(user.id).subscribe({
      next: (events) => {
        this.allEvents.set(events);
        this.filters.loading.set(false);
      },
      error: () => this.filters.loading.set(false),
    });
    this.attendanceService.getAttendedEvents(user.id).subscribe({
      next: (events) => this.attendingEventIds.set(new Set(events.map((event) => event.id))),
      error: () => this.attendingEventIds.set(new Set()),
    });
  }

  goToCreateEvent(): void {
    this.router.navigate(['/events/new'], { queryParams: { origin: '/tabs/favorites' } });
  }
}
