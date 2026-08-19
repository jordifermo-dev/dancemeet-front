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
import { optionsOutline, chevronDownOutline, refreshOutline, checkmarkOutline, closeOutline, trashOutline } from 'ionicons/icons';
import { AuthService } from '../../../../services/core/auth.service';
import { FollowService } from '../../../../services/user/follow.service';
import { FavoriteService } from '../../../../services/favorites/favorite.service';
import { DisciplineService } from '../../../../services/event/discipline.service';
import { FollowSortMode, SortPreferenceService } from '../../../../services/filters/sort-preference.service';
import { Discipline, DISCIPLINE_NAMES, FollowUser } from '../../../../models';
import { sortByNameOrder } from '../../../../shared/event/icon-catalog';
import { createApplyFlash } from '../../../../shared/common/success-flash';
import { UserCardComponent } from '../../../../shared/user/user-card/user-card.component';
import { FilterSheetHeaderComponent } from '../../../../shared/filters/filter-sheet-header/filter-sheet-header.component';
import { FilterActionsRowComponent } from '../../../../shared/filters/filter-actions-row/filter-actions-row.component';
import { ChipGridComponent, ChipGridItem } from '../../../../shared/filters/chip-grid/chip-grid.component';

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
  ],
})
export class FollowListPage implements ViewWillEnter {
  private readonly route = inject(ActivatedRoute);
  private readonly authService = inject(AuthService);
  private readonly followService = inject(FollowService);
  private readonly favoriteService = inject(FavoriteService);
  private readonly disciplineService = inject(DisciplineService);
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

  readonly filteredItems = computed(() => {
    const term = this.searchTerm().trim().toLowerCase();
    let list = term ? this.items().filter((item) => item.name.toLowerCase().includes(term)) : [...this.items()];

    // Same "any of the selected disciplines" convention as Explorer/Favorites -
    // every discipline selected (the default, matching what's shown before any
    // filter is touched) or none selected are both treated as no constraint,
    // rather than only the emptied-out state.
    const filterIds = this.appliedDisciplineFilterIds();
    if (filterIds.length > 0 && filterIds.length < this.disciplines().length) {
      list = list.filter((item) => item.disciplineIds.some((id) => filterIds.includes(id)));
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
    addIcons({ optionsOutline, chevronDownOutline, refreshOutline, checkmarkOutline, closeOutline, trashOutline });

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
}
