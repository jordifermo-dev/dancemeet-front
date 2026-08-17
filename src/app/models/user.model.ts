import { NotificationType } from './notification.model';
import { PriceOption, RelationOption } from './event.model';

export interface SocialLinks {
  instagram?: string;
  facebook?: string;
  tiktok?: string;
  youtube?: string;
  website?: string;
  whatsapp?: string;
  pinterest?: string;
}

/** One row of a followers/following list. */
export interface FollowUser {
  id: string;
  name: string;
  photoUrl?: string;
  disciplineIds: string[];
  followedAt: number;
}

export interface User {
  id: string;
  name: string;
  email: string;
  phone?: string;
  socialLinks?: SocialLinks;
  photoUrl?: string;
  city: string;
  address: string;
  latitude: number;
  longitude: number;
  distanceRange: number;
  eventDateFrom?: number | null;
  eventDateTo?: number | null;
  /** Notification types the user has turned off - empty means every type is
   * enabled (the default), all six means "no notifications at all". */
  disabledNotificationTypes: NotificationType[];
  disciplineIds: string[];
  eventTypeIds: string[];
  statusIds: string[];
  priceOptions: PriceOption[];
  relationTypes: RelationOption[];
  language: string;
  showEmail: boolean;
  showPhone: boolean;
  showCity: boolean;
  showLocation: boolean;
  createdAt: number;
  updatedAt?: number;
  followedId?: string[];
  followingId?: string[];
  blockedIds?: string[];
}

export interface CreateUserPayload {
  name: string;
  email: string;
  city: string;
  address: string;
  latitude: number;
  longitude: number;
  distanceRange: number;
  disabledNotificationTypes: NotificationType[];
  disciplineIds: string[];
  eventTypeIds: string[];
  statusIds: string[];
  priceOptions?: PriceOption[];
  relationTypes?: RelationOption[];
  language?: string;
}

/** Partial update sent to PUT /api/users/:id - any subset of editable profile fields. */
export type UpdateUserPayload = Partial<
  Omit<User, 'id' | 'email' | 'createdAt' | 'updatedAt' | 'followedId' | 'followingId' | 'blockedIds'>
>;
