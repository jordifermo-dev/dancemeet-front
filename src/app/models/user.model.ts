export interface SocialLinks {
  instagram?: string;
  facebook?: string;
  tiktok?: string;
  youtube?: string;
  website?: string;
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
  eventDateFrom?: number;
  eventDateTo?: number | null;
  notificationsEnabled: boolean;
  disciplineIds: string[];
  eventTypeIds: string[];
  statusIds: string[];
  language: string;
  showEmail: boolean;
  showPhone: boolean;
  showCity: boolean;
  showLocation: boolean;
  createdAt: number;
  updatedAt?: number;
  lastLoginAt?: number;
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
  notificationsEnabled: boolean;
  disciplineIds: string[];
  eventTypeIds: string[];
  statusIds: string[];
  language?: string;
}

/** Partial update sent to PUT /api/users/:id - any subset of editable profile fields. */
export type UpdateUserPayload = Partial<
  Omit<
    User,
    'id' | 'email' | 'createdAt' | 'updatedAt' | 'lastLoginAt' | 'followedId' | 'followingId' | 'blockedIds'
  >
>;
