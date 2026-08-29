import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import { ChatHistoryAccess, EventManager, EventManagerRole } from '../../models';

@Injectable({ providedIn: 'root' })
export class EventManagerService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = `${environment.apiUrl}/api/events`;

  getParticipants(eventId: string): Observable<EventManager[]> {
    return this.http.get<EventManager[]>(`${this.baseUrl}/${eventId}/managers`);
  }

  inviteParticipant(
    eventId: string,
    userId: string,
    role: EventManagerRole,
    chatHistoryAccess: ChatHistoryAccess,
  ): Observable<{ success: boolean }> {
    return this.http.post<{ success: boolean }>(`${this.baseUrl}/${eventId}/managers`, { userId, role, chatHistoryAccess });
  }

  respondToInvite(eventId: string, accept: boolean): Observable<{ success: boolean }> {
    return this.http.patch<{ success: boolean }>(`${this.baseUrl}/${eventId}/managers/me`, { accept });
  }

  removeParticipant(eventId: string, userId: string): Observable<{ success: boolean }> {
    return this.http.delete<{ success: boolean }>(`${this.baseUrl}/${eventId}/managers/${userId}`);
  }

  /** Self-serve join request for an event.joinMode === 'approval' event -
   * distinct from AttendanceService.addAttendance, which only applies to
   * 'open' events. */
  requestToJoin(eventId: string): Observable<{ success: boolean }> {
    return this.http.post<{ success: boolean }>(`${this.baseUrl}/${eventId}/managers/join-request`, {});
  }

  /** Organizer-side approve/decline of someone else's join request. */
  respondToJoinRequest(eventId: string, requesterId: string, accept: boolean): Observable<{ success: boolean }> {
    return this.http.patch<{ success: boolean }>(`${this.baseUrl}/${eventId}/managers/${requesterId}/join-request`, { accept });
  }
}
