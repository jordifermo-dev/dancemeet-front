import { Component, computed, inject, signal } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { skip } from 'rxjs';
import {
  IonHeader,
  IonToolbar,
  IonTitle,
  IonButtons,
  IonBackButton,
  IonContent,
  IonSearchbar,
  IonSpinner,
  IonIcon,
  IonButton,
  IonModal,
  ViewWillEnter,
} from '@ionic/angular/standalone';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { addIcons } from 'ionicons';
import {
  optionsOutline,
  chevronDownOutline,
  refreshOutline,
  checkmarkOutline,
  closeOutline,
  trashOutline,
  personAddOutline,
  ribbonOutline,
} from 'ionicons/icons';
import { AuthService } from '../../../../services/core/auth.service';
import { FollowService } from '../../../../services/user/follow.service';
import { AttendanceService } from '../../../../services/attendance/attendance.service';
import { DisciplineService } from '../../../../services/event/discipline.service';
import { EventService } from '../../../../services/event/event.service';
import { EventManagerService } from '../../../../services/event-managers/event-manager.service';
import { UserService } from '../../../../services/user/user.service';
import { FollowSortMode, SortPreferenceService } from '../../../../services/filters/sort-preference.service';
import { ChatHistoryAccess, Discipline, DISCIPLINE_NAMES, EventManager, EventManagerRole, EventWithCreatorName, FollowUser } from '../../../../models';
import { sortByNameOrder } from '../../../../shared/event/icon-catalog';
import { createApplyFlash } from '../../../../shared/common/success-flash';
import { UserCardComponent, UserCardAction } from '../../../../shared/user/user-card/user-card.component';
import { FilterSheetHeaderComponent } from '../../../../shared/filters/filter-sheet-header/filter-sheet-header.component';
import { FilterActionsRowComponent } from '../../../../shared/filters/filter-actions-row/filter-actions-row.component';
import { ChipGridComponent, ChipGridItem } from '../../../../shared/filters/chip-grid/chip-grid.component';
import { InviteParticipantSheetComponent } from '../../../../shared/event/invite-participant-sheet/invite-participant-sheet.component';
import { canManageEvent } from '../../../../shared/event/event-manager-permissions';

type FollowListMode = 'followers' | 'following' | 'attendees';
type SortMode = FollowSortMode;

const SORT_OPTIONS: { id: SortMode; labelKey: string }[] = [
  { id: 'nameAsc', labelKey: 'followList.sortNameAsc' },
  { id: 'nameDesc', labelKey: 'followList.sortNameDesc' },
  { id: 'dateNewest', labelKey: 'followList.sortDateNewest' },
  { id: 'dateOldest', labelKey: 'followList.sortDateOldest' },
];

@Component({
  selector: 'app-follow-list',
  standalone: true,
  templateUrl: 'follow-list.page.html',
  styleUrls: ['follow-list.page.scss'],
  imports: [
    IonHeader,
    IonToolbar,
    IonTitle,
    IonButtons,
    IonBackButton,
    IonContent,
    IonSearchbar,
    IonSpinner,
    IonIcon,
    IonButton,
    IonModal,
    TranslatePipe,
    UserCardComponent,
    FilterSheetHeaderComponent,
    FilterActionsRowComponent,
    ChipGridComponent,
    InviteParticipantSheetComponent,
  ],
})
export class FollowListPage implements ViewWillEnter {
  private readonly route = inject(ActivatedRoute);
  private readonly authService = inject(AuthService);
  private readonly followService = inject(FollowService);
  private readonly attendanceService = inject(AttendanceService);
  private readonly disciplineService = inject(DisciplineService);
  private readonly eventService = inject(EventService);
  private readonly eventManagerService = inject(EventManagerService);
  private readonly userService = inject(UserService);
  private readonly translate = inject(TranslateService);
  private readonly sortPreference = inject(SortPreferenceService);

  readonly disciplinesById = signal<Map<string, Discipline>>(new Map());

  readonly mode: FollowListMode = this.route.snapshot.data['mode'];
  readonly titleKey =
    this.mode === 'followers'
      ? 'followList.followersTitle'
      : this.mode === 'following'
        ? 'followList.followingTitle'
        : 'followList.attendeesTitle';

