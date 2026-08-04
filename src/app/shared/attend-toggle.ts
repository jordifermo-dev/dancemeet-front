import { HttpErrorResponse } from '@angular/common/http';

/** A 422 while adding ("already favorited") or a 404 while removing
 * ("not found") means the backend's already in the state being asked for -
 * some other action (e.g. toggling the same event from event-detail, or a
 * doubled tap that slipped past the busy-guard) already got there first.
 * Returns the state to self-heal the UI to instead of leaving the heart
 * stuck on a failed request, or null for a real error. */
export function recoverAttendState(error: unknown, wasAttending: boolean): boolean | null {
  if (!(error instanceof HttpErrorResponse)) {
    return null;
  }
  if (!wasAttending && error.status === 422) {
    return true;
  }
  if (wasAttending && error.status === 404) {
    return false;
  }
  return null;
}
