import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import { EventMessage } from '../../models';

/** REST-only history load/pagination - sending a message only ever happens
 * over the live socket connection (see EventChatSocketService), there's no
 * POST here to mirror (same reasoning as the backend's EventChatController,
 * which only exposes GET). */
@Injectable({ providedIn: 'root' })
export class EventChatService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = `${environment.apiUrl}/api/events`;

  getMessages(eventId: string, before?: number): Observable<EventMessage[]> {
    return this.http.get<EventMessage[]>(`${this.baseUrl}/${eventId}/messages`, {
      params: before !== undefined ? { before: String(before) } : {},
    });
  }

  getUnreadCount(eventId: string): Observable<{ count: number }> {
    return this.http.get<{ count: number }>(`${this.baseUrl}/${eventId}/messages/unread-count`);
  }
}
