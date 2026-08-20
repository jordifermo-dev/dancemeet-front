import { Component, HostBinding, Input, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { IonIcon } from '@ionic/angular/standalone';
import { TranslatePipe } from '@ngx-translate/core';
import { addIcons } from 'ionicons';
import {
  personOutline,
  personAddOutline,
  checkmarkOutline,
  personRemoveOutline,
  trashOutline,
  timeOutline,
} from 'ionicons/icons';
import { AuthService } from '../../../services/core/auth.service';
import { FollowService } from '../../../services/user/follow.service';
import { Discipline, FollowUser } from '../../../models';
import { createSuccessFlash } from '../../common/success-flash';

export interface UserCardAction {
  labelKey: string;
  icon: string;
  busy: boolean;
  onClick: (user: FollowUser) => void;
}

/** Self-contained follower/following row - avatar, name, disciplines and a
 * follow/unfollow button that manages itself. Used by the notifications
 * inbox for "new follower" rows; the same shape as follow-list.page's own
 * row, just packaged so other screens can drop it in without re-wiring the
 * follow logic each time. */
@Component({
  selector: 'app-user-card',
  standalone: true,
  templateUrl: './user-card.component.html',
  styleUrl: './user-card.component.scss',
  imports: [IonIcon, TranslatePipe],
})
export class UserCardComponent {
  private readonly router = inject(Router);
  private readonly authService = inject(AuthService);
  private readonly followService = inject(FollowService);

  @Input({ required: true }) user!: FollowUser;
  @Input() disciplinesById: Map<string, Discipline> = new Map();
  /** Optional gate before actually unfollowing - e.g. Follow-list's own
   * "¿Seguro que quieres dejar de seguir?" modal. Resolving false aborts the
   * unfollow. Omit to unfollow immediately (Notifications' "new follower"
   * rows, where a second confirmation would be redundant with the tap itself). */
  @Input() confirmUnfollow?: (user: FollowUser) => Promise<boolean>;
  /** Follow-list shows an explicit "sin disciplinas" message when a row has
   * none; Notifications' compact "new follower" row just omits the block
   * entirely, so this stays opt-in instead of changing that row too. */
  @Input() showEmptyDisciplines = false;
  /** 'card' (default): its own background/border/radius, for feeds like
   * Notifications where each row is a distinct item. 'row': flat, with a
   * bottom divider instead - for a single unified list like Follow-list,
   * where the surrounding container already supplies the card look. */
  @Input() variant: 'card' | 'row' = 'card';
  /** Tints the row (a subtle primary-color wash, theme-aware) - marks a "not
   * yet related" person surfaced by a whole-app search, distinct from
   * everyone already in the list, without needing a separate section. */
  @Input() highlighted = false;
  /** Optional small chip next to the name - e.g. "Organizador" on
   * follow-list's 'attendees' mode for rows that are also an accepted event
   * manager. Purely presentational when onBadgeClick is omitted. */
  @Input() badgeLabel?: string;
  /** Optional icon shown before badgeLabel - e.g. a clock for a still-pending
   * invite row, distinguishing it from an accepted "Organizador" badge
   * without needing different wording. */
  @Input() badgeIcon?: string;
  /** When given, these replace the built-in follow/unfollow button instead
   * of sitting alongside it - e.g. follow-list's 'attendees' mode shows
   * "Invitar asistente"/"Invitar organizador" here for someone who isn't a
   * participant of the event yet, where a follow button would be a
   * secondary concern crowding out the actual reason the row is showing. */
  @Input() extraActions?: UserCardAction[];
  /** Unlike extraActions above, this sits *alongside* the follow/unfollow
   * button rather than replacing it - e.g. an organizer removing someone
   * from the event's attendee list from follow-list's 'attendees' mode,
   * where the person's follow relationship to the viewer (if any) is a
   * separate concern that must stay visible and unaffected. */
  @Input() removeAction?: UserCardAction;

  @HostBinding('class.row-variant') get isRowVariant(): boolean {
    return this.variant === 'row';
  }

  @HostBinding('class.highlighted-variant') get isHighlighted(): boolean {
    return this.highlighted;
  }

  private readonly followOverride = signal<boolean | undefined>(undefined);
  /** Guards against a doubled tap firing this twice before the first request's
   * response lands - the second call would hit the backend's "already
   * follows"/"not following" business-rule error. */
  readonly followBusy = signal(false);
  readonly followFlash = createSuccessFlash();

  readonly disciplines = computed(() =>
    (this.user.disciplineIds ?? [])
      .map((id) => this.disciplinesById.get(id))
      .filter((d): d is Discipline => !!d),
  );

  readonly isMe = computed(() => this.authService.currentUser()?.id === this.user.id);

  readonly isFollowedByMe = computed(() => {
    const override = this.followOverride();
    if (override !== undefined) {
      return override;
    }
    const me = this.authService.currentUser();
    return !!me && (me.followingId ?? []).includes(this.user.id);
  });

  constructor() {
    addIcons({ personOutline, personAddOutline, checkmarkOutline, personRemoveOutline, trashOutline, timeOutline });
  }

  open(): void {
    this.router.navigate(['/users', this.user.id]);
  }

  onExtraActionTap(event: Event, action: UserCardAction): void {
    event.stopPropagation();
    if (!action.busy) {
      action.onClick(this.user);
    }
  }

  async toggleFollow(event: Event): Promise<void> {
    event.stopPropagation();
    const me = this.authService.currentUser();
    if (!me || this.followBusy()) {
      return;
    }
    if (this.isFollowedByMe() && this.confirmUnfollow) {
      const confirmed = await this.confirmUnfollow(this.user);
      if (!confirmed) {
        return;
      }
    }
    this.followBusy.set(true);
    if (this.isFollowedByMe()) {
      this.followService.unfollow(this.user.id, me.id).subscribe({
        next: () => {
          this.authService.syncProfile({
            ...me,
            followingId: (me.followingId ?? []).filter((id) => id !== this.user.id),
          });
          this.followFlash.trigger();
          // Same "flash the confirmation, then settle into the real state"
          // beat as Event Detail/User Detail's own follow/attend buttons.
          setTimeout(() => {
            this.followOverride.set(false);
            this.followBusy.set(false);
          }, 900);
        },
        error: () => this.followBusy.set(false),
      });
    } else {
      this.followService.follow(this.user.id, me.id).subscribe({
        next: () => {
          this.authService.syncProfile({ ...me, followingId: [...(me.followingId ?? []), this.user.id] });
          this.followFlash.trigger();
          setTimeout(() => {
            this.followOverride.set(true);
            this.followBusy.set(false);
          }, 900);
        },
        error: () => this.followBusy.set(false),
      });
    }
  }
}
