import { Location } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import {
  IonHeader,
  IonToolbar,
  IonTitle,
  IonButtons,
  IonBackButton,
  IonContent,
  IonIcon,
  IonButton,
  IonSpinner,
  IonModal,
} from '@ionic/angular/standalone';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { addIcons } from 'ionicons';
import {
  personOutline,
  personAddOutline,
  downloadOutline,
  checkmarkOutline,
  trashOutline,
  personRemoveOutline,
  informationCircleOutline,
  gridOutline,
} from 'ionicons/icons';
import { AuthService } from '../../../../services/core/auth.service';
import { UserService } from '../../../../services/user/user.service';
import { FollowService } from '../../../../services/user/follow.service';
import { FavoriteService } from '../../../../services/favorites/favorite.service';
import { DisciplineService } from '../../../../services/event/discipline.service';
import { EventTypeService } from '../../../../services/event/event-type.service';
import { GalleryService } from '../../../../services/gallery/gallery.service';
import { Discipline, EventType, EVENT_STATUSES, GalleryPhotoWithEvent, SocialLinks, User } from '../../../../models';
import { SocialIconKey, socialIconUrl, STATUS_LABEL_KEYS } from '../../../../shared/event/icon-catalog';
import { ALL_SOCIAL_NETWORKS, SOCIAL_NETWORK_LABEL_KEYS, SocialNetworkKey } from '../../../../shared/user/social-networks';
import { MapType } from '../../../../shared/location/maps';
import { LocationPickerComponent } from '../../../../shared/location/location-picker/location-picker.component';
import { buildVCard, downloadVCard } from '../../../../shared/user/vcard';
import { createSuccessFlash } from '../../../../shared/common/success-flash';
import { FilterActionsRowComponent } from '../../../../shared/filters/filter-actions-row/filter-actions-row.component';
import { FilterSheetHeaderComponent } from '../../../../shared/filters/filter-sheet-header/filter-sheet-header.component';
import { ChipGridComponent } from '../../../../shared/filters/chip-grid/chip-grid.component';
import { disciplineChipItems, eventTypeChipItems, statusChipItems } from '../../../../shared/filters/chip-grid/chip-grid-presets';
import { PhotoGridComponent } from '../../../../shared/gallery/photo-grid/photo-grid.component';
import { LightboxPhoto, PhotoLightboxComponent } from '../../../../shared/gallery/photo-lightbox/photo-lightbox.component';

const MIN_ZOOM = 3;
const MAX_ZOOM = 20;

const STATUS_OPTIONS = EVENT_STATUSES.map((id) => ({ id, labelKey: STATUS_LABEL_KEYS[id] }));

interface SocialLinkRow {
  key: keyof SocialLinks;
  url: string;
}

@Component({
  selector: 'app-user-detail',
  standalone: true,
  templateUrl: 'user-detail.page.html',
  styleUrls: ['user-detail.page.scss'],
  imports: [
    IonHeader,
    IonToolbar,
    IonTitle,
    IonButtons,
    IonBackButton,
    IonContent,
    IonIcon,
    IonButton,
    IonSpinner,
    IonModal,
    TranslatePipe,
    FilterActionsRowComponent,
    FilterSheetHeaderComponent,
    ChipGridComponent,
    LocationPickerComponent,
    PhotoGridComponent,
    PhotoLightboxComponent,
  ],
})
export class UserDetailPage {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly location = inject(Location);
  private readonly authService = inject(AuthService);
  private readonly userService = inject(UserService);
  private readonly followService = inject(FollowService);
  private readonly favoriteService = inject(FavoriteService);
  private readonly disciplineService = inject(DisciplineService);
  private readonly eventTypeService = inject(EventTypeService);
  private readonly galleryService = inject(GalleryService);
  private readonly translate = inject(TranslateService);

  private readonly disciplinesById = signal<Map<string, Discipline>>(new Map());
  private readonly eventTypesById = signal<Map<string, EventType>>(new Map());

