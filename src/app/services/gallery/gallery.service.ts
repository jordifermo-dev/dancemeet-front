import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import { GalleryCover, GalleryPhoto, GalleryPhotoWithEvent, GalleryPhotoWithPoster } from '../../models';

@Injectable({ providedIn: 'root' })
export class GalleryService {
  private readonly http = inject(HttpClient);
  private readonly eventsUrl = `${environment.apiUrl}/api/events`;
  private readonly usersUrl = `${environment.apiUrl}/api/users`;
  private readonly galleryUrl = `${environment.apiUrl}/api/gallery`;

  getEventGallery(eventId: string): Observable<GalleryPhotoWithPoster[]> {
    return this.http.get<GalleryPhotoWithPoster[]>(`${this.eventsUrl}/${eventId}/gallery`);
  }

  postEventPhoto(eventId: string, photoUrl: string): Observable<GalleryPhoto> {
    return this.http.post<GalleryPhoto>(`${this.eventsUrl}/${eventId}/gallery`, { photoUrl });
  }

  deletePhoto(eventId: string, photoId: string): Observable<{ success: boolean }> {
    return this.http.delete<{ success: boolean }>(`${this.eventsUrl}/${eventId}/gallery/${photoId}`);
  }

  getUserGallery(userId: string): Observable<GalleryPhotoWithEvent[]> {
    return this.http.get<GalleryPhotoWithEvent[]>(`${this.usersUrl}/${userId}/gallery`);
  }

  /** Posts a photo straight to a profile, with no event involved. */
  postProfilePhoto(userId: string, photoUrl: string): Observable<GalleryPhoto> {
    return this.http.post<GalleryPhoto>(`${this.usersUrl}/${userId}/gallery`, { photoUrl });
  }

  deleteProfilePhoto(userId: string, photoId: string): Observable<{ success: boolean }> {
    return this.http.delete<{ success: boolean }>(`${this.usersUrl}/${userId}/gallery/${photoId}`);
  }

  /** Batched cover photo per event - only called while the "browse events
   * by photo" mode is active (see event-list-filters.ts), so the default
   * event-list responses stay unbloated. */
  getCoverPhotos(eventIds: string[]): Observable<Record<string, GalleryCover>> {
    return this.http.get<Record<string, GalleryCover>>(`${this.galleryUrl}/covers`, {
      params: { eventIds: eventIds.join(',') },
    });
  }
}
