import {
  AfterViewInit,
  Component,
  ElementRef,
  EventEmitter,
  Input,
  OnChanges,
  Output,
  SimpleChanges,
  ViewChild,
  computed,
  inject,
  signal,
} from '@angular/core';
import { Router } from '@angular/router';
import { IonModal, IonIcon } from '@ionic/angular/standalone';
import { TranslatePipe } from '@ngx-translate/core';
import { addIcons } from 'ionicons';
import { closeOutline, chevronBackOutline, chevronForwardOutline, happyOutline } from 'ionicons/icons';
import { LanguageService } from '../../../services/core/language.service';
import { formatDateTimeNumeric } from '../../calendar/event-date-format';
import { MessageReactionSummary } from '../../../models';

/** Same fixed 6-emoji quick-reaction set as the xat's own
 * QUICK_REACTIONS (event-detail.page.ts) - kept as its own local constant
 * rather than imported, since this component doesn't otherwise depend on
 * anything xat-specific. */
const QUICK_REACTIONS = ['👍', '❤️', '😂', '😮', '😢', '🙏'];

export interface LightboxPhoto {
  id: string;
  photoUrl: string;
  createdAt: number;
  /** Where tapping the caption jumps to - an event's page from a user's
   * gallery, or a user's profile from an event's gallery. Owned per-photo
   * (not one route for the whole lightbox) since a user's own gallery mixes
   * photos from many different events, and vice versa. Both absent for a
   * photo posted straight to a profile, with no event to link to - the
   * caption is simply omitted for that photo. */
  relatedLinkRoute?: string[];
  relatedLinkLabel?: string;
  /** Extra per-photo actions (e.g. "Compartir en galería pública") - see
   * event-detail.page.ts's own lightboxItems computed for how these are
   * built per photo based on ownership/permissions. Empty/absent renders no
   * action row at all, same as today. */
  actions?: LightboxAction[];
  /** Absent (not just empty) for a lightbox usage that doesn't support
   * reactions at all (e.g. a user's own profile gallery) - only renders the
   * reaction bar when actually given. */
  reactions?: MessageReactionSummary[];
}

export interface LightboxAction {
  labelKey: string;
  icon: string;
  onClick: () => void;
}

/** Full-screen photo viewer with horizontal swipe/scroll between photos and
 * a caption link to whatever this photo is "about" (its event, or its
 * poster) - pure/presentational, reused by both user-detail's and
 * event-detail's galleries with different relatedLinkRoute targets built
 * by the host page. */
@Component({
  selector: 'app-photo-lightbox',
  standalone: true,
  templateUrl: './photo-lightbox.component.html',
  styleUrl: './photo-lightbox.component.scss',
  imports: [IonModal, IonIcon, TranslatePipe],
})
export class PhotoLightboxComponent implements OnChanges, AfterViewInit {
  @Input({ required: true }) photos!: LightboxPhoto[];
  @Input({ required: true }) startIndex!: number;
  @Input() isOpen = false;
  @Output() readonly closed = new EventEmitter<void>();
  @Output() readonly reactPhoto = new EventEmitter<{ photoId: string; emoji: string }>();
  @Output() readonly unreactPhoto = new EventEmitter<{ photoId: string; emoji: string }>();

  private readonly router = inject(Router);
  private readonly languageService = inject(LanguageService);

  @ViewChild('track') private trackRef?: ElementRef<HTMLElement>;

  readonly currentIndex = signal(0);
  readonly currentPhoto = computed(() => this.photos[this.currentIndex()]);
  readonly currentPhotoDateLabel = computed(() => {
    const photo = this.currentPhoto();
    return photo ? formatDateTimeNumeric(photo.createdAt, this.languageService.currentLang()) : '';
  });

  readonly quickReactions = QUICK_REACTIONS;
  readonly reactionPickerOpen = signal(false);

  toggleReactionPicker(): void {
    this.reactionPickerOpen.update((open) => !open);
  }

