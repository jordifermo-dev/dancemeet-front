import { Injectable } from '@angular/core';
import { Camera, CameraResultType, CameraSource } from '@capacitor/camera';

/** Thin wrapper around @capacitor/camera - on native iOS/Android this opens
 * the real camera or photo library; on web (no native platform added yet)
 * Capacitor's own web implementation falls back to a getUserMedia view or a
 * plain file input, respectively. */
@Injectable({ providedIn: 'root' })
export class PhotoPickerService {
  async takePhoto(): Promise<string | null> {
    return this.getPhoto(CameraSource.Camera);
  }

  async pickFromGallery(): Promise<string | null> {
    return this.getPhoto(CameraSource.Photos);
  }

  private async getPhoto(source: CameraSource): Promise<string | null> {
    try {
      const photo = await Camera.getPhoto({
        source,
        resultType: CameraResultType.DataUrl,
        quality: 90,
        allowEditing: false,
      });
      return photo.dataUrl ?? null;
    } catch {
      // User cancelled the camera/gallery picker - not an error.
      return null;
    }
  }
}
