import { Component, EventEmitter, Input, Output, inject, signal } from '@angular/core';
import { IonButton, IonIcon, IonModal, IonSpinner } from '@ionic/angular/standalone';
import { TranslatePipe } from '@ngx-translate/core';
import { addIcons } from 'ionicons';
import { cameraOutline, imagesOutline } from 'ionicons/icons';
import { PhotoPickerService } from '../photo-picker.service';
import { ImageUploadService, UploadKind } from '../image-upload.service';
import { CropAspect, ImageCropperComponent } from '../image-cropper/image-cropper.component';

/** "Change photo" flow shared by the profile avatar and the event image:
 * tap the badge -> choose Cámara/Galería -> crop to fit (square avatar or
 * wide event banner) -> upload -> emits the resulting URL for the caller to
 * store as photoUrl/imageUrl. Fully self-contained; the caller just needs to
 * position it (see .photo-editor-badge usage in profile/event-detail). */
@Component({
  selector: 'app-photo-editor',
  standalone: true,
  templateUrl: './photo-editor.component.html',
  styleUrl: './photo-editor.component.scss',
  imports: [IonButton, IonIcon, IonModal, IonSpinner, TranslatePipe, ImageCropperComponent],
})
export class PhotoEditorComponent {
  @Input({ required: true }) kind!: UploadKind;
  @Input() aspect: CropAspect = 'square';
  @Input({ required: true }) nameForFile!: string;
  @Output() readonly uploaded = new EventEmitter<string>();

  private readonly photoPicker = inject(PhotoPickerService);
  private readonly imageUploadService = inject(ImageUploadService);

  readonly isChooserOpen = signal(false);
  readonly pendingImage = signal<string | null>(null);
  readonly uploading = signal(false);

  constructor() {
    addIcons({ cameraOutline, imagesOutline });
  }

  openChooser(): void {
    this.isChooserOpen.set(true);
  }

  async chooseCamera(): Promise<void> {
    this.isChooserOpen.set(false);
    const photo = await this.photoPicker.takePhoto();
    if (photo) {
      this.pendingImage.set(photo);
    }
  }

  async chooseGallery(): Promise<void> {
    this.isChooserOpen.set(false);
    const photo = await this.photoPicker.pickFromGallery();
    if (photo) {
      this.pendingImage.set(photo);
    }
  }

  onCropped(dataUrl: string): void {
    this.pendingImage.set(null);
    this.uploading.set(true);
    this.imageUploadService.upload(this.kind, this.nameForFile, dataUrl).subscribe({
      next: (result) => {
        this.uploading.set(false);
        this.uploaded.emit(result.url);
      },
      error: () => this.uploading.set(false),
    });
  }

  onCropCancelled(): void {
    this.pendingImage.set(null);
  }
}