  readonly loading = signal(true);
  readonly notFound = signal(false);
  readonly user = signal<User | null>(null);
  readonly attendedEventsCount = signal(0);

  // --- Instagram-style info/gallery toggle -----------------------------

  readonly detailViewMode = signal<'info' | 'gallery'>('info');
  readonly userGallery = signal<GalleryPhotoWithEvent[]>([]);

  readonly galleryGridItems = computed(() => this.userGallery().map((photo) => ({ id: photo.id, photoUrl: photo.photoUrl })));

  readonly lightboxItems = computed<LightboxPhoto[]>(() =>
    this.userGallery().map((photo) => ({
      id: photo.id,
      photoUrl: photo.photoUrl,
      // Absent for a photo posted straight to the profile - no event to link to.
      relatedLinkRoute: photo.eventId ? ['/events', photo.eventId] : undefined,
      relatedLinkLabel: photo.eventTitle,
    })),
  );

  readonly lightboxOpen = signal(false);
  readonly lightboxStartIndex = signal(0);

  openLightbox(photoId: string): void {
    const index = this.userGallery().findIndex((photo) => photo.id === photoId);
    if (index === -1) {
      return;
    }
    this.lightboxStartIndex.set(index);
    this.lightboxOpen.set(true);
  }

  readonly followersCount = computed(() => this.user()?.followedId?.length ?? 0);
  readonly followingCount = computed(() => this.user()?.followingId?.length ?? 0);

  /** Viewing your own profile via /users/:id (e.g. tapping yourself in an
   * attendee/follower list) - follow/unfollow/remove-follower/save-contact
   * don't make sense against yourself, so the whole actions block is hidden. */
  readonly isMe = computed(() => {
    const user = this.user();
    const me = this.authService.currentUser();
    return !!user && !!me && user.id === me.id;
  });

  // Overrides the server-derived relationship right after following this
  // person from this page, so the button updates immediately instead of
  // waiting for `currentUser()` to be resynced from the backend.
  private readonly amFollowingOverride = signal<boolean | null>(null);
  /** Guards follow/unfollow/remove-follower requests in flight - a doubled tap
   * otherwise fires the handler twice before the first request's response
   * updates amFollowingOverride, sending a duplicate call the backend rejects
   * with an "already follows"/"not following" business error. */
  readonly followActionBusy = signal(false);
  readonly followFlash = createSuccessFlash();
  readonly directionsFlash = createSuccessFlash();
  readonly contactFlash = createSuccessFlash();
  readonly removeFollowerFlash = createSuccessFlash();

  /** True only if I actually follow this person right now (not just "which list I browsed here from"). */
  readonly amFollowing = computed(() => {
    const override = this.amFollowingOverride();
    if (override !== null) {
      return override;
    }
    const user = this.user();
    const me = this.authService.currentUser();
    return !!user && !!me && (me.followingId ?? []).includes(user.id);
  });

  /** True only if this person actually follows me right now. */
  readonly isMyFollower = computed(() => {
    const user = this.user();
    const me = this.authService.currentUser();
    return !!user && !!me && (me.followedId ?? []).includes(user.id);
  });

  readonly socialLinks = computed<SocialLinkRow[]>(() => {
    const links = this.user()?.socialLinks;
    if (!links) {
      return [];
    }
    return ALL_SOCIAL_NETWORKS.filter((key) => !!links[key]).map((key) => ({ key, url: links[key]! }));
  });

  readonly selectedDisciplines = computed(() => {
    const byId = this.disciplinesById();
    return (this.user()?.disciplineIds ?? []).map((id) => byId.get(id)).filter((d): d is Discipline => !!d);
  });

  readonly selectedEventTypes = computed(() => {
    const byId = this.eventTypesById();
    return (this.user()?.eventTypeIds ?? []).map((id) => byId.get(id)).filter((e): e is EventType => !!e);
  });

  readonly selectedStatuses = computed(() => {
    const ids = this.user()?.statusIds ?? [];
    return STATUS_OPTIONS.filter((option) => ids.includes(option.id));
  });

