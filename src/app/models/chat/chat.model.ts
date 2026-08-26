/** One emoji's reaction summary on a message, from the logged-in user's own
 * point of view - grouped/counted by the backend, never sent as a flat list. */
export interface MessageReactionSummary {
  emoji: string;
  count: number;
  reactedByMe: boolean;
}

export interface EventMessage {
  id: string;
  eventId: string;
  senderId: string;
  senderName: string;
  senderPhotoUrl?: string;
  text: string;
  reactions: MessageReactionSummary[];
  createdAt: number;
}

/** Someone currently typing in an event's xat - tracked with its own
 * per-user expiry timer by EventChatSocketService, see its own doc comment. */
export interface TypingUser {
  userId: string;
  userName: string;
}
