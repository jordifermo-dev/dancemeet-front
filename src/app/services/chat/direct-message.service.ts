import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import { ConversationDetailed, DirectMessage } from '../../models';

/** REST-only conversation lifecycle + history load - sending a message only
 * ever happens over the live socket connection (see
 * DirectMessageSocketService), same "no POST for messages" reasoning as
 * EventChatService/EventChatController. */
@Injectable({ providedIn: 'root' })
export class DirectMessageService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = `${environment.apiUrl}/api/conversations`;

  listConversations(): Observable<ConversationDetailed[]> {
    return this.http.get<ConversationDetailed[]>(this.baseUrl);
  }

  /** The single entry point for "start (or resume) a DM with this person" -
   * reuses the existing conversation if one already exists (see
   * ConversationService.getOrCreateConversation, backend). */
  startConversation(peerId: string): Observable<ConversationDetailed> {
    return this.http.post<ConversationDetailed>(this.baseUrl, { peerId });
  }

  getConversation(conversationId: string): Observable<ConversationDetailed> {
    return this.http.get<ConversationDetailed>(`${this.baseUrl}/${conversationId}`);
  }

  getMessages(conversationId: string, before?: number): Observable<DirectMessage[]> {
    return this.http.get<DirectMessage[]>(`${this.baseUrl}/${conversationId}/messages`, {
      params: before !== undefined ? { before: String(before) } : {},
    });
  }

  acceptConversation(conversationId: string): Observable<{ success: true }> {
    return this.http.patch<{ success: true }>(`${this.baseUrl}/${conversationId}/accept`, {});
  }

  declineConversation(conversationId: string): Observable<{ success: true }> {
    return this.http.delete<{ success: true }>(`${this.baseUrl}/${conversationId}`);
  }
}