  // Read-only display: every chip shown here already IS one of the user's
  // selections, so all of them render in the highlighted "selected" style
  // (self-referential ids list) rather than the plain unselected one.
  readonly eventTypeChips = computed(() => {
    const eventTypes = this.selectedEventTypes();
    return eventTypeChipItems(eventTypes, eventTypes.map((e) => e.id));
  });
  readonly disciplineChips = computed(() => {
    const disciplines = this.selectedDisciplines();
    return disciplineChipItems(disciplines, disciplines.map((d) => d.id));
  });
  readonly statusChips = computed(() => {
    const statuses = this.selectedStatuses();
    return statusChipItems(statuses, statuses.map((s) => s.id));
  });

  readonly hasContactInfo = computed(() => {
    const user = this.user();
    return !!user && (user.showEmail || (user.showPhone && !!user.phone));
  });

  /** Only offered when a phone number is actually visible - a name with no
   * way to reach them isn't a useful contact card. */
  readonly canSaveContact = computed(() => {
    const user = this.user();
    return !!user && user.showPhone && !!user.phone;
  });

  readonly showLocation = computed(() => {
    const user = this.user();
    return !!user && (user.showCity || user.showLocation);
  });

  readonly zoomLevel = signal(15);
  readonly mapType = signal<MapType>('roadmap');
  readonly userAddressLine = computed(() => {
    const user = this.user();
    return user ? `${user.address}, ${user.city}` : null;
  });

  readonly socialIconUrl = socialIconUrl;

  socialNetworkLabelKey(key: SocialNetworkKey): string {
    return SOCIAL_NETWORK_LABEL_KEYS[key];
  }

  readonly showConfirmModal = signal(false);
  readonly confirmTitleKey = signal('');
  readonly confirmMessage = signal('');
  private pendingConfirmResolve: ((confirmed: boolean) => void) | null = null;
  private pendingConfirmValue = false;

  constructor() {
    addIcons({
      personOutline,
      personAddOutline,
      downloadOutline,
      checkmarkOutline,
      trashOutline,
      personRemoveOutline,
      informationCircleOutline,
      gridOutline,
    });

    this.disciplineService.getAll().subscribe({
      next: (list) => this.disciplinesById.set(new Map(list.map((d) => [d.id, d]))),
    });
    this.eventTypeService.getAll().subscribe({
      next: (list) => this.eventTypesById.set(new Map(list.map((e) => [e.id, e]))),
    });

    const userId = this.route.snapshot.paramMap.get('id');
    if (!userId) {
      this.loading.set(false);
      this.notFound.set(true);
      return;
    }

    this.userService.getById(userId).subscribe({
      next: (user) => {
        this.user.set(user);
        this.notFound.set(!user);
        this.loading.set(false);
        if (user) {
          // Organizer + attendee, matching what goToEvents()/user-events shows for this person.
          this.favoriteService.getFavoritedEvents(user.id).subscribe({
            next: (events) => this.attendedEventsCount.set(events.length),
          });
          this.galleryService.getUserGallery(user.id).subscribe({
            next: (photos) => this.userGallery.set(photos),
          });
        }
      },
      error: () => {
        this.notFound.set(true);
        this.loading.set(false);
      },
    });
  }

  goToEvents(): void {
    const user = this.user();
    if (!user) {
      return;
    }
    this.router.navigate(['/user-events'], { queryParams: { userId: user.id } });
  }

  goToFollowers(): void {
    const user = this.user();
    if (!user) {
      return;
    }
    this.router.navigate(['/followers'], { queryParams: { userId: user.id } });
  }

  goToFollowing(): void {
    const user = this.user();
    if (!user) {
      return;
    }
    this.router.navigate(['/following'], { queryParams: { userId: user.id } });
  }

  zoomIn(): void {
    this.zoomLevel.update((zoom) => Math.min(MAX_ZOOM, zoom + 1));
  }

  zoomOut(): void {
    this.zoomLevel.update((zoom) => Math.max(MIN_ZOOM, zoom - 1));
  }

