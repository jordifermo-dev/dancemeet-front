import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';
import { environment } from '../../../environments/environment';
import { Attendee, AttendedEvent } from '../../models';

@Injectable({ providedIn: 'root' })
export class AttendanceService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = `${environment.apiUrl}/api/attendance`;

  getAttendedEvents(userId: string): Observable<AttendedEvent[]> {
    return this.http.get<AttendedEvent[]>(`${this.baseUrl}/user/${userId}/events`);
  }

  countByEvent(eventId: string): Observable<number> {
    return this.http
      .get<{ count: number }>(`${this.baseUrl}/count/event/${eventId}`)
      .pipe(map((res) => res.count));
  }

  getEventAttendees(eventId: string): Observable<Attendee[]> {
    return this.http.get<Attendee[]>(`${this.baseUrl}/event/${eventId}/attendees`);
  }

  isAttending(userId: string, eventId: string): Observable<boolean> {
    return this.http
      .get<{ isAttending: boolean }>(`${this.baseUrl}/check/${userId}/${eventId}`)
      .pipe(map((res) => res.isAttending));
  }

  addAttendance(userId: string, eventId: string): Observable<void> {
    return this.http.post<void>(`${this.baseUrl}/${userId}/${eventId}/add`, {});
  }

  removeAttendance(userId: string, eventId: string): Observable<void> {
    return this.http.delete<void>(`${this.baseUrl}/${userId}/${eventId}/remove`);
  }

  /** Marks/unmarks attendance for every instance of a recurring series at
   * once - see event-detail.page.ts's own doc comments on why toggling one
   * instance of a series prompts "this day only or the whole series?"
   * instead of just toggling that one instance. */
  addSeriesAttendance(userId: string, seriesId: string): Observable<void> {
    return this.http.post<void>(`${this.baseUrl}/${userId}/series/${seriesId}/add`, {});
  }

  removeSeriesAttendance(userId: string, seriesId: string): Observable<void> {
    return this.http.delete<void>(`${this.baseUrl}/${userId}/series/${seriesId}/remove`);
  }
}
