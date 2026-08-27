export type NotificationType =
  | 'new_follower'
  | 'event_attendee'
  | 'event_updated'
  | 'event_reminder_today'
  | 'following_new_event'
  | 'preference_new_event'
  | 'recurring_series_created'
  | 'event_manager_invite'
  | 'event_attendee_invite'
  | 'gallery_photo_followed'
  | 'gallery_photo_attending'
  | 'gallery_photo_profile'
  | 'event_chat_message'
  | 'event_review_created'
  | 'event_review_replied';

export interface AppNotification {
  id: string;
  userId: string;
  type: NotificationType;
  title: string;
  body: string;
  data?: Record<string, string>;
  read: boolean;
  createdAt: number;
}
