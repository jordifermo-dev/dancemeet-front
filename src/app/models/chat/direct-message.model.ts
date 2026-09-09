import { MessageReactionSummary } from './chat.model';

export type ConversationStatus = 'accepted' | 'pending';

/** A message in a 1:1 xat - same shape as EventMessage minus the gallery-
 * photo-mention fields (a DM has no gallery to mention anything from, see
 * 15_tab-chats-implementacion.md). */
export interface DirectMessage {
  id: string;
  conversationId: string;
  senderId: string;
  senderName: string;
  senderPhotoUrl?: string;
  text: string;
  reactions: MessageReactionSummary[];
  createdAt: number;
  editedAt?: number;
  deleted: boolean;
  replyTo?: { id: string; senderName: string; text: string; deleted: boolean } | null;
}

/** One row of the Chats tab's 1:1 section, or the header of an open
 * conversation - the conversation hydrated with the *other* participant's
 * profile and a preview of the last message (see ConversationDetailedDto,
 * backend). */
export interface ConversationDetailed {
  id: string;
  status: ConversationStatus;
  requestedBy: string;
  createdAt: number;
  lastMessageAt?: number;
  peerId: string;
  peerName: string;
  peerPhotoUrl?: string;
  lastMessagePreview?: string;
  unreadCount: number;
}
