import { Injectable, inject, signal } from '@angular/core';
import { Socket, io } from 'socket.io-client';
import { environment } from '../../../environments/environment';
import { AuthService } from '../core/auth.service';
import { DirectMessage, MessageReactionSummary } from '../../models';

/** Thin wrapper around one socket.io-client connection to the backend's
 * `/direct-message` namespace - direct mirror of EventChatSocketService,
 * just scoped to a conversationId instead of an eventId (see
 * 15_tab-chats-implementacion.md's own doc comment on why the 1:1 xat is a
 * sibling of event-chat rather than a generalization of it). A singleton is
 * fine since only one conversation is ever open at a time (the direct-
 * message page). */
@Injectable({ providedIn: 'root' })
export class DirectMessageSocketService {
  private readonly authService = inject(AuthService);
  private socket: Socket | null = null;
  private currentConversationId: string | null = null;

  readonly messages = signal<DirectMessage[]>([]);
  readonly typingPeer = signal(false);
  readonly lastReceivedMessage = signal<DirectMessage | null>(null);

  private typingTimeout: ReturnType<typeof setTimeout> | null = null;
  private lastTypingSentAt = 0;
  private stopTypingTimer: ReturnType<typeof setTimeout> | null = null;

  async connect(): Promise<void> {
    if (this.socket?.connected) {
      return;
    }
    const token = await this.authService.getIdToken();
    this.socket = io(`${environment.apiUrl}/direct-message`, {
      auth: { token },
      transports: ['websocket'],
    });

    this.socket.on('connect', () => {
      if (this.currentConversationId) {
        this.socket?.emit('join-conversation', { conversationId: this.currentConversationId });
      }
    });

    this.socket.on('new-message', (message: DirectMessage) => {
      this.messages.update((list) => (list.some((m) => m.id === message.id) ? list : [...list, message]));
      this.lastReceivedMessage.set(message);
    });

    this.socket.on('message-reaction-updated', (payload: { messageId: string; reactions: MessageReactionSummary[] }) => {
      this.messages.update((list) =>
        list.map((message) => (message.id === payload.messageId ? { ...message, reactions: payload.reactions } : message)),
      );
    });

    this.socket.on('message-updated', (message: DirectMessage) => {
      this.messages.update((list) => list.map((m) => (m.id === message.id ? message : m)));
    });

    this.socket.on('user-typing', () => this.markTyping());
    this.socket.on('user-stopped-typing', () => this.clearTyping());
  }

  joinConversation(conversationId: string): void {
    this.currentConversationId = conversationId;
    this.messages.set([]);
    this.typingPeer.set(false);
    this.lastReceivedMessage.set(null);
    if (this.socket?.connected) {
      this.socket.emit('join-conversation', { conversationId });
    }
  }

  setInitialHistory(history: DirectMessage[]): void {
    this.messages.update((live) => {
      const liveIds = new Set(live.map((message) => message.id));
      const merged = [...history.filter((message) => !liveIds.has(message.id)), ...live];
      return merged.sort((a, b) => a.createdAt - b.createdAt);
    });
  }

  sendMessage(text: string, replyToMessageId?: string): void {
    const trimmed = text.trim();
    if (!this.currentConversationId || !trimmed) {
      return;
    }
    this.socket?.emit('send-message', { conversationId: this.currentConversationId, text: trimmed, replyToMessageId });
  }

  editMessage(messageId: string, text: string): void {
    const trimmed = text.trim();
    if (!this.currentConversationId || !trimmed) {
      return;
    }
    this.socket?.emit('edit-message', { conversationId: this.currentConversationId, messageId, text: trimmed });
  }

  deleteMessage(messageId: string): void {
    if (!this.currentConversationId) {
      return;
    }
    this.socket?.emit('delete-message', { conversationId: this.currentConversationId, messageId });
  }

  markRead(): void {
    if (!this.currentConversationId) {
      return;
    }
    this.socket?.emit('mark-read', { conversationId: this.currentConversationId });
  }

  reactToMessage(messageId: string, emoji: string): void {
    if (!this.currentConversationId) {
      return;
    }
    this.socket?.emit('react-message', { conversationId: this.currentConversationId, messageId, emoji });
  }

  removeReaction(messageId: string, emoji: string): void {
    if (!this.currentConversationId) {
      return;
    }
    this.socket?.emit('unreact-message', { conversationId: this.currentConversationId, messageId, emoji });
  }

  sendTyping(): void {
    if (!this.currentConversationId) {
      return;
    }
    const now = Date.now();
    if (now - this.lastTypingSentAt > 2000) {
      this.socket?.emit('typing', { conversationId: this.currentConversationId });
      this.lastTypingSentAt = now;
    }
    if (this.stopTypingTimer) {
      clearTimeout(this.stopTypingTimer);
    }
    this.stopTypingTimer = setTimeout(() => this.sendStopTyping(), 3000);
  }

  sendStopTyping(): void {
    if (this.stopTypingTimer) {
      clearTimeout(this.stopTypingTimer);
      this.stopTypingTimer = null;
    }
    if (!this.currentConversationId || this.lastTypingSentAt === 0) {
      return;
    }
    this.socket?.emit('stop-typing', { conversationId: this.currentConversationId });
    this.lastTypingSentAt = 0;
  }

  disconnect(): void {
    this.socket?.disconnect();
    this.socket = null;
    this.currentConversationId = null;
    this.messages.set([]);
    this.typingPeer.set(false);
    this.lastReceivedMessage.set(null);
    if (this.typingTimeout) {
      clearTimeout(this.typingTimeout);
      this.typingTimeout = null;
    }
    if (this.stopTypingTimer) {
      clearTimeout(this.stopTypingTimer);
      this.stopTypingTimer = null;
    }
  }

  private markTyping(): void {
    if (this.typingTimeout) {
      clearTimeout(this.typingTimeout);
    }
    this.typingTimeout = setTimeout(() => this.clearTyping(), 5000);
    this.typingPeer.set(true);
  }

  private clearTyping(): void {
    if (this.typingTimeout) {
      clearTimeout(this.typingTimeout);
      this.typingTimeout = null;
    }
    this.typingPeer.set(false);
  }
}
