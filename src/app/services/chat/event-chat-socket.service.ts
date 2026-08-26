import { Injectable, inject, signal } from '@angular/core';
import { Socket, io } from 'socket.io-client';
import { environment } from '../../../environments/environment';
import { AuthService } from '../core/auth.service';
import { EventMessage, MessageReactionSummary, TypingUser } from '../../models';

/** How long a "user-typing" we've received stays shown before we assume it
 * went stale (e.g. their app was killed mid-typing and no 'user-stopped-
 * typing' ever arrived) - see markTyping's own per-user timer. */
const TYPING_EXPIRY_MS = 5000;
/** How often our own 'typing' event is re-sent while the user keeps typing -
 * no point emitting on every keystroke. */
const TYPING_RESEND_MS = 2000;
/** How long after the last keystroke we assume the user stopped, if they
 * never explicitly cleared the input. */
const STOP_TYPING_IDLE_MS = 3000;

/** Thin wrapper around one socket.io-client connection to the backend's
 * `/event-chat` namespace - owns the live message list for whichever event
 * is currently open (see joinEvent/setInitialHistory) and the "who's
 * typing" state. A singleton (providedIn: 'root') is fine since only one
 * event's xat is ever open at a time (the event-detail page). */
@Injectable({ providedIn: 'root' })
export class EventChatSocketService {
  private readonly authService = inject(AuthService);
  private socket: Socket | null = null;
  private currentEventId: string | null = null;

  /** Single source of truth for the message list - both 'new-message'
   * (append) and 'message-reaction-updated' (patch) write here, so the
   * chat UI only ever needs to read this one signal. */
  readonly messages = signal<EventMessage[]>([]);
  readonly typingUsers = signal<TypingUser[]>([]);
  /** Set only by the 'new-message' socket event (never by setInitialHistory,
   * which would otherwise look identical to N brand-new messages arriving
   * at once) - event-detail.page.ts watches this alone to bump its unread
   * badge while the xat tab isn't the active view, so a history load never
   * gets miscounted as unread activity. */
  readonly lastReceivedMessage = signal<EventMessage | null>(null);

  private readonly typingTimeouts = new Map<string, ReturnType<typeof setTimeout>>();
  private lastTypingSentAt = 0;
  private stopTypingTimer: ReturnType<typeof setTimeout> | null = null;

  /** Resolves the current Firebase ID token itself (same one auth.interceptor.ts
   * attaches to every HTTP request) - a socket handshake has no interceptor
   * pipeline to go through, so this is done once up front instead. */
  async connect(): Promise<void> {
    if (this.socket?.connected) {
      return;
    }
    const token = await this.authService.getIdToken();
    this.socket = io(`${environment.apiUrl}/event-chat`, {
      auth: { token },
      transports: ['websocket'],
    });

    this.socket.on('connect', () => {
      // Covers both the first connection and any automatic reconnect -
      // socket.io doesn't remember room membership across a dropped
      // connection, so this is the one place that needs to re-request it.
      if (this.currentEventId) {
        this.socket?.emit('join-event', { eventId: this.currentEventId });
      }
    });

    this.socket.on('new-message', (message: EventMessage) => {
      this.messages.update((list) => (list.some((m) => m.id === message.id) ? list : [...list, message]));
      this.lastReceivedMessage.set(message);
    });

    this.socket.on('message-reaction-updated', (payload: { messageId: string; reactions: MessageReactionSummary[] }) => {
      this.messages.update((list) =>
        list.map((message) => (message.id === payload.messageId ? { ...message, reactions: payload.reactions } : message)),
      );
    });

    // Covers both an edit and a (soft) delete - a deleted message is just a
    // message whose `deleted` flag flipped, same event either way.
    this.socket.on('message-updated', (message: EventMessage) => {
      this.messages.update((list) => list.map((m) => (m.id === message.id ? message : m)));
    });

    this.socket.on('user-typing', (payload: TypingUser) => this.markTyping(payload));
    this.socket.on('user-stopped-typing', (payload: { userId: string }) => this.clearTyping(payload.userId));
  }

  /** Switches the room being tracked - clears the previous event's messages
   * (if any) so a stale list never leaks into a different event's chat. */
  joinEvent(eventId: string): void {
    this.currentEventId = eventId;
    this.messages.set([]);
    this.typingUsers.set([]);
    this.lastReceivedMessage.set(null);
    if (this.socket?.connected) {
      this.socket.emit('join-event', { eventId });
    }
  }

