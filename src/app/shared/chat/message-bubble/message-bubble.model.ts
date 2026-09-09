export interface ChatBubbleReaction {
  emoji: string;
  count: number;
  reactedByMe: boolean;
}

export interface ChatBubbleReplyQuote {
  senderName: string;
  text: string;
  deleted: boolean;
}

export interface ChatBubbleAttachedPhoto {
  galleryPhotoId: string;
  photoUrl: string;
}

/** The shape <app-message-bubble> renders - a superset of EventMessage/
 * DirectMessage that's agnostic to which one backs it. attachedPhoto is
 * always absent for a 1:1 xat message (a DM has no gallery to mention
 * anything from - see 15_tab-chats-implementacion.md). */
export interface ChatBubbleMessage {
  id: string;
  senderId: string;
  senderName: string;
  senderPhotoUrl?: string;
  text: string;
  deleted: boolean;
  editedAt?: number;
  reactions: ChatBubbleReaction[];
  replyTo?: ChatBubbleReplyQuote | null;
  attachedPhoto?: ChatBubbleAttachedPhoto | null;
}
