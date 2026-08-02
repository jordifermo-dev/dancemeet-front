import { Component, Input, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { IonIcon } from '@ionic/angular/standalone';
import { TranslatePipe } from '@ngx-translate/core';
import { addIcons } from 'ionicons';
import { personOutline, personAddOutline } from 'ionicons/icons';
import { AuthService } from '../../services/auth.service';
import { FollowService } from '../../services/follow.service';
import { Discipline, FollowUser } from '../../models';

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

  private readonly followOverride = signal<boolean | undefined>(undefined);
  /** Guards against a doubled tap firing this twice before the first request's
   * response lands - the second call would hit the backend's "already
   * follows"/"not following" business-rule error. */
  readonly followBusy = signal(false);

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
    addIcons({ personOutline, personAddOutline });
  }

  open(): void {
    this.router.navigate(['/users', this.user.id]);
  }

  toggleFollow(event: Event): void {
    event.stopPropagation();
    const me = this.authService.currentUser();
    if (!me || this.followBusy()) {
      return;
    }
    this.followBusy.set(true);
    if (this.isFollowedByMe()) {
      this.followService.unfollow(this.user.id, me.id).subscribe({
        next: () => {
          this.followOverride.set(false);
          this.authService.syncProfile({
            ...me,
            followingId: (me.followingId ?? []).filter((id) => id !== this.user.id),
          });
        },
        complete: () => this.followBusy.set(false),
        error: () => this.followBusy.set(false),
      });
    } else {
      this.followService.follow(this.user.id, me.id).subscribe({
        next: () => {
          this.followOverride.set(true);
          this.authService.syncProfile({ ...me, followingId: [...(me.followingId ?? []), this.user.id] });
        },
        complete: () => this.followBusy.set(false),
        error: () => this.followBusy.set(false),
      });
    }
  }
}
