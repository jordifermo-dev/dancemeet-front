import { NotificationType } from '../models';

export const ALL_NOTIFICATION_TYPES: NotificationType[] = [
  'event_updated',
  'event_reminder_today',
  'following_new_event',
  'preference_new_event',
  'recurring_series_created',
  'event_attendee',
  'new_follower',
];

export const NOTIFICATION_TYPE_ICONS: Record<NotificationType, string> = {
  new_follower: 'person-add-outline',
  event_attendee: 'checkmark-circle-outline',
  event_updated: 'create-outline',
  event_reminder_today: 'today-outline',
  following_new_event: 'calendar-outline',
  preference_new_event: 'sparkles-outline',
  recurring_series_created: 'repeat-outline',
};

export const NOTIFICATION_TYPE_LABEL_KEYS: Record<NotificationType, string> = {
  new_follower: 'notifications.typeNewFollower',
  event_attendee: 'notifications.typeEventAttendee',
  event_updated: 'notifications.typeEventUpdated',
  event_reminder_today: 'notifications.typeEventReminderToday',
  following_new_event: 'notifications.typeFollowingNewEvent',
  preference_new_event: 'notifications.typePreferenceNewEvent',
  recurring_series_created: 'notifications.typeRecurringSeriesCreated',
};
