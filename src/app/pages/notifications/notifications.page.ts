import { AfterViewInit, Component, ElementRef, NgZone, OnDestroy, ViewChild, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { forkJoin } from 'rxjs';
import {
  IonHeader,
  IonToolbar,
  IonTitle,
  IonButtons,
  IonBackButton,
  IonButton,
  IonContent,
  IonSearchbar,
  IonSpinner,
  IonIcon,
  IonModal,
  ViewWillEnter,
} from '@ionic/angular/standalone';
import { TranslatePipe } from '@ngx-translate/core';
import { addIcons } from 'ionicons';
import {
  personAddOutline,
  checkmarkCircleOutline,
  createOutline,
  todayOutline,
  calendarOutline,
  sparklesOutline,
  notificationsOutline,
  optionsOutline,
  close,
  mailUnreadOutline,
  mailOutline,
  chevronDownOutline,
} from 'ionicons/icons';
import { AuthService } from '../../services/auth.service';
import { NotificationService } from '../../services/notification.service';
import { UserService } from '../../services/user.service';
import { EventService } from '../../services/event.service';
import { DisciplineService } from '../../services/discipline.service';
import { EventTypeService } from '../../services/event-type.service';
import { LanguageService } from '../../services/language.service';
import { NotificationSortMode, SortPreferenceService } from '../../services/sort-preference.service';
import { MinSelectionWarningService } from '../../shared/min-selection-warning.service';
import { toggleWithMinimum } from '../../shared/min-selection';
import { AppNotification, Discipline, EventType, FollowUser, NotificationType } from '../../models';
import { buildEventCardView } from '../../shared/event-card/build-event-card-view';
import { EventCardView } from '../../shared/event-card/event-card.model';
import { EventCardComponent } from '../../shared/event-card/event-card.component';
import { UserCardComponent } from '../../shared/user-card/user-card.component';
import {
  ALL_NOTIFICATION_TYPES,
  NOTIFICATION_TYPE_ICONS,
  NOTIFICATION_TYPE_LABEL_KEYS,
} from '../../shared/notification-types';

const ALL_TYPES = ALL_NOTIFICATION_TYPES;
const TYPE_ICONS = NOTIFICATION_TYPE_ICONS;
const TYPE_LABEL_KEYS = NOTIFICATION_TYPE_LABEL_KEYS;

type ReadFilter = 'all' | 'unread' | 'read';

const READ_FILTER_OPTIONS: { id: ReadFilter; labelKey: string }[] = [
  { id: 'all', labelKey: 'notifications.filterAll' },
  { id: 'unread', labelKey: 'notifications.filterUnread' },
  { id: 'read', labelKey: 'notifications.filterRead' },
];

type SortMode = NotificationSortMode;

// Same order as every other sort sheet in the app (Followers/Following,
// Events/Favorites): alphabetical first, then date - even though the
// default selection (dateNewest) isn't the first item in the list.
const SORT_OPTIONS: { id: SortMode; labelKey: string }[] = [
  { id: 'titleAsc', labelKey: 'notifications.sortTitleAsc' },
  { id: 'titleDesc', labelKey: 'notifications.sortTitleDesc' },
  { id: 'dateNewest', labelKey: 'notifications.sortDateNewest' },
  { id: 'dateOldest', labelKey: 'notifications.sortDateOldest' },
];

@Component({
  selector: 'app-notifications',
  standalone: true,
  templateUrl: 'notifications.page.html',
  styleUrls: ['notifications.page.scss'],
  imports: [
    IonHeader,
    IonToolbar,
    IonTitle,
    IonButtons,
    IonBackButton,
    IonButton,
    IonContent,
    IonSearchbar,
    IonSpinner,
    IonIcon,
    IonModal,
    RouterLink,
    TranslatePipe,
    EventCardComponent,
    UserCardComponent,
  ],
})
export class NotificationsPage implements ViewWillEnter, AfterViewInit, OnDestroy {
  private readonly authService = inject(AuthService);
  private readonly notificationService = inject(NotificationService);
  private readonly userService = inject(UserService);
  private readonly eventService = inject(EventService);
  private readonly disciplineService = inject(DisciplineService);
  private readonly eventTypeService = inject(EventTypeService);
  private readonly languageService = inject(LanguageService);
  private readonly sortPreference = inject(SortPreferenceService);
  private readonly ngZone = inject(NgZone);
  readonly minSelectionWarning = inject(MinSelectionWarningService);

  @ViewChild('topOverlay') private topOverlayRef?: ElementRef<HTMLDivElement>;
  private overlayResizeObserver?: ResizeObserver;
  /** Real measured height of the fixed search/filter overlay, so the list's
   * top padding always clears it exactly - a hardcoded guess drifts the
   * moment the sort row wraps or a translation runs longer. */
  readonly listTopPadding = signal(110);

  readonly loading = signal(true);
  readonly items = signal<AppNotification[]>([]);
  readonly searchTerm = signal('');
  readonly eventCardById = signal<Map<string, EventCardView>>(new Map());
  readonly followUserById = signal<Map<string, FollowUser>>(new Map());
  private disciplinesById = new Map<string, Discipline>();
  private eventTypesById = new Map<string, EventType>();

  readonly allTypes = ALL_TYPES;
  readonly typeIcons = TYPE_ICONS;
  readonly typeLabelKeys = TYPE_LABEL_KEYS;
  readonly readFilterOptions = READ_FILTER_OPTIONS;

  /** Types the user has turned off in Perfil > Notificaciones - shown in the
   * filter sheet with a distinct "desactivada" badge, not to be confused
   * with a type simply being unchecked in the current filter view. */
  readonly disabledTypes = computed(() => new Set(this.authService.currentUser()?.disabledNotificationTypes ?? []));

  readonly selectedTypes = signal<NotificationType[]>([...ALL_TYPES]);
  readonly readFilter = signal<ReadFilter>('all');
  readonly draftTypes = signal<NotificationType[]>([...ALL_TYPES]);
  readonly draftReadFilter = signal<ReadFilter>('all');
  readonly isFilterModalOpen = signal(false);

  readonly sortOptions = SORT_OPTIONS;
  // Shared across every tab's bell icon - Angular creates a fresh page
  // instance each time you navigate to /notifications, so this can't live
  // as a plain local signal without losing the choice on re-entry.
  readonly sortMode = this.sortPreference.notificationSortMode;
  readonly isSortModalOpen = signal(false);
  readonly currentSortLabelKey = computed(
    () => this.sortOptions.find((option) => option.id === this.sortMode())?.labelKey ?? this.sortOptions[0].labelKey,
  );

  readonly filteredItems = computed(() => {
    const types = this.selectedTypes();
    const readState = this.readFilter();
    const sortMode = this.sortMode();
    const term = this.searchTerm().trim().toLowerCase();
    const filtered = this.items().filter((item) => {
      if (!types.includes(item.type)) {
        return false;
      }
      if (readState === 'unread' && item.read) {
        return false;
      }
      if (readState === 'read' && !item.read) {
        return false;
      }
      if (term) {
        // Matches the linked event's title or the linked user's name - not
        // the notification's own title/body text, which is just the fixed
        // per-type wording ("Nuevo seguidor", etc.) and wouldn't be useful
        // to search by.
        const eventTitle = this.eventCardFor(item)?.title?.toLowerCase() ?? '';
        const userName = this.followUserFor(item)?.name?.toLowerCase() ?? '';
        if (!eventTitle.includes(term) && !userName.includes(term)) {
          return false;
        }
      }
      return true;
    });
    return [...filtered].sort((a, b) => {
      switch (sortMode) {
        case 'titleAsc':
          return a.title.localeCompare(b.title);
        case 'titleDesc':
          return b.title.localeCompare(a.title);
        case 'dateOldest':
          return a.createdAt - b.createdAt;
        case 'dateNewest':
        default:
          return b.createdAt - a.createdAt;
      }
    });
  });

  constructor() {
    addIcons({
      personAddOutline,
      checkmarkCircleOutline,
      createOutline,
      todayOutline,
      calendarOutline,
      sparklesOutline,
      notificationsOutline,
      optionsOutline,
      close,
      mailUnreadOutline,
      mailOutline,
      chevronDownOutline,
    });
    this.disciplineService.getAll().subscribe({
      next: (disciplines) => (this.disciplinesById = new Map(disciplines.map((d) => [d.id, d]))),
    });
    this.eventTypeService.getAll().subscribe({
      next: (eventTypes) => (this.eventTypesById = new Map(eventTypes.map((t) => [t.id, t]))),
    });
  }

  /** Ionic keeps this page's instance alive, so re-fetch every time it's
   * re-entered - otherwise a notification that arrived while elsewhere in
   * the app wouldn't show up until a full reload. */
  ionViewWillEnter(): void {
    this.load();
  }

  ngAfterViewInit(): void {
    const el = this.topOverlayRef?.nativeElement;
    if (!el) {
      return;
    }
    // Measure synchronously right away too - ResizeObserver's first callback
    // is async, so relying on it alone left the initial paint using the
    // rough `110` default guess, which was short enough for the first row
    // to peek out from under the overlay until that first callback landed.
    this.listTopPadding.set(Math.ceil(el.offsetHeight) + 16);
    if (typeof ResizeObserver === 'undefined') {
      return;
    }
    this.overlayResizeObserver = new ResizeObserver(() => {
      // Runs outside Angular's zone (native ResizeObserver isn't zone-patched
      // here), so without an explicit ngZone.run the signal update could sit
      // unrendered until some unrelated zone event happened to trigger CD -
      // leaving the first row visibly peeking out from under the overlay
      // until then.
      this.ngZone.run(() => {
        this.listTopPadding.set(Math.ceil(el.offsetHeight) + 16);
      });
    });
    this.overlayResizeObserver.observe(el);
  }

  ngOnDestroy(): void {
    this.overlayResizeObserver?.disconnect();
  }

  onSearchChange(value: string | null | undefined): void {
    this.searchTerm.set(value ?? '');
  }

  private load(): void {
    const userId = this.authService.currentUser()?.id;
    if (!userId) {
      this.loading.set(false);
      return;
    }
    this.loading.set(true);
    this.notificationService.list(userId).subscribe({
      next: (items) => {
        this.items.set(items);
        this.hydrate(items);
        this.loading.set(false);
      },
      error: () => this.loading.set(false),
    });
  }

  /** Fetches the actual event/user each notification points at, so it can
   * render as a real <app-event-card>/<app-user-card> instead of plain text -
   * one request per unique id referenced, not per notification. */
  private hydrate(items: AppNotification[]): void {
    const eventIds = [...new Set(items.map((item) => item.data?.['eventId']).filter((id): id is string => !!id))];
    const followerIds = [
      ...new Set(
        items
          .filter((item) => item.type === 'new_follower')
          .map((item) => item.data?.['fromUserId'])
          .filter((id): id is string => !!id),
      ),
    ];

    if (eventIds.length) {
      forkJoin(eventIds.map((id) => this.eventService.getById(id))).subscribe({
        next: (events) => {
          const lang = this.languageService.currentLang();
          const currentUserId = this.authService.currentUser()?.id;
          const map = new Map<string, EventCardView>();
          events.forEach((event, index) => {
            if (event) {
              map.set(
                eventIds[index],
                buildEventCardView(event, this.disciplinesById, this.eventTypesById, lang, currentUserId),
              );
            }
          });
          this.eventCardById.set(map);
        },
      });
    }

    if (followerIds.length) {
      forkJoin(followerIds.map((id) => this.userService.getById(id))).subscribe({
        next: (users) => {
          const map = new Map<string, FollowUser>();
          users.forEach((user, index) => {
            if (user) {
              map.set(followerIds[index], {
                id: user.id,
                name: user.name,
                photoUrl: user.photoUrl,
                disciplineIds: user.disciplineIds,
                followedAt: 0,
              });
            }
          });
          this.followUserById.set(map);
        },
      });
    }
  }

  disciplinesMap(): Map<string, Discipline> {
    return this.disciplinesById;
  }

  eventCardFor(item: AppNotification): EventCardView | undefined {
    const eventId = item.data?.['eventId'];
    return eventId ? this.eventCardById().get(eventId) : undefined;
  }

  followUserFor(item: AppNotification): FollowUser | undefined {
    const fromUserId = item.data?.['fromUserId'];
    return item.type === 'new_follower' && fromUserId ? this.followUserById().get(fromUserId) : undefined;
  }

  iconFor(item: AppNotification): string {
    return TYPE_ICONS[item.type] ?? 'notifications-outline';
  }

  timeAgo(createdAt: number): string {
    const seconds = Math.max(0, Math.floor((Date.now() - createdAt) / 1000));
    const lang = this.languageService.currentLang();
    const rtf = new Intl.RelativeTimeFormat(lang ?? 'es', { numeric: 'auto' });
    if (seconds < 60) {
      return rtf.format(0, 'second');
    }
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) {
      return rtf.format(-minutes, 'minute');
    }
    const hours = Math.floor(minutes / 60);
    if (hours < 24) {
      return rtf.format(-hours, 'hour');
    }
    const days = Math.floor(hours / 24);
    return rtf.format(-days, 'day');
  }

  markAllRead(): void {
    const userId = this.authService.currentUser()?.id;
    if (!userId) {
      return;
    }
    this.notificationService.markAllRead(userId).subscribe({
      next: () => {
        this.items.update((list) => list.map((item) => ({ ...item, read: true })));
        // Every app-notification-bell instance reads this same signal, so the
        // badge on the other tabs updates immediately instead of waiting for
        // their own next 30s poll.
        this.notificationService.unreadCount.set(0);
      },
    });
  }

  /** Tapping anywhere on a row (including the embedded event/user card, whose
   * own click still navigates as normal) marks it read - there's no separate
   * "open" destination at the row level any more now that the real card is
   * inline. */
  markRowRead(item: AppNotification): void {
    if (item.read) {
      return;
    }
    this.notificationService.markRead(item.id).subscribe({
      next: () => {
        this.items.update((list) => list.map((i) => (i.id === item.id ? { ...i, read: true } : i)));
        this.notificationService.unreadCount.update((count) => Math.max(0, count - 1));
      },
    });
  }

  /** The envelope icon's own click - toggles read/unread explicitly, in
   * either direction. Stops propagation so it doesn't also trigger the
   * row's own (one-way, read-only) click handler above. */
  toggleRead(item: AppNotification, event: Event): void {
    event.stopPropagation();
    const request$ = item.read ? this.notificationService.markUnread(item.id) : this.notificationService.markRead(item.id);
    request$.subscribe({
      next: () => {
        this.items.update((list) => list.map((i) => (i.id === item.id ? { ...i, read: !item.read } : i)));
        this.notificationService.unreadCount.update((count) => (item.read ? count + 1 : Math.max(0, count - 1)));
      },
    });
  }

  openSortModal(): void {
    this.isSortModalOpen.set(true);
  }

  selectSort(value: SortMode): void {
    this.sortMode.set(value);
    this.isSortModalOpen.set(false);
  }

  openFilterModal(): void {
    this.draftTypes.set([...this.selectedTypes()]);
    this.draftReadFilter.set(this.readFilter());
    this.isFilterModalOpen.set(true);
  }

  toggleDraftType(type: NotificationType): void {
    this.draftTypes.update((types) => toggleWithMinimum(types, type, () => this.minSelectionWarning.flash('notificationTypes')));
  }

  selectDraftReadFilter(value: ReadFilter): void {
    this.draftReadFilter.set(value);
  }

  applyFilters(): void {
    this.selectedTypes.set(this.draftTypes());
    this.readFilter.set(this.draftReadFilter());
    this.isFilterModalOpen.set(false);
  }

  clearFilters(): void {
    this.draftTypes.set([...ALL_TYPES]);
    this.draftReadFilter.set('all');
    this.selectedTypes.set([...ALL_TYPES]);
    this.readFilter.set('all');
    this.isFilterModalOpen.set(false);
  }
}
