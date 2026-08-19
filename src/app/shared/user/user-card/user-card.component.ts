import { Component, HostBinding, Input, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { IonIcon } from '@ionic/angular/standalone';
import { TranslatePipe } from '@ngx-translate/core';
import { addIcons } from 'ionicons';
import { personOutline, personAddOutline, checkmarkOutline, personRemoveOutline } from 'ionicons/icons';
import { AuthService } from '../../../services/core/auth.service';
import { FollowService } from '../../../services/user/follow.service';
import { Discipline, FollowUser } from '../../../models';
import { createSuccessFlash } from '../../common/success-flash';

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

  @HostBinding('class.row-variant') get isRowVariant(): boolean {
    return this.variant === 'row';
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
    addIcons({ personOutline, personAddOutline, checkmarkOutline, personRemoveOutline });
  }

  open(): void {
    this.router.navigate(['/users', this.user.id]);
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