  readonly loading = signal(true);
  readonly items = signal<FollowUser[]>([]);
  readonly searchTerm = signal('');
  // Shared with Followers/Following/Attendees (this same page, re-navigated
  // per mode) so the chosen order survives switching between them.
  readonly sortMode = this.sortPreference.followSortMode;
  readonly sortOptions = SORT_OPTIONS;
  readonly isSortModalOpen = signal(false);
  readonly currentSortLabelKey = computed(
    () => this.sortOptions.find((option) => option.id === this.sortMode())?.labelKey ?? this.sortOptions[0].labelKey,
  );

  readonly disciplines = signal<Discipline[]>([]);
  readonly isFilterModalOpen = signal(false);
  readonly draftDisciplineFilterIds = signal<string[]>([]);
  readonly appliedDisciplineFilterIds = signal<string[]>([]);
  readonly disciplineChipItems = computed<ChipGridItem[]>(() =>
    this.disciplines().map((discipline) => ({
      id: discipline.id,
      label: discipline.name,
      iconUrl: '/' + discipline.iconUrl,
      selected: this.draftDisciplineFilterIds().includes(discipline.id),
    })),
  );

  readonly showConfirmModal = signal(false);
  readonly confirmTitleKey = signal('');
  readonly confirmMessage = signal('');
  private pendingConfirmResolve: ((confirmed: boolean) => void) | null = null;
  private pendingConfirmValue = false;

  // --- whole-app search (merged into the same list, see mergedItems below) -

  private readonly wholeAppResults = signal<FollowUser[]>([]);
  readonly searching = signal(false);

  /** Everyone already related in some way - excluded from the "new" group so
   * a person never shows up twice. Attendees mode also excludes the event's
   * own creator (already rendered via the badge on their own attendee row,
   * not a search result) and, deliberately, only *existing participants*
   * (not plain self-joined attendees - see the module doc comment on why an
   * already-attending, not-yet-organizer person isn't offered a "promote to
   * organizer" action from this simplified list). */
  private readonly relatedUserIds = computed(() => {
    const ids = new Set(this.items().map((item) => item.id));
    this.participants().forEach((participant) => ids.add(participant.userId));
    const me = this.authService.currentUser()?.id;
    if (me) {
      ids.add(me);
    }
    const event = this.event();
    if (event) {
      ids.add(event.creatorId);
    }
    return ids;
  });

  /** The three independently-sorted groups rendered in order: people already
   * related, (attendees mode only) people with a pending invite, and people
   * found by the whole-app search who aren't related yet at all - kept apart
   * rather than interleaved, so "who's already here" always reads clearly
   * even while a search is active. */
  readonly confirmedItems = computed<FollowUser[]>(() => this.sortFollowUsers(this.filterByTermAndDiscipline(this.items())));

  readonly newItems = computed<FollowUser[]>(() => {
    const excluded = this.relatedUserIds();
    const candidates = this.wholeAppResults().filter((user) => !excluded.has(user.id));
    return this.sortFollowUsers(this.filterByDiscipline(candidates));
  });

  private filterByTermAndDiscipline(list: FollowUser[]): FollowUser[] {
    const term = this.searchTerm().trim().toLowerCase();
    const byTerm = term ? list.filter((item) => item.name.toLowerCase().includes(term)) : list;
    return this.filterByDiscipline(byTerm);
  }

  // Same "any of the selected disciplines" convention as Explorer/Favorites -
  // every discipline selected (the default, matching what's shown before any
  // filter is touched) or none selected are both treated as no constraint,
  // rather than only the emptied-out state.
  private filterByDiscipline(list: FollowUser[]): FollowUser[] {
    const filterIds = this.appliedDisciplineFilterIds();
    if (filterIds.length === 0 || filterIds.length >= this.disciplines().length) {
      return list;
    }
    return list.filter((item) => item.disciplineIds.some((id) => filterIds.includes(id)));
  }

  private sortFollowUsers(list: FollowUser[]): FollowUser[] {
    const sorted = [...list];
    switch (this.sortMode()) {
      case 'nameAsc':
        return sorted.sort((a, b) => a.name.localeCompare(b.name));
      case 'nameDesc':
        return sorted.sort((a, b) => b.name.localeCompare(a.name));
      case 'dateNewest':
        return sorted.sort((a, b) => b.followedAt - a.followedAt);
      case 'dateOldest':
        return sorted.sort((a, b) => a.followedAt - b.followedAt);
    }
  }

