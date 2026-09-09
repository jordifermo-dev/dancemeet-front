import { AfterViewInit, Component, ElementRef, OnDestroy, computed, effect, inject, signal, untracked, viewChild } from '@angular/core';
import { forkJoin } from 'rxjs';
import { IonHeader, IonToolbar, IonTitle, IonButtons, IonContent, IonSpinner, IonIcon, ViewWillEnter } from '@ionic/angular/standalone';
import { TranslatePipe } from '@ngx-translate/core';
import { addIcons } from 'ionicons';
import { checkmarkDoneOutline, chatbubblesOutline, peopleOutline, closeOutline, checkmarkOutline } from 'ionicons/icons';
import { AuthService } from '../../../services/core/auth.service';
import { AppLanguage, LanguageService } from '../../../services/core/language.service';
import { AttendanceService } from '../../../services/attendance/attendance.service';
import { FavoriteService } from '../../../services/favorites/favorite.service';
import { DisciplineService } from '../../../services/event/discipline.service';
import { EventTypeService } from '../../../services/event/event-type.service';
import { DirectMessageService } from '../../../services/chat/direct-message.service';
import { EventListRefreshService } from '../../../services/event/event-list-refresh.service';
import { AttendedEvent, ConversationDetailed, Discipline, EventType, FollowUser } from '../../../models';
import { buildEventCardView } from '../../../shared/event/event-card/build-event-card-view';
import { EventCardComponent } from '../../../shared/event/event-card/event-card.component';
import { EventCardView } from '../../../shared/event/event-card/event-card.model';
import { UserCardComponent, UserCardAction } from '../../../shared/user/user-card/user-card.component';
import { formatRelativeTime } from '../../../shared/calendar/event-date-format';
import { NotificationBellComponent } from '../../../shared/notifications/notification-bell/notification-bell.component';

type ChatFilterKind = 'all' | 'events' | 'conversations';

interface EventChatRow {
  kind: 'event';
  id: string;
  view: EventCardView;
  lastActivityAt: number;
  unread: number;
}

interface ConversationChatRow {
  kind: 'conversation';
  id: string;
  peerUser: FollowUser;
  subtitle?: string;
  timestampLabel: string;
  lastActivityAt: number;
  unread: number;
  extraActions?: UserCardAction[];
}

type ChatRow = EventChatRow | ConversationChatRow;

/** The Chats tab - a single bandeja mixing event-xat rows (compact event
 * cards, tap opens that event's private xat) and 1:1 conversation rows,
 * ordered by whichever had the most recent activity. See
 * 15_tab-chats-implementacion.md, Punto 6 - deliberately no heavy filter
 * service (ExplorerFiltersService/event-list-filters.ts), just two plain
 * signals, since there are only two simple axes to filter by here. */
@Component({
  selector: 'app-chats',
  standalone: true,
  templateUrl: 'chats.page.html',
  styleUrl: 'chats.page.scss',
  imports: [
    IonHeader,
    IonToolbar,
    IonTitle,
    IonButtons,
    IonContent,
    IonSpinner,
    IonIcon,
    TranslatePipe,
    EventCardComponent,
    UserCardComponent,
    NotificationBellComponent,
  ],
})
export class ChatsPage implements ViewWillEnter, AfterViewInit, OnDestroy {
  private readonly authService = inject(AuthService);
  private readonly languageService = inject(LanguageService);
  private readonly attendanceService = inject(AttendanceService);
  private readonly favoriteService = inject(FavoriteService);
  private readonly disciplineService = inject(DisciplineService);
  private readonly eventTypeService = inject(EventTypeService);
  private readonly directMessageService = inject(DirectMessageService);
  private readonly refreshNotifier = inject(EventListRefreshService);

  private readonly topOverlayRef = viewChild<ElementRef<HTMLElement>>('topOverlay');
  private overlayResizeObserver?: ResizeObserver;
  /** Measured from the real overlay height (see ngAfterViewInit) rather than
   * guessed - same reasoning/pattern as Explorer/Notifications' own
   * listTopPadding (event-list-filters.ts), just a small local ResizeObserver
   * instead of pulling in that whole filter-service factory for one row of
   * pills. */
  readonly listTopPadding = signal(60);

  readonly loading = signal(true);
  private readonly attendedEvents = signal<AttendedEvent[]>([]);
  private readonly conversations = signal<ConversationDetailed[]>([]);
  private readonly likedEventIds = signal<Set<string>>(new Set());
  private readonly disciplinesById = signal<Map<string, Discipline>>(new Map());
  private readonly eventTypesById = signal<Map<string, EventType>>(new Map());

  readonly filterKind = signal<ChatFilterKind>('all');
  readonly unreadOnly = signal(false);

  private readonly eventRows = computed<EventChatRow[]>(() => {
    const lang = this.languageService.currentLang();
    const currentUserId = this.authService.currentUser()?.id;
    const disciplinesById = this.disciplinesById();
    const eventTypesById = this.eventTypesById();
    const likedEventIds = this.likedEventIds();
    // Only events with at least one xat message - an attended event whose
    // private xat is still empty would otherwise clutter this tab with a
    // row that has nothing to show yet (see lastChatActivityAt's own doc
    // comment on AttendedEventDto, backend).
    return this.attendedEvents()
      .filter((event) => event.lastChatActivityAt !== undefined)
      .map((event) => ({
        kind: 'event' as const,
        id: event.id,
        // relation here is 'creator'|'attendee' (AttendanceRelation), not the
        // 'creator'|'favorite' (EventRelation) buildEventCardView expects -
        // irrelevant anyway (compact mode hides the relation-badge tag row,
        // and isLiked is driven by the explicit likedEventIds below, not the
        // relation fallback), so it's simply omitted rather than mapped.
        view: buildEventCardView({ ...event, relation: undefined }, disciplinesById, eventTypesById, lang, currentUserId, likedEventIds),
        lastActivityAt: event.lastChatActivityAt ?? 0,
        unread: event.unreadChatCount ?? 0,
      }));
  });

