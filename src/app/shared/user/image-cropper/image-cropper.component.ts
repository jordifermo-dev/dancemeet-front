import {
  Component,
  ElementRef,
  EventEmitter,
  Input,
  OnDestroy,
  OnInit,
  Output,
  ViewChild,
  inject,
  signal,
} from '@angular/core';
import { IonButton, IonIcon, IonRange } from '@ionic/angular/standalone';
import { TranslatePipe } from '@ngx-translate/core';
import { addIcons } from 'ionicons';
import { closeOutline, checkmarkOutline } from 'ionicons/icons';

/** 'gallery' is deliberately not just another entry in VIEWPORT_SIZES below -
 * unlike the avatar (circular) and event cover (fixed small card), a gallery
 * photo should feel like the main event on screen, sized off the actual
 * viewport instead of a small fixed box - see galleryViewportSize(). */
export type CropAspect = 'square' | 'portrait' | 'gallery';

interface Size {
  width: number;
  height: number;
}

const VIEWPORT_SIZES: Record<'square' | 'portrait', Size> = {
  square: { width: 280, height: 280 },
  portrait: { width: 240, height: 320 },
};

const OUTPUT_SIZES: Record<CropAspect, Size> = {
  square: { width: 480, height: 480 },
  portrait: { width: 720, height: 960 },
  gallery: { width: 960, height: 1200 },
};

/** A tall "post" ratio (4:5, same as Instagram's own portrait posts) rather
 * than square/circular - and sized off the real screen instead of a small
 * fixed box, so the photo (not the surrounding chrome) dominates the crop
 * screen. */
function galleryViewportSize(): Size {
  const width = Math.round(Math.min(window.innerWidth * 0.88, 420));
  const height = Math.round(width * 1.25);
  return { width, height };
}

/** Pan-and-zoom crop UI: drag the image to reposition it, use the slider to
 * zoom, then confirm to render the visible viewport onto an output canvas at
 * a fixed size - used for both the profile avatar (square) and the event
 * image (portrait), so photos always fit their target space exactly instead
 * of getting squashed/cropped unpredictably by object-fit alone. */
@Component({
  selector: 'app-image-cropper',
  standalone: true,
  templateUrl: './image-cropper.component.html',
  styleUrl: './image-cropper.component.scss',
  imports: [IonButton, IonIcon, IonRange, TranslatePipe],
})
export class ImageCropperComponent implements OnInit, OnDestroy {
  @Input({ required: true }) imageDataUrl!: string;
  @Input() aspect: CropAspect = 'square';
  @Output() readonly cropped = new EventEmitter<string>();
  @Output() readonly cancelled = new EventEmitter<void>();

  private readonly hostRef = inject(ElementRef<HTMLElement>);
  @ViewChild('sourceImage') private imageRef?: ElementRef<HTMLImageElement>;

  readonly imageLoaded = signal(false);
  readonly scale = signal(1);
  readonly minScale = signal(1);
  readonly maxScale = signal(3);
  readonly offsetX = signal(0);
  readonly offsetY = signal(0);

  private naturalWidth = 0;
  private naturalHeight = 0;
  private dragStart: { pointerX: number; pointerY: number; offsetX: number; offsetY: number } | null = null;

  constructor() {
    addIcons({ closeOutline, checkmarkOutline });
  }

  /** Ionic pages set `contain: layout size style` on their `.ion-page` root,
   * which makes `position: fixed` descendants relative to that page box
   * instead of the real viewport - this overlay ended up covering only the
   * ion-content area, leaving it to render behind the page's own header.
   * Moving the host to <body> escapes that entirely. */
  ngOnInit(): void {
    document.body.appendChild(this.hostRef.nativeElement);
  }

  ngOnDestroy(): void {
    this.hostRef.nativeElement.remove();
  }

  get viewportSize(): Size {
    return this.aspect === 'gallery' ? galleryViewportSize() : VIEWPORT_SIZES[this.aspect];
  }

  get imageTransform(): string {
    return `translate(${this.offsetX()}px, ${this.offsetY()}px) scale(${this.scale()})`;
  }

  onImageLoad(event: Event): void {
    const img = event.target as HTMLImageElement;
    this.naturalWidth = img.naturalWidth;
    this.naturalHeight = img.naturalHeight;
    const { width: vw, height: vh } = this.viewportSize;
    // The minimum scale that still lets the image fully cover the viewport
    // (no empty corners) - also the starting zoom level.
    const coverScale = Math.max(vw / this.naturalWidth, vh / this.naturalHeight);
    this.minScale.set(coverScale);
    this.maxScale.set(coverScale * 3);
    this.scale.set(coverScale);
    this.offsetX.set(0);
    this.offsetY.set(0);
    this.imageLoaded.set(true);
  }

  onZoomChange(event: Event): void {
    const value = (event as CustomEvent<{ value: number }>).detail.value;
    this.scale.set(value);
    this.clampOffsets();
  }

  onPointerDown(event: PointerEvent): void {
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
    this.dragStart = { pointerX: event.clientX, pointerY: event.clientY, offsetX: this.offsetX(), offsetY: this.offsetY() };
  }

  onPointerMove(event: PointerEvent): void {
    if (!this.dragStart) {
      return;
    }
    this.offsetX.set(this.dragStart.offsetX + (event.clientX - this.dragStart.pointerX));
    this.offsetY.set(this.dragStart.offsetY + (event.clientY - this.dragStart.pointerY));
    this.clampOffsets();
  }

  onPointerUp(): void {
    this.dragStart = null;
  }

  /** Keeps the rendered image covering the viewport at all times - the pan
   * range shrinks as you zoom out toward minScale, down to 0 (centered, no
   * pan) exactly at minScale. */
  private clampOffsets(): void {
    const { width: vw, height: vh } = this.viewportSize;
    const scale = this.scale();
    const renderedW = this.naturalWidth * scale;
    const renderedH = this.naturalHeight * scale;
    const maxOffsetX = Math.max(0, (renderedW - vw) / 2);
    const maxOffsetY = Math.max(0, (renderedH - vh) / 2);
    this.offsetX.set(Math.min(maxOffsetX, Math.max(-maxOffsetX, this.offsetX())));
    this.offsetY.set(Math.min(maxOffsetY, Math.max(-maxOffsetY, this.offsetY())));
  }

  confirm(): void {
    const imageEl = this.imageRef?.nativeElement;
    if (!imageEl) {
      return;
    }
    const { width: vw, height: vh } = this.viewportSize;
    const { width: outW, height: outH } = OUTPUT_SIZES[this.aspect];
    const scale = this.scale();
    const renderedW = this.naturalWidth * scale;
    const renderedH = this.naturalHeight * scale;
    const renderedLeft = (vw - renderedW) / 2 + this.offsetX();
    const renderedTop = (vh - renderedH) / 2 + this.offsetY();

    // Maps the visible viewport rectangle back to the source image's own
    // pixel coordinates, so only what's actually shown gets rendered out.
    const sx = -renderedLeft / scale;
    const sy = -renderedTop / scale;
    const sw = vw / scale;
    const sh = vh / scale;

    const canvas = document.createElement('canvas');
    canvas.width = outW;
    canvas.height = outH;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      return;
    }
    ctx.drawImage(imageEl, sx, sy, sw, sh, 0, 0, outW, outH);
    this.cropped.emit(canvas.toDataURL('image/jpeg', 0.9));
  }

  cancel(): void {
    this.cancelled.emit();
  }
}
