export interface GalleryPhoto {
  id: string;
  /** Absent for a photo posted directly to a profile, with no event involved. */
  eventId?: string;
  posterUserId: string;
  photoUrl: string;
  createdAt: number;
}

/** For an event's own gallery - who posted each photo, so a tap can jump to
 * that person's profile. */
export interface GalleryPhotoWithPoster extends GalleryPhoto {
  posterUserName: string;
  posterUserPhotoUrl?: string;
}

/** For a user's own gallery - which event each photo came from, so a tap
 * can jump to that event. Both absent for a photo posted straight to the
 * profile, with no event. */
export interface GalleryPhotoWithEvent extends GalleryPhoto {
  eventTitle?: string;
  eventImageUrl?: string;
}

/** One event's entry in the "browse events by photo" cover-image mode (see
 * GalleryService.getCoverPhotos) - count lets that mode hint "several
 * photos" without a request per event. */
export interface GalleryCover {
  photoUrl: string;
  count: number;
}