  /** Conversations that belong in the main bandeja - accepted ones, plus a
   * still-pending one this user themselves started (they already know
   * they're waiting, no separate "Solicitudes" treatment needed for their
   * own outgoing request). */
  private readonly conversationRows = computed<ConversationChatRow[]>(() => {
    const myId = this.authService.currentUser()?.id;
    const lang = this.languageService.currentLang();
    return this.conversations()
      .filter((conversation) => conversation.status === 'accepted' || conversation.requestedBy === myId)
      .map((conversation) => this.toConversationRow(conversation, lang));
  });

  /** Pending requests from someone else - shown separately with Aceptar/
   * Rechazar, never mixed into the main bandeja until accepted (see
   * ConversationService.acceptConversation, backend). */
  readonly requestRows = computed<ConversationChatRow[]>(() => {
    const myId = this.authService.currentUser()?.id;
    const lang = this.languageService.currentLang();
    return this.conversations()
      .filter((conversation) => conversation.status === 'pending' && conversation.requestedBy !== myId)
      .map((conversation) => this.toConversationRow(conversation, lang, true));
  });

  readonly rows = computed<ChatRow[]>(() => {
    const kind = this.filterKind();
    const unreadOnly = this.unreadOnly();
    const rows: ChatRow[] = [
      ...(kind === 'conversations' ? [] : this.eventRows()),
      ...(kind === 'events' ? [] : this.conversationRows()),
    ];
    return rows.filter((row) => !unreadOnly || row.unread > 0).sort((a, b) => b.lastActivityAt - a.lastActivityAt);
  });

  constructor() {
    addIcons({ checkmarkDoneOutline, chatbubblesOutline, peopleOutline, closeOutline, checkmarkOutline });

    // Sending/receiving a message anywhere (this tab's own conversations,
    // the 1:1 xat screen, an event's private xat) bumps this - see
    // direct-message.page.ts/event-detail.page.ts's own calls to
    // notifyChanged(). Ionic's ionViewWillEnter alone doesn't reliably
    // re-fire on a plain back-navigation into this already-instantiated tab
    // (see EventListRefreshService's own doc comment), so this is the
    // reliable way back onto this tab picks up fresh previews/order/badges.
    effect(() => {
      this.refreshNotifier.version();
      untracked(() => this.loadAll());
    });
  }

  ngAfterViewInit(): void {
    const el = this.topOverlayRef()?.nativeElement;
    if (!el) {
      return;
    }
    this.listTopPadding.set(Math.ceil(el.offsetHeight) + 16);
    this.overlayResizeObserver = new ResizeObserver(() => {
      this.listTopPadding.set(Math.ceil(el.offsetHeight) + 16);
    });
    this.overlayResizeObserver.observe(el);
  }

  ngOnDestroy(): void {
    this.overlayResizeObserver?.disconnect();
  }

  ionViewWillEnter(): void {
    this.loadAll();
  }

  private loadAll(): void {
    const myId = this.authService.currentUser()?.id;
    if (!myId) {
      this.loading.set(false);
      return;
    }
    this.loading.set(true);
    forkJoin({
      attended: this.attendanceService.getAttendedEvents(myId),
      favorited: this.favoriteService.getFavoritedEvents(myId),
      conversations: this.directMessageService.listConversations(),
      disciplines: this.disciplineService.getAll(),
      eventTypes: this.eventTypeService.getAll(),
    }).subscribe({
      next: ({ attended, favorited, conversations, disciplines, eventTypes }) => {
        this.attendedEvents.set(attended);
        this.likedEventIds.set(new Set(favorited.map((event) => event.id)));
        this.conversations.set(conversations);
        this.disciplinesById.set(new Map(disciplines.map((d) => [d.id, d])));
        this.eventTypesById.set(new Map(eventTypes.map((e) => [e.id, e])));
        this.loading.set(false);
      },
      error: () => this.loading.set(false),
    });
  }

  private toConversationRow(conversation: ConversationDetailed, lang: AppLanguage | null, isRequest = false): ConversationChatRow {
    const lastActivityAt = conversation.lastMessageAt ?? conversation.createdAt;
    return {
      kind: 'conversation',
      id: conversation.id,
      peerUser: { id: conversation.peerId, name: conversation.peerName, photoUrl: conversation.peerPhotoUrl, disciplineIds: [], followedAt: 0 },
      subtitle: conversation.lastMessagePreview,
      timestampLabel: formatRelativeTime(lastActivityAt, lang),
      lastActivityAt,
      unread: conversation.unreadCount,
      extraActions: isRequest
        ? [
            { labelKey: 'chat.requestDecline', icon: 'close-outline', busy: false, onClick: () => this.declineRequest(conversation.id) },
            { labelKey: 'chat.requestAccept', icon: 'checkmark-outline', busy: false, onClick: () => this.acceptRequest(conversation.id) },
          ]
        : undefined,
    };
  }

  acceptRequest(conversationId: string): void {
    this.directMessageService.acceptConversation(conversationId).subscribe({
      next: () => this.loadAll(),
    });
  }

  declineRequest(conversationId: string): void {
    this.directMessageService.declineConversation(conversationId).subscribe({
      next: () => this.loadAll(),
    });
  }
}