  toggleMapType(): void {
    this.mapType.update((type) => (type === 'roadmap' ? 'satellite' : 'roadmap'));
  }

  openDirections(): void {
    const user = this.user();
    if (!user) {
      return;
    }
    this.directionsFlash.trigger();
    window.open(`https://www.google.com/maps/dir/?api=1&destination=${user.latitude},${user.longitude}`, '_blank');
  }

  async saveContact(): Promise<void> {
    const user = this.user();
    if (!user || !user.showPhone || !user.phone) {
      return;
    }
    this.contactFlash.trigger();
    const email = user.showEmail ? user.email : undefined;
    const vcard = buildVCard(user.name, user.phone, email);
    await downloadVCard(vcard);
  }

  follow(): void {
    const user = this.user();
    const me = this.authService.currentUser();
    if (!user || !me || this.followActionBusy()) {
      return;
    }
    this.followActionBusy.set(true);
    this.followService.follow(user.id, me.id).subscribe({
      next: () => {
        // Keeps the shared currentUser in sync so other views reading it (e.g. the
        // Profile tab's "Seguint" count) reflect this without needing a full reload.
        this.authService.syncProfile({ ...me, followingId: [...(me.followingId ?? []), user.id] });
        this.followFlash.trigger();
        // Flash "Guardado ✓" for a beat before the button settles into its
        // real, permanent "Siguiendo" state - same reasoning as Event
        // Detail's toggleAttend().
        setTimeout(() => {
          this.amFollowingOverride.set(true);
          this.followActionBusy.set(false);
        }, 900);
      },
      error: () => this.followActionBusy.set(false),
    });
  }

  async confirmUnfollow(): Promise<void> {
    const user = this.user();
    const me = this.authService.currentUser();
    if (!user || !me || this.followActionBusy()) {
      return;
    }
    const confirmed = await this.confirm(
      'userDetail.confirmUnfollowTitle',
      this.translate.instant('userDetail.confirmUnfollowMessage', { name: user.name }),
    );
    if (!confirmed) {
      return;
    }
    this.followActionBusy.set(true);
    this.followService.unfollow(user.id, me.id).subscribe({
      next: () => {
        this.authService.syncProfile({
          ...me,
          followingId: (me.followingId ?? []).filter((id) => id !== user.id),
        });
        this.location.back();
      },
      complete: () => this.followActionBusy.set(false),
      error: () => this.followActionBusy.set(false),
    });
  }

  async confirmRemoveFollower(): Promise<void> {
    const user = this.user();
    const me = this.authService.currentUser();
    if (!user || !me || this.followActionBusy()) {
      return;
    }
    const confirmed = await this.confirm(
      'userDetail.confirmRemoveFollowerTitle',
      this.translate.instant('userDetail.confirmRemoveFollowerMessage', { name: user.name }),
    );
    if (!confirmed) {
      return;
    }
    this.followActionBusy.set(true);
    this.followService.unfollow(me.id, user.id).subscribe({
      next: () => {
        this.authService.syncProfile({
          ...me,
          followedId: (me.followedId ?? []).filter((id) => id !== user.id),
        });
        this.removeFollowerFlash.trigger();
        // Same "flash the confirmation, then act" beat as follow()/
        // toggleAttend() - navigating away immediately would cut off the
        // "Guardado ✓" confirmation before it could ever be seen.
        setTimeout(() => this.location.back(), 900);
      },
      error: () => this.followActionBusy.set(false),
    });
  }

  private async confirm(titleKey: string, message: string): Promise<boolean> {
    this.confirmTitleKey.set(titleKey);
    this.confirmMessage.set(message);
    this.pendingConfirmValue = false;
    this.showConfirmModal.set(true);
    // Waits for (didDismiss), not the button click itself - the sheet must be fully
    // closed before the caller acts (unfollow + location.back()), otherwise this page
    // gets popped off the stack mid-animation and the overlay is left stuck on screen,
    // swallowing every tap in the app from then on.
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
}
