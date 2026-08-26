import { NotificationType } from '../../models';

export const ALL_NOTIFICATION_TYPES: NotificationType[] = [
  'event_updated',
  'event_reminder_today',
  'following_new_event',
  'preference_new_event',
  'recurring_series_created',
  'event_attendee',
  'new_follower',
  'event_manager_invite',
  'event_attendee_invite',
  'gallery_photo_followed',
  'gallery_photo_attending',
  'gallery_photo_profile',
  'event_chat_message',
];

export const NOTIFICATION_TYPE_ICONS: Record<NotificationType, string> = {
  new_follower: 'person-add-outline',
  event_attendee: 'checkmark-circle-outline',
  event_updated: 'create-outline',
  event_reminder_today: 'today-outline',
  following_new_event: 'calendar-outline',
  preference_new_event: 'sparkles-outline',
  recurring_series_created: 'repeat-outline',
  event_manager_invite: 'ribbon-outline',
  event_attendee_invite: 'people-outline',
  gallery_photo_followed: 'images-outline',
  gallery_photo_attending: 'images-outline',
  gallery_photo_profile: 'images-outline',
  event_chat_message: 'chatbubbles-outline',
};

export interface NotificationCategory {
  id: string;
  labelKey: string;
  types: NotificationType[];
}

/** Groups ALL_NOTIFICATION_TYPES' 13 entries into 4 categories - both the
 * Settings toggle list and the Notifications filter modal render by category
 * instead of one flat list, which is what was becoming unmanageable as more
 * notification types were added. */
export const NOTIFICATION_CATEGORIES: NotificationCategory[] = [
  {
    id: 'events',
    labelKey: 'notifications.categoryEvents',
    types: ['event_updated', 'event_reminder_today', 'following_new_event', 'preference_new_event', 'recurring_series_created'],
  },
  {
    id: 'attendance',
    labelKey: 'notifications.categoryAttendance',
    types: ['event_attendee', 'event_manager_invite', 'event_attendee_invite'],
  },
  {
    id: 'social',
    labelKey: 'notifications.categorySocial',
    types: ['new_follower', 'event_chat_message'],
  },
  {
    id: 'gallery',
    labelKey: 'notifications.categoryGallery',
    types: ['gallery_photo_followed', 'gallery_photo_attending', 'gallery_photo_profile'],
  },
];

export const NOTIFICATION_TYPE_LABEL_KEYS: Record<NotificationType, string> = {
  new_follower: 'notifications.typeNewFollower',
  event_attendee: 'notifications.typeEventAttendee',
  event_updated: 'notifications.typeEventUpdated',
  event_reminder_today: 'notifications.typeEventReminderToday',
  following_new_event: 'notifications.typeFollowingNewEvent',
  preference_new_event: 'notifications.typePreferenceNewEvent',
  recurring_series_created: 'notifications.typeRecurringSeriesCreated',
  event_manager_invite: 'notifications.typeEventManagerInvite',
  event_attendee_invite: 'notifications.typeEventAttendeeInvite',
  gallery_photo_followed: 'notifications.typeGalleryPhotoFollowed',
  gallery_photo_attending: 'notifications.typeGalleryPhotoAttending',
  gallery_photo_profile: 'notifications.typeGalleryPhotoProfile',
  event_chat_message: 'notifications.typeEventChatMessage',
};
