import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import { MyReview, OrganizerRating, Review } from '../../models';

@Injectable({ providedIn: 'root' })
export class ReviewService {
  private readonly http = inject(HttpClient);
  private readonly eventsUrl = `${environment.apiUrl}/api/events`;
  private readonly usersUrl = `${environment.apiUrl}/api/users`;

  getEventReviews(eventId: string): Observable<Review[]> {
    return this.http.get<Review[]>(`${this.eventsUrl}/${eventId}/reviews`);
  }

  getMyReview(eventId: string): Observable<MyReview | null> {
    return this.http.get<MyReview | null>(`${this.eventsUrl}/${eventId}/reviews/mine`);
  }

  /** Creates or updates the caller's own review for this event in one call -
   * the backend decides which based on whether one already exists. */
  createOrUpdateReview(eventId: string, rating: number, comment?: string): Observable<MyReview> {
    return this.http.put<MyReview>(`${this.eventsUrl}/${eventId}/reviews`, { rating, comment });
  }

  deleteReview(eventId: string, reviewId: string): Observable<{ success: boolean }> {
    return this.http.delete<{ success: boolean }>(`${this.eventsUrl}/${eventId}/reviews/${reviewId}`);
  }

  /** Return value deliberately untyped/unused by callers - the reply the
   * backend hands back isn't hydrated with repliedByName (see
   * ReviewController.replyToReview), so the host page always re-fetches
   * getEventReviews() afterward for the fully hydrated list rather than
   * trying to patch this response into it. */
  replyToReview(eventId: string, reviewId: string, text: string): Observable<unknown> {
    return this.http.put(`${this.eventsUrl}/${eventId}/reviews/${reviewId}/reply`, { text });
  }

  deleteOrganizerReply(eventId: string, reviewId: string): Observable<{ success: boolean }> {
    return this.http.delete<{ success: boolean }>(`${this.eventsUrl}/${eventId}/reviews/${reviewId}/reply`);
  }

  getOrganizerRating(userId: string): Observable<OrganizerRating> {
    return this.http.get<OrganizerRating>(`${this.usersUrl}/${userId}/organizer-rating`);
  }
}
