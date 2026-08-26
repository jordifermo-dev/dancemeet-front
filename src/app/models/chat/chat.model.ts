/** One emoji's reaction summary on a message, from the logged-in user's own
 * point of view - grouped/counted by the backend, never sent as a flat list. */
export interface MessageReactionSummary {
  emoji: string;
  count: number;
  reactedByMe: boolean;
}

/** A small denormalized quote of another message, resolved server-side at
 * read time - not the full EventMessage shape (a reply preview never needs
 * the quoted message's own reactions/attachment). */
export interface EventMessageQuote {
  id: string;
  senderName: string;
  text: string;
  deleted: boolean;
}

/** A "mention" of an existing gallery photo, not an upload - photoUrl is a
 * send-time snapshot so the thumbnail keeps rendering even if the photo is
 * later moved/deleted (see EventChatService.resolvePhotoLocation usage in
 * event-detail.page.ts for how tapping it navigates to its current gallery). */
export interface EventMessageAttachedPhoto {
  galleryPhotoId: string;
  photoUrl: string;
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
  editedAt?: number;
  /** Soft-deleted - text is already blanked by the backend, this just gates
   * the UI (no reactions/actions offered, "Mensaje eliminado" shown instead). */
  deleted: boolean;
  replyTo?: EventMessageQuote | null;
  attachedPhoto?: EventMessageAttachedPhoto | null;
}

/** Someone currently typing in an event's xat - tracked with its own
 * per-user expiry timer by EventChatSocketService, see its own doc comment. */
export interface TypingUser {
  userId: string;
  userName: string;
}
