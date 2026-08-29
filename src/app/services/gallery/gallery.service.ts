import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import { GalleryCover, GalleryPhoto, GalleryPhotoWithEvent, GalleryPhotoWithPoster, MessageReactionSummary } from '../../models';

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

  /** The event's private, attendees-only gallery - see AttendanceService for
   * who counts as a real attendee. */
  getPrivateEventGallery(eventId: string): Observable<GalleryPhotoWithPoster[]> {
    return this.http.get<GalleryPhotoWithPoster[]>(`${this.eventsUrl}/${eventId}/private-gallery`);
  }

  postPrivateEventPhoto(eventId: string, photoUrl: string): Observable<GalleryPhoto> {
    return this.http.post<GalleryPhoto>(`${this.eventsUrl}/${eventId}/private-gallery`, { photoUrl });
  }

  /** New-photo badge for a gallery tab - mirrors EventChatService's own
   * getUnreadCount/markChatRead REST pair. */
  getUnreadCount(eventId: string, scope: 'public' | 'private'): Observable<{ count: number }> {
    const base = scope === 'public' ? `${this.eventsUrl}/${eventId}/gallery` : `${this.eventsUrl}/${eventId}/private-gallery`;
    return this.http.get<{ count: number }>(`${base}/unread-count`);
  }

  markGalleryRead(eventId: string, scope: 'public' | 'private'): Observable<{ success: boolean }> {
    const base = scope === 'public' ? `${this.eventsUrl}/${eventId}/gallery` : `${this.eventsUrl}/${eventId}/private-gallery`;
    return this.http.post<{ success: boolean }>(`${base}/read`, {});
  }

  /** Makes a private photo also show in the public gallery - additive, the
   * photo stays in the private gallery too (see moveToPrivateGallery for the
   * reverse, a full move rather than a copy). */
  sharePhotoToPublicGallery(eventId: string, photoId: string): Observable<{ success: boolean }> {
    return this.http.patch<{ success: boolean }>(`${this.eventsUrl}/${eventId}/gallery/${photoId}/share-public`, {});
  }

  /** Moves a public photo (shared by mistake) to the private gallery only -
   * it disappears from the public gallery and from the poster's own profile
   * gallery. */
  movePhotoToPrivateGallery(eventId: string, photoId: string): Observable<{ success: boolean }> {
    return this.http.patch<{ success: boolean }>(`${this.eventsUrl}/${eventId}/gallery/${photoId}/move-private`, {});
  }

  /** Looks up one photo by id, wherever it currently lives (public/private/
   * both) - used to navigate to a xat photo mention's real current gallery. */
  getPhoto(eventId: string, photoId: string): Observable<GalleryPhotoWithPoster> {
    return this.http.get<GalleryPhotoWithPoster>(`${this.eventsUrl}/${eventId}/gallery/${photoId}`);
  }

  reactToPhoto(eventId: string, photoId: string, emoji: string): Observable<MessageReactionSummary[]> {
    return this.http.patch<MessageReactionSummary[]>(`${this.eventsUrl}/${eventId}/gallery/${photoId}/react`, { emoji });
  }

  removeReactionFromPhoto(eventId: string, photoId: string, emoji: string): Observable<MessageReactionSummary[]> {
    return this.http.patch<MessageReactionSummary[]>(`${this.eventsUrl}/${eventId}/gallery/${photoId}/unreact`, { emoji });
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
