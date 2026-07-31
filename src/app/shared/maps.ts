import { environment } from '../../environments/environment';

export type MapType = 'roadmap' | 'satellite';

const EARTH_RADIUS_METERS = 6_371_000;

/** Great-circle distance between two coordinates, in meters - used to filter
 * client-side lists (e.g. Favorites) by the same distance radius the backend
 * applies via MongoDB's $near. */
export function haversineDistanceMeters(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number,
): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_METERS * Math.asin(Math.sqrt(a));
}

/** Official Maps Embed API "place" mode - drops a pin at the given point. Google
 * disables drag-to-pan below a certain iframe size regardless of mode (see
 * `.map-preview` height), so as long as the container stays tall enough this
 * mode still pans/zooms normally while also showing the marker.
 * Google's own UI has no on-screen zoom/map-type buttons anymore either, so
 * the app supplies its own (see profile.page.ts / user-detail.page.ts) and
 * rebuilds this URL on change. */
export function mapEmbedUrl(latitude: number, longitude: number, zoom = 15, mapType: MapType = 'roadmap'): string {
  const params = new URLSearchParams({
    key: environment.googleMapsApiKey,
    q: `${latitude},${longitude}`,
    zoom: String(zoom),
    maptype: mapType,
  });
  return `https://www.google.com/maps/embed/v1/place?${params.toString()}`;
}