  // --- 'attendees' mode: organizer invite/manage ----------------------------

  private readonly eventId = this.route.snapshot.queryParamMap.get('eventId');
  readonly event = signal<EventWithCreatorName | null>(null);
  readonly participants = signal<EventManager[]>([]);
  readonly canManageAttendees = computed(() =>
    canManageEvent(this.event(), this.participants(), this.authService.currentUser()?.id),
  );
  readonly pendingParticipants = computed<EventManager[]>(() => {
    const list = this.participants().filter((p) => p.status === 'pending');
    const sorted = [...list];
    switch (this.sortMode()) {
      case 'nameAsc':
        return sorted.sort((a, b) => a.userName.localeCompare(b.userName));
      case 'nameDesc':
        return sorted.sort((a, b) => b.userName.localeCompare(a.userName));
      case 'dateNewest':
        return sorted.sort((a, b) => b.createdAt - a.createdAt);
      case 'dateOldest':
        return sorted.sort((a, b) => a.createdAt - b.createdAt);
    }
  });
  /** pendingParticipants split in two - an organizer-sent invite
   * (invitedByUserId is the inviting manager's id) needs a "cancel invite"
   * action, while a self-requested join (invitedByUserId === the row's own
   * userId, see EventManagerService.requestToJoin, backend) needs "Aprobar"/
   * "Rechazar" instead - very different actions for what would otherwise
   * look like the same "pending" row. */
  readonly pendingInvitedParticipants = computed(() => this.pendingParticipants().filter((p) => p.invitedByUserId !== p.userId));
  readonly pendingRequestedParticipants = computed(() => this.pendingParticipants().filter((p) => p.invitedByUserId === p.userId));
  private readonly acceptedManagerIds = computed(
    () => new Set(this.participants().filter((p) => p.role === 'manager' && p.status === 'accepted').map((p) => p.userId)),
  );
  readonly inviteBusyUserId = signal<string | null>(null);
  readonly actionErrorMessage = signal<string | null>(null);
  readonly removeBusyUserId = signal<string | null>(null);
  readonly joinRequestBusyUserId = signal<string | null>(null);

  constructor() {
    addIcons({
      optionsOutline,
      chevronDownOutline,
      refreshOutline,
      checkmarkOutline,
      closeOutline,
      trashOutline,
      personAddOutline,
      ribbonOutline,
    });

    this.disciplineService.getAll().subscribe({
      next: (disciplines) => {
        this.disciplinesById.set(new Map(disciplines.map((d) => [d.id, d])));
        const sorted = sortByNameOrder(disciplines, DISCIPLINE_NAMES);
        this.disciplines.set(sorted);
        // No preference set yet = every discipline selected (matches what's
        // actually shown - no filter applied), not an empty selection.
        const ids = sorted.map((d) => d.id);
        this.draftDisciplineFilterIds.set(ids);
        this.appliedDisciplineFilterIds.set(ids);
      },
    });

    // skip(1): the initial emission (covering first load) is handled by
    // ionViewWillEnter below - without the skip, both fired loadItems() on
    // first entry, racing two identical in-flight requests against each
    // other (visible as a flaky blank list on slow devices). This subscription
    // only needs to react to *later* emissions - e.g. browsing from one
    // user's followers into another's without recreating this component.
    this.route.queryParamMap.pipe(skip(1)).subscribe(() => this.loadItems());
  }

  /** Ionic keeps this page's instance alive, so re-fetch every time it's re-entered -
   * otherwise unfollowing/removing someone on the detail screen and coming back
   * would still show the stale, pre-change list. Also covers the very first
   * entry (see the skip(1) above). */
  ionViewWillEnter(): void {
    this.loadItems();
  }

