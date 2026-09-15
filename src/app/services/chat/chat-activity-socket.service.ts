import { Injectable, inject } from '@angular/core';
import { Socket, io } from 'socket.io-client';
import { environment } from '../../../environments/environment';
import { AuthService } from '../core/auth.service';
import { EventListRefreshService } from '../event/event-list-refresh.service';

/** Two lightweight ambient connections, one per chat namespace, whose only
 * job is hearing "a message arrived somewhere relevant to me" while the user
 * isn't inside that specific chat screen. EventChatSocketService and
 * DirectMessageSocketService only connect (and join a room) while their own
 * chat screen is open - by design, see their own doc comments - so neither
 * one can tell the Chats tab list to refresh for a message arriving
 * elsewhere. This connects once for the whole logged-in session (see
 * app.component.ts) instead, and both backend gateways join every socket to
 * a `user:<id>` room on connect specifically so this can reach them without
 * first join-event'ing/join-conversation'ing anything. */
@Injectable({ providedIn: 'root' })
export class ChatActivitySocketService {
  private readonly authService = inject(AuthService);
  private readonly refreshNotifier = inject(EventListRefreshService);
  private eventChatSocket: Socket | null = null;
  private directMessageSocket: Socket | null = null;

  async connect(): Promise<void> {
    if (this.eventChatSocket?.connected && this.directMessageSocket?.connected) {
      return;
    }
    const token = await this.authService.getIdToken();
    this.eventChatSocket = io(`${environment.apiUrl}/event-chat`, {
      auth: { token },
      transports: ['websocket'],
    });
    this.directMessageSocket = io(`${environment.apiUrl}/direct-message`, {
      auth: { token },
      transports: ['websocket'],
    });
    // No payload read - this is purely a "go refetch" signal, same one
    // EventListRefreshService already exposes to every list page.
    this.eventChatSocket.on('chat-activity', () => this.refreshNotifier.notifyChanged());
    this.directMessageSocket.on('chat-activity', () => this.refreshNotifier.notifyChanged());
  }

  disconnect(): void {
    this.eventChatSocket?.disconnect();
    this.eventChatSocket = null;
    this.directMessageSocket?.disconnect();
    this.directMessageSocket = null;
  }
}