  /** Seeds the message list with the REST-loaded history - called after
   * joinEvent, once EventChatService.getMessages resolves. Any live message
   * that arrived in the gap (socket connects first, see event-detail.page.ts)
   * is already in the list and gets merged in by id, not overwritten. */
  setInitialHistory(history: EventMessage[]): void {
    this.messages.update((live) => {
      const liveIds = new Set(live.map((message) => message.id));
      const merged = [...history.filter((message) => !liveIds.has(message.id)), ...live];
      return merged.sort((a, b) => a.createdAt - b.createdAt);
    });
  }

  sendMessage(text: string, options?: { replyToMessageId?: string; attachedPhotoId?: string }): void {
    const trimmed = text.trim();
    if (!this.currentEventId || (!trimmed && !options?.attachedPhotoId)) {
      return;
    }
    this.socket?.emit('send-message', {
      eventId: this.currentEventId,
      text: trimmed,
      replyToMessageId: options?.replyToMessageId,
      attachedPhotoId: options?.attachedPhotoId,
    });
  }

  editMessage(messageId: string, text: string): void {
    const trimmed = text.trim();
    if (!this.currentEventId || !trimmed) {
      return;
    }
    this.socket?.emit('edit-message', { eventId: this.currentEventId, messageId, text: trimmed });
  }

  deleteMessage(messageId: string): void {
    if (!this.currentEventId) {
      return;
    }
    this.socket?.emit('delete-message', { eventId: this.currentEventId, messageId });
  }

  markChatRead(): void {
    if (!this.currentEventId) {
      return;
    }
    this.socket?.emit('mark-chat-read', { eventId: this.currentEventId });
  }

  reactToMessage(messageId: string, emoji: string): void {
    if (!this.currentEventId) {
      return;
    }
    this.socket?.emit('react-message', { eventId: this.currentEventId, messageId, emoji });
  }

  removeReaction(messageId: string, emoji: string): void {
    if (!this.currentEventId) {
      return;
    }
    this.socket?.emit('unreact-message', { eventId: this.currentEventId, messageId, emoji });
  }

  /** Called on every keystroke in the message input - throttles the actual
   * 'typing' emit (TYPING_RESEND_MS) and always resets the idle timer that
   * auto-sends 'stop-typing' if the user just... stops, without clearing
   * the field themselves. */
  sendTyping(): void {
    if (!this.currentEventId) {
      return;
    }
    const now = Date.now();
    if (now - this.lastTypingSentAt > TYPING_RESEND_MS) {
      this.socket?.emit('typing', { eventId: this.currentEventId });
      this.lastTypingSentAt = now;
    }
    if (this.stopTypingTimer) {
      clearTimeout(this.stopTypingTimer);
    }
    this.stopTypingTimer = setTimeout(() => this.sendStopTyping(), STOP_TYPING_IDLE_MS);
  }

  sendStopTyping(): void {
    if (this.stopTypingTimer) {
      clearTimeout(this.stopTypingTimer);
      this.stopTypingTimer = null;
    }
    if (!this.currentEventId || this.lastTypingSentAt === 0) {
      return;
    }
    this.socket?.emit('stop-typing', { eventId: this.currentEventId });
    this.lastTypingSentAt = 0;
  }

  disconnect(): void {
    this.socket?.disconnect();
    this.socket = null;
    this.currentEventId = null;
    this.messages.set([]);
    this.typingUsers.set([]);
    this.lastReceivedMessage.set(null);
    for (const timeout of this.typingTimeouts.values()) {
      clearTimeout(timeout);
    }
    this.typingTimeouts.clear();
    if (this.stopTypingTimer) {
      clearTimeout(this.stopTypingTimer);
      this.stopTypingTimer = null;
    }
  }

  private markTyping(user: TypingUser): void {
    const existing = this.typingTimeouts.get(user.userId);
    if (existing) {
      clearTimeout(existing);
    }
    this.typingTimeouts.set(
      user.userId,
      setTimeout(() => this.clearTyping(user.userId), TYPING_EXPIRY_MS),
    );
    this.typingUsers.update((list) => (list.some((u) => u.userId === user.userId) ? list : [...list, user]));
  }

  private clearTyping(userId: string): void {
    const timeout = this.typingTimeouts.get(userId);
    if (timeout) {
      clearTimeout(timeout);
      this.typingTimeouts.delete(userId);
    }
    this.typingUsers.update((list) => list.filter((u) => u.userId !== userId));
  }
}