  private loadItems(): void {
    if (this.mode === 'attendees') {
      const eventId = this.eventId;
      if (!eventId) {
        this.loading.set(false);
        return;
      }
      this.loading.set(true);
      this.attendanceService.getEventAttendees(eventId).subscribe({
        next: (attendees) => {
          // Reuses FollowUser's shape/field name so the rest of this page
          // (search/sort/render) doesn't need to know about a second type.
          this.items.set(attendees.map((attendee) => ({ ...attendee, followedAt: attendee.attendedAt })));
          this.loading.set(false);
        },
        error: () => this.loading.set(false),
      });
      this.eventService.getById(eventId).subscribe({
        next: (event) => this.event.set(event),
      });
      this.loadParticipants(eventId);
      return;
    }

    const userId = this.route.snapshot.queryParamMap.get('userId') ?? this.authService.currentUser()?.id;
    if (!userId) {
      this.loading.set(false);
      return;
    }

    this.loading.set(true);
    const request$ =
      this.mode === 'followers' ? this.followService.getFollowers(userId) : this.followService.getFollowing(userId);

    request$.subscribe({
      next: (items) => {
        this.items.set(items);
        this.loading.set(false);
      },
      error: () => this.loading.set(false),
    });
  }

  private loadParticipants(eventId: string): void {
    this.eventManagerService.getParticipants(eventId).subscribe({
      next: (participants) => this.participants.set(participants),
      error: () => this.participants.set([]),
    });
  }

  /** ion-searchbar's own [debounce] already spaces out calls while typing -
   * filters the already-loaded list locally *and* (if there's a term) fires
   * a whole-app search for the "not related yet" group, at the same time. */
  onSearchChange(value: string | null | undefined): void {
    const term = value ?? '';
    this.searchTerm.set(term);
    const trimmed = term.trim();
    if (!trimmed) {
      this.wholeAppResults.set([]);
      this.searching.set(false);
      return;
    }
    this.searching.set(true);
    this.userService.searchUsers(trimmed).subscribe({
      next: (users) => {
        this.wholeAppResults.set(
          users.map((user) => ({
            id: user.id,
            name: user.name,
            photoUrl: user.photoUrl,
            disciplineIds: user.disciplineIds,
            followedAt: 0,
            email: user.email,
            showEmail: user.showEmail,
          })),
        );
        this.searching.set(false);
      },
      error: () => this.searching.set(false),
    });
  }

  openSortModal(): void {
    this.isSortModalOpen.set(true);
  }

  selectSort(value: SortMode): void {
    this.sortMode.set(value);
    this.isSortModalOpen.set(false);
  }

  /** Passed to every row's <app-user-card> as its confirmUnfollow input -
   * reuses this page's own generic confirm sheet instead of each row
   * building its own. */
  readonly confirmUnfollowUser = (user: FollowUser): Promise<boolean> =>
    this.confirm('userDetail.confirmUnfollowTitle', this.translate.instant('userDetail.confirmUnfollowMessage', { name: user.name }));

  private async confirm(titleKey: string, message: string): Promise<boolean> {
    this.confirmTitleKey.set(titleKey);
    this.confirmMessage.set(message);
    this.pendingConfirmValue = false;
    this.showConfirmModal.set(true);
    // Waits for (didDismiss), not the button click itself - the sheet must be fully
    // closed before the caller acts, otherwise the overlay can be left stuck on
    // screen mid-animation, swallowing every tap in the app from then on.
    return new Promise<boolean>((resolve) => {
      this.pendingConfirmResolve = resolve;
    });
  }

  confirmModalCancel(): void {
    this.pendingConfirmValue = false;
    this.showConfirmModal.set(false);
  }

  confirmModalAccept(): void {
    this.pendingConfirmValue = true;
    this.showConfirmModal.set(false);
  }

  /** Fires once the sheet has fully closed (button tap, swipe-down or backdrop tap alike). */
  onConfirmModalDismiss(): void {
    this.pendingConfirmResolve?.(this.pendingConfirmValue);
    this.pendingConfirmResolve = null;
  }

  openFilterModal(): void {
    this.draftDisciplineFilterIds.set([...this.appliedDisciplineFilterIds()]);
    this.isFilterModalOpen.set(true);
  }

  toggleDraftDiscipline(id: string): void {
    this.draftDisciplineFilterIds.update((ids) =>
      ids.includes(id) ? ids.filter((existing) => existing !== id) : [...ids, id],
    );
  }

  readonly disciplineApplyFlash = createApplyFlash(() => this.isFilterModalOpen.set(false));

  applyDisciplineFilter(): void {
    this.appliedDisciplineFilterIds.set(this.draftDisciplineFilterIds());
    this.disciplineApplyFlash.trigger();
  }

