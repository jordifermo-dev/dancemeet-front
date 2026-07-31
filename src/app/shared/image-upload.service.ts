import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';

export type UploadKind = 'profile' | 'event';

/** Uploads a cropped photo (as a base64 data URL) to the backend, which
 * stores it in Supabase Storage (see UploadService on the backend) and hands
 * back the resulting public URL to store as photoUrl/imageUrl. */
@Injectable({ providedIn: 'root' })
export class ImageUploadService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = `${environment.apiUrl}/api/uploads`;

  upload(kind: UploadKind, name: string, dataUrl: string): Observable<{ url: string }> {
    return this.http.post<{ url: string }>(this.baseUrl, { type: kind, name, dataUrl });
  }
}
