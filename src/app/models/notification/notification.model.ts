export type NotificationType =
  | 'new_follower'
  | 'event_attendee'
  | 'event_updated'
  | 'event_reminder_today'
  | 'following_new_event'
  | 'preference_new_event'
  | 'recurring_series_created'
  | 'event_manager_invite'
  | 'event_attendee_invite';

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