  clearDisciplineFilter(): void {
    const allIds = this.disciplines().map((d) => d.id);
    this.draftDisciplineFilterIds.set(allIds);
    this.appliedDisciplineFilterIds.set(allIds);
    this.isFilterModalOpen.set(false);
  }

  // --- 'attendees' mode: organizer actions ----------------------------------

  /** Only rendered for the "new" group's rows (via <app-user-card>'s
   * extraActions), and only when this viewer can manage the event - replaces
   * the follow button there with the actual reason that row is showing.
   * Tapping either action opens the invite sheet (see pendingInvite below)
   * instead of firing the invite immediately - the inviter still needs to
   * choose the xat history access first. */
  inviteActionsFor(user: FollowUser): UserCardAction[] | undefined {
    if (this.mode !== 'attendees' || !this.canManageAttendees()) {
      return undefined;
    }
    const busy = this.inviteBusyUserId() === user.id;
    return [
      {
        labelKey: 'followList.inviteAsAttendee',
        icon: 'person-add-outline',
        busy,
        onClick: (u) => this.openInviteSheet(u, 'attendee'),
      },
      {
        labelKey: 'followList.inviteAsOrganizer',
        icon: 'ribbon-outline',
        busy,
        onClick: (u) => this.openInviteSheet(u, 'manager'),
      },
    ];
  }

  /** Set while the invite sheet is open - cleared by either
   * onInviteConfirmed or onInviteCancelled. */
  readonly pendingInvite = signal<{ user: FollowUser; role: EventManagerRole } | null>(null);

  private openInviteSheet(user: FollowUser, role: EventManagerRole): void {
    if (this.inviteBusyUserId()) {
      return;
    }
    this.pendingInvite.set({ user, role });
  }

  onInviteCancelled(): void {
    this.pendingInvite.set(null);
  }

  onInviteConfirmed(chatHistoryAccess: ChatHistoryAccess): void {
    const pending = this.pendingInvite();
    const eventId = this.event()?.id;
    this.pendingInvite.set(null);
    if (!pending || !eventId || this.inviteBusyUserId()) {
      return;
    }
    this.actionErrorMessage.set(null);
    this.inviteBusyUserId.set(pending.user.id);
    this.eventManagerService.inviteParticipant(eventId, pending.user.id, pending.role, chatHistoryAccess).subscribe({
      next: () => {
        this.inviteBusyUserId.set(null);
        this.loadParticipants(eventId);
      },
      error: () => {
        this.inviteBusyUserId.set(null);
        this.actionErrorMessage.set('followList.inviteError');
      },
    });
  }

  /** Fully removes someone from the event (attendance + any organizer role,
   * see EventManagerService.removeParticipant) - used by both the per-row
   * remove action below and cancelPendingInvite. Deliberately never touches
   * Follow, so the row's own follow/unfollow button (rendered alongside,
   * not replaced - see removeActionFor) keeps reflecting the real
   * relationship regardless of what happens here. */
  removeParticipant(userId: string): void {
    const eventId = this.event()?.id;
    if (!eventId || this.removeBusyUserId()) {
      return;
    }
    this.actionErrorMessage.set(null);
    this.removeBusyUserId.set(userId);
    this.eventManagerService.removeParticipant(eventId, userId).subscribe({
      next: () => {
        this.removeBusyUserId.set(null);
        this.loadParticipants(eventId);
        this.loadItems();
      },
      error: () => {
        this.removeBusyUserId.set(null);
        this.actionErrorMessage.set('followList.removeAttendeeError');
      },
    });
  }

  /** Cancels a still-pending invite of either role - same removal call, the
   * backend doesn't care which role a pending row has (see
   * EventManagerService.removeParticipant's own comment). */
  cancelPendingInvite(userId: string): void {
    this.removeParticipant(userId);
  }

  /** Reshapes a pending EventManager row into <app-user-card>'s expected
   * input, the same as newItems' whole-app search results - lets pending
   * rows render through the same row template (avatar, disciplines, follow
   * button) instead of a bespoke layout of their own. */
  pendingParticipantUser(participant: EventManager): FollowUser {
    return {
      id: participant.userId,
      name: participant.userName,
      photoUrl: participant.userPhotoUrl,
      disciplineIds: participant.userDisciplineIds,
      followedAt: participant.createdAt,
      email: participant.userEmail,
      showEmail: participant.userShowEmail,
    };
  }

