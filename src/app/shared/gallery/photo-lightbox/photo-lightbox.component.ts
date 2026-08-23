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
  signal,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { IonModal, IonIcon } from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import { closeOutline, chevronBackOutline, chevronForwardOutline } from 'ionicons/icons';

export interface LightboxPhoto {
  id: string;
  photoUrl: string;
  /** Where tapping the caption link jumps to - an event's page from a
   * user's gallery, or a user's profile from an event's gallery. Owned
   * per-photo (not one route for the whole lightbox) since a user's own
   * gallery mixes photos from many different events, and vice versa. Both
   * absent for a photo posted straight to a profile, with no event to link
   * to - the caption is simply omitted for that photo. */
  relatedLinkRoute?: string[];
  relatedLinkLabel?: string;
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
  imports: [IonModal, IonIcon, RouterLink],
})
export class PhotoLightboxComponent implements OnChanges, AfterViewInit {
  @Input({ required: true }) photos!: LightboxPhoto[];
  @Input({ required: true }) startIndex!: number;
  @Input() isOpen = false;
  @Output() readonly closed = new EventEmitter<void>();

  @ViewChild('track') private trackRef?: ElementRef<HTMLElement>;

  readonly currentIndex = signal(0);
  readonly currentPhoto = computed(() => this.photos[this.currentIndex()]);

  constructor() {
    addIcons({ closeOutline, chevronBackOutline, chevronForwardOutline });
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

  onDidDismiss(): void {
    this.closed.emit();
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
