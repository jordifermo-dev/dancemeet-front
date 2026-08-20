import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import { EventManager, EventManagerRole } from '../../models';

@Injectable({ providedIn: 'root' })
export class EventManagerService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = `${environment.apiUrl}/api/events`;

  getParticipants(eventId: string): Observable<EventManager[]> {
    return this.http.get<EventManager[]>(`${this.baseUrl}/${eventId}/managers`);
  }

  inviteParticipant(eventId: string, userId: string, role: EventManagerRole): Observable<{ success: boolean }> {
    return this.http.post<{ success: boolean }>(`${this.baseUrl}/${eventId}/managers`, { userId, role });
  }

  respondToInvite(eventId: string, accept: boolean): Observable<{ success: boolean }> {
    return this.http.patch<{ success: boolean }>(`${this.baseUrl}/${eventId}/managers/me`, { accept });
  }

  removeParticipant(eventId: string, userId: string): Observable<{ success: boolean }> {
    return this.http.delete<{ success: boolean }>(`${this.baseUrl}/${eventId}/managers/${userId}`);
  }
}