  pendingBadgeFor(participant: EventManager): string {
    return this.translate.instant(
      participant.role === 'manager' ? 'eventManagers.organizerBadge' : 'followList.attendeeRoleBadge',
    );
  }

  /** Cancels the invite - same removeParticipant call as removeActionFor
   * below, just always available (no creator to exclude here, a pending row
   * is by definition not the creator) and with no confirm step, matching
   * this button's pre-existing behavior. */
  pendingRemoveActionFor(participant: EventManager): UserCardAction {
    return this.trashAction(participant.userId, 'followList.cancelInvite', () =>
      this.cancelPendingInvite(participant.userId),
    );
  }

  /** Aprobar/Rechazar for a self-requested join (see
   * pendingRequestedParticipants) - replaces the follow button via
   * extraActions, same mechanism inviteActionsFor already uses for the "new"
   * search group's own invite buttons. */
  joinRequestActionsFor(participant: EventManager): UserCardAction[] {
    const busy = this.joinRequestBusyUserId() === participant.userId;
    return [
      {
        labelKey: 'followList.declineRequest',
        icon: 'close-outline',
        busy,
        onClick: () => this.respondToJoinRequest(participant.userId, false),
      },
      {
        labelKey: 'followList.approveRequest',
        icon: 'checkmark-outline',
        busy,
        onClick: () => this.respondToJoinRequest(participant.userId, true),
      },
    ];
  }

  private respondToJoinRequest(requesterId: string, accept: boolean): void {
    const eventId = this.event()?.id;
    if (!eventId || this.joinRequestBusyUserId()) {
      return;
    }
    this.actionErrorMessage.set(null);
    this.joinRequestBusyUserId.set(requesterId);
    this.eventManagerService.respondToJoinRequest(eventId, requesterId, accept).subscribe({
      next: () => {
        this.joinRequestBusyUserId.set(null);
        this.loadParticipants(eventId);
        if (accept) {
          this.loadItems();
        }
      },
      error: () => {
        this.joinRequestBusyUserId.set(null);
        this.actionErrorMessage.set('followList.joinRequestError');
      },
    });
  }

  /** The creator gets the same badge as an accepted manager - both have full
   * organizer rights, and the creator's row lives in items() too (they
   * auto-favorite their own event, see EventService.createEvent). Purely
   * informational now - removal (of an attendee or an organizer alike) goes
   * through removeActionFor's dedicated button, not the badge. */
  private isOrganizerRow(item: FollowUser): boolean {
    return this.event()?.creatorId === item.id || this.acceptedManagerIds().has(item.id);
  }

  organizerBadgeFor(item: FollowUser): string | undefined {
    return this.isOrganizerRow(item) ? this.translate.instant('eventManagers.organizerBadge') : undefined;
  }

  /** Only for the 'attendees' mode's already-related group: lets an
   * organizer remove anyone from the event - attendee or fellow organizer
   * alike, follower of theirs or not (see EventManagerService.removeParticipant,
   * which no longer requires an existing invite row, so a plain
   * self-favorited attendee can be removed too). The creator can't be
   * targeted - there's nothing to remove for them (their rights are
   * implicit, not a row) and the backend would reject it anyway. */
  removeActionFor(item: FollowUser): UserCardAction | undefined {
    if (this.mode !== 'attendees' || !this.canManageAttendees() || item.id === this.event()?.creatorId) {
      return undefined;
    }
    return this.trashAction(item.id, 'followList.removeAttendee', () => this.confirmAndRemoveParticipant(item));
  }

  private async confirmAndRemoveParticipant(user: FollowUser): Promise<void> {
    const confirmed = await this.confirm(
      'followList.confirmRemoveAttendeeTitle',
      this.translate.instant('followList.confirmRemoveAttendeeMessage', { name: user.name }),
    );
    if (confirmed) {
      this.removeParticipant(user.id);
    }
  }

  /** Shared shape behind both removeActionFor and pendingRemoveActionFor -
   * the two only differ in label and what tapping actually does (confirm
   * dialog first vs. cancel outright). */
  private trashAction(targetUserId: string, labelKey: string, onClick: () => void): UserCardAction {
    return {
      labelKey,
      icon: 'trash-outline',
      busy: this.removeBusyUserId() === targetUserId,
      onClick,
    };
  }
}
