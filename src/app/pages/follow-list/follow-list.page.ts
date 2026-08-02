import { Component, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
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
import { personOutline, optionsOutline, close, personAddOutline, chevronDownOutline } from 'ionicons/icons';
import { AuthService } from '../../services/auth.service';
import { FollowService } from '../../services/follow.service';
import { FavoriteService } from '../../services/favorite.service';
import { DisciplineService } from '../../services/discipline.service';
import { FollowSortMode, SortPreferenceService } from '../../services/sort-preference.service';
import { Discipline, DISCIPLINE_NAMES, FollowUser } from '../../models';
import { sortByNameOrder } from '../../shared/icon-catalog';

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
  ],
})
export class FollowListPage implements ViewWillEnter {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly authService = inject(AuthService);
  private readonly followService = inject(FollowService);
  private readonly favoriteService = inject(FavoriteService);
  private readonly disciplineService = inject(DisciplineService);
  private readonly translate = inject(TranslateService);
  private readonly sortPreference = inject(SortPreferenceService);

  private readonly disciplinesById = signal<Map<string, Discipline>>(new Map());

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

  // Per-row follow/unfollow (Instagram-style): overrides the server-derived
  // relationship right after tapping the button, so it updates immediately
  // instead of waiting for `currentUser()` to be resynced from the backend.
  private readonly amFollowingOverrides = signal<Map<string, boolean>>(new Map());

  readonly showConfirmModal = signal(false);
  readonly confirmTitleKey = signal('');
  readonly confirmMessage = signal('');
  private pendingConfirmResolve: ((confirmed: boolean) => void) | null = null;
  private pendingConfirmValue = false;

  readonly filteredItems = computed(() => {
    const term = this.searchTerm().trim().toLowerCase();
    let list = term ? this.items().filter((item) => item.name.toLowerCase().includes(term)) : [...this.items()];

    const filterIds = this.appliedDisciplineFilterIds();
    if (filterIds.length) {
      // AND, not OR: only users who have every selected discipline match.
      list = list.filter((item) => filterIds.every((id) => item.disciplineIds.includes(id)));
    }

    switch (this.sortMode()) {
      case 'nameAsc':
        return list.sort((a, b) => a.name.localeCompare(b.name));
      case 'nameDesc':
        return list.sort((a, b) => b.name.localeCompare(a.name));
      case 'dateNewest':
        return list.sort((a, b) => b.followedAt - a.followedAt);
      case 'dateOldest':
        return list.sort((a, b) => a.followedAt - b.followedAt);
    }
  });

  constructor() {
    addIcons({ personOutline, optionsOutline, close, personAddOutline, chevronDownOutline });

    this.disciplineService.getAll().subscribe({
      next: (disciplines) => {
        this.disciplinesById.set(new Map(disciplines.map((d) => [d.id, d])));
        this.disciplines.set(sortByNameOrder(disciplines, DISCIPLINE_NAMES));
      },
    });

    // queryParamMap emits immediately on subscribe (covers the initial load)
    // and again whenever ?userId changes without recreating this component -
    // e.g. browsing from one user's followers into another's.
    this.route.queryParamMap.subscribe(() => this.loadItems());
  }

  /** Ionic keeps this page's instance alive, so re-fetch every time it's re-entered -
   * otherwise unfollowing/removing someone on the detail screen and coming back
   * would still show the stale, pre-change list. */
  ionViewWillEnter(): void {
    this.loadItems();
  }

  private loadItems(): void {
    if (this.mode === 'attendees') {
      const eventId = this.route.snapshot.queryParamMap.get('eventId');
      if (!eventId) {
        this.loading.set(false);
        return;
      }
      this.loading.set(true);
      this.favoriteService.getEventAttendees(eventId).subscribe({
        next: (attendees) => {
          // Reuses FollowUser's shape/field name so the rest of this page
          // (search/sort/render) doesn't need to know about a second type.
          this.items.set(attendees.map((attendee) => ({ ...attendee, followedAt: attendee.attendedAt })));
          this.loading.set(false);
        },
        error: () => this.loading.set(false),
      });
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

  onSearchChange(value: string | null | undefined): void {
    this.searchTerm.set(value ?? '');
  }

  openSortModal(): void {
    this.isSortModalOpen.set(true);
  }

  selectSort(value: SortMode): void {
    this.sortMode.set(value);
    this.isSortModalOpen.set(false);
  }

  disciplinesFor(item: FollowUser): Discipline[] {
    const byId = this.disciplinesById();
    return item.disciplineIds.map((id) => byId.get(id)).filter((d): d is Discipline => d !== undefined);
  }

  /** True only if *I* (the logged-in user) actually follow this row right now -
   * independent of whose followers/following list is being browsed. */
  isFollowedByMe(item: FollowUser): boolean {
    const override = this.amFollowingOverrides().get(item.id);
    if (override !== undefined) {
      return override;
    }
    const me = this.authService.currentUser();
    return !!me && (me.followingId ?? []).includes(item.id);
  }

  isMe(item: FollowUser): boolean {
    return this.authService.currentUser()?.id === item.id;
  }

  follow(item: FollowUser, event: Event): void {
    event.stopPropagation();
    const me = this.authService.currentUser();
    if (!me) {
      return;
    }
    this.followService.follow(item.id, me.id).subscribe({
      next: () => {
        this.amFollowingOverrides.update((map) => new Map(map).set(item.id, true));
        // Keeps the shared currentUser in sync so other views reading it (e.g. the
        // Profile tab's "Seguint" count) reflect this without needing a full reload.
        this.authService.syncProfile({ ...me, followingId: [...(me.followingId ?? []), item.id] });
      },
    });
  }

  async confirmUnfollow(item: FollowUser, event: Event): Promise<void> {
    event.stopPropagation();
    const me = this.authService.currentUser();
    if (!me) {
      return;
    }
    const confirmed = await this.confirm(
      'userDetail.confirmUnfollowTitle',
      this.translate.instant('userDetail.confirmUnfollowMessage', { name: item.name }),
    );
    if (!confirmed) {
      return;
    }
    this.followService.unfollow(item.id, me.id).subscribe({
      next: () => {
        this.amFollowingOverrides.update((map) => new Map(map).set(item.id, false));
        this.authService.syncProfile({
          ...me,
          followingId: (me.followingId ?? []).filter((id) => id !== item.id),
        });
      },
    });
  }

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

  applyDisciplineFilter(): void {
    this.appliedDisciplineFilterIds.set(this.draftDisciplineFilterIds());
    this.isFilterModalOpen.set(false);
  }

  clearDisciplineFilter(): void {
    this.draftDisciplineFilterIds.set([]);
    this.appliedDisciplineFilterIds.set([]);
    this.isFilterModalOpen.set(false);
  }

  openUser(item: FollowUser): void {
    this.router.navigate(['/users', item.id]);
  }
}