  /** Same toggle-on-repeat convention as the xat's own pickReaction - picking
   * the emoji you already reacted with removes it instead of no-oping. */
  pickReaction(emoji: string): void {
    const photo = this.currentPhoto();
    if (!photo) {
      return;
    }
    const already = photo.reactions?.some((r) => r.emoji === emoji && r.reactedByMe);
    if (already) {
      this.unreactPhoto.emit({ photoId: photo.id, emoji });
    } else {
      this.reactPhoto.emit({ photoId: photo.id, emoji });
    }
    this.reactionPickerOpen.set(false);
  }

  toggleReactionChip(reaction: MessageReactionSummary): void {
    const photo = this.currentPhoto();
    if (!photo) {
      return;
    }
    if (reaction.reactedByMe) {
      this.unreactPhoto.emit({ photoId: photo.id, emoji: reaction.emoji });
    } else {
      this.reactPhoto.emit({ photoId: photo.id, emoji: reaction.emoji });
    }
  }

  /** Set by onCaptionTap, consumed by onDidDismiss - see its own doc comment
   * for why the navigation is deferred there instead of firing immediately. */
  private pendingNavigationRoute: string[] | null = null;

  constructor() {
    addIcons({ closeOutline, chevronBackOutline, chevronForwardOutline, happyOutline });
  }

  /** Only records where to go and starts the normal close - see
   * onDidDismiss for why navigation itself waits until then. */
  onCaptionTap(): void {
    const route = this.currentPhoto()?.relatedLinkRoute;
    if (!route) {
      return;
    }
    this.pendingNavigationRoute = route;
    this.close();
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['isOpen']?.currentValue) {
      this.currentIndex.set(this.startIndex);
      // Wait for the modal's own open animation/render before scrolling -
      // the track isn't laid out yet on the same tick isOpen flips true.
      setTimeout(() => this.scrollToIndex(this.startIndex, 'auto'), 50);
    }
  }

  ngAfterViewInit(): void {
    if (this.isOpen) {
      this.scrollToIndex(this.startIndex, 'auto');
    }
  }

  onScroll(): void {
    const track = this.trackRef?.nativeElement;
    if (!track || !track.clientWidth) {
      return;
    }
    const index = Math.round(track.scrollLeft / track.clientWidth);
    if (index !== this.currentIndex() && index >= 0 && index < this.photos.length) {
      this.currentIndex.set(index);
      // A picker open for the photo just scrolled away from would otherwise
      // keep floating over whichever photo is now showing.
      this.reactionPickerOpen.set(false);
    }
  }

  goPrev(): void {
    this.scrollToIndex(this.currentIndex() - 1, 'smooth');
  }

  goNext(): void {
    this.scrollToIndex(this.currentIndex() + 1, 'smooth');
  }

  close(): void {
    this.closed.emit();
  }

  /** Fires once ion-modal's own dismiss animation genuinely finishes -
   * whether triggered by close() (X button or the caption link below),
   * the swipe-down gesture, or a backdrop tap. A caption tap used to call
   * router.navigate() immediately alongside close() - that raced with this
   * same page's own component tree starting to tear down mid-navigation
   * (this lightbox is declared inside the page being navigated away from,
   * so navigating destroys it too), leaving ion-modal's overlay stuck on
   * screen with its own close button unresponsive until a manual swipe-down
   * dismissed it "for real". Waiting for the real dismissal first removes
   * that race entirely. */
  onDidDismiss(): void {
    this.closed.emit();
    const route = this.pendingNavigationRoute;
    if (route) {
      this.pendingNavigationRoute = null;
      void this.router.navigate(route);
    }
  }

  private scrollToIndex(index: number, behavior: ScrollBehavior): void {
    const track = this.trackRef?.nativeElement;
    if (!track || index < 0 || index >= this.photos.length) {
      return;
    }
    track.scrollTo({ left: index * track.clientWidth, behavior });
    this.currentIndex.set(index);
  }
}
