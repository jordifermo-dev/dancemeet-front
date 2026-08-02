import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';
import { environment } from '../../environments/environment';
import { Attendee, FavoritedEvent } from '../models';

@Injectable({ providedIn: 'root' })
export class FavoriteService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = `${environment.apiUrl}/api/favorites`;

  getFavoritedEvents(userId: string): Observable<FavoritedEvent[]> {
    return this.http.get<FavoritedEvent[]>(`${this.baseUrl}/user/${userId}/events`);
  }

  countByEvent(eventId: string): Observable<number> {
    return this.http
      .get<{ count: number }>(`${this.baseUrl}/count/event/${eventId}`)
      .pipe(map((res) => res.count));
  }

  getEventAttendees(eventId: string): Observable<Attendee[]> {
    return this.http.get<Attendee[]>(`${this.baseUrl}/event/${eventId}/attendees`);
  }

  /** "Attending" an event (event-detail's "Asistir" button) is just favoriting
   * it from the attendee's side - same underlying Favorite record already
   * used by the Favorites tab and the "Eventos" stat on Profile. */
  isFavorited(userId: string, eventId: string): Observable<boolean> {
    return this.http
      .get<{ isFavorited: boolean }>(`${this.baseUrl}/check/${userId}/${eventId}`)
      .pipe(map((res) => res.isFavorited));
  }

  addToFavorites(userId: string, eventId: string): Observable<void> {
    return this.http.post<void>(`${this.baseUrl}/${userId}/${eventId}/add`, {});
  }

  removeFromFavorites(userId: string, eventId: string): Observable<void> {
    return this.http.delete<void>(`${this.baseUrl}/${userId}/${eventId}/remove`);
  }
}
