export interface OrganizerReply {
  text: string;
  repliedByUserId: string;
  repliedByName: string;
  createdAt: number;
  updatedAt?: number;
}

export interface Review {
  id: string;
  eventId: string;
  authorUserId: string;
  authorName: string;
  authorPhotoUrl?: string;
  organizerId: string;
  rating: number;
  comment?: string;
  createdAt: number;
  updatedAt?: number;
  organizerReply?: OrganizerReply;
}

/** The logged-in user's own review for one event - no author/organizer-reply
 * hydration needed (unlike Review), since the frontend already knows who
 * "you" are. Used to decide "Escribir reseña" vs "Editar tu reseña". */
export interface MyReview {
  id: string;
  eventId: string;
  rating: number;
  comment?: string;
  createdAt: number;
  updatedAt?: number;
}

export interface OrganizerRating {
  organizerId: string;
  averageRating: number;
  count: number;
}
