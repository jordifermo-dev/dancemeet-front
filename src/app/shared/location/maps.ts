import { environment } from '../../../environments/environment';

export type MapType = 'roadmap' | 'satellite';

/** Barcelona - fallback center for <app-map-view> (Explorer/Favoritos/Mis
 * Events) whenever neither a host-supplied center nor any event markers are
 * available to derive one from. */
export const DEFAULT_MAP_CENTER: google.maps.LatLngLiteral = { lat: 41.3874, lng: 2.1686 };

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

/** Only for <app-map-view> (Explorer/Favoritos/Mis Events), which renders via
 * the real Maps JS API (<google-map>) - the Maps Embed API used by
 * mapEmbedUrl's iframes has no style parameter at all, so those stay light
 * regardless of app theme.
 * Colors lean on the app's own dark palette (--app-surface-card, water
 * tinted from --ion-color-primary-shade) instead of a generic community
 * "night mode" JSON, so the map reads as part of this app, not a stock demo. */
export const NIGHT_MAP_STYLES: google.maps.MapTypeStyle[] = [
  { elementType: 'geometry', stylers: [{ color: '#1c1c1e' }] },
  { elementType: 'labels.text.stroke', stylers: [{ color: '#1c1c1e' }] },
  { elementType: 'labels.text.fill', stylers: [{ color: '#8c8c94' }] },
  { featureType: 'administrative', elementType: 'geometry', stylers: [{ color: '#3a3a3c' }] },
  { featureType: 'poi', elementType: 'geometry', stylers: [{ color: '#242426' }] },
  { featureType: 'poi.park', elementType: 'geometry', stylers: [{ color: '#1e2a28' }] },
  { featureType: 'poi.park', elementType: 'labels.text.fill', stylers: [{ color: '#5c6b64' }] },
  { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#2c2c2e' }] },
  { featureType: 'road', elementType: 'geometry.stroke', stylers: [{ color: '#1c1c1e' }] },
  { featureType: 'road.arterial', elementType: 'geometry', stylers: [{ color: '#333336' }] },
  { featureType: 'road.highway', elementType: 'geometry', stylers: [{ color: '#3a3a3d' }] },
  { featureType: 'road.highway', elementType: 'geometry.stroke', stylers: [{ color: '#1c1c1e' }] },
  { featureType: 'road.local', elementType: 'labels.text.fill', stylers: [{ color: '#6c6c70' }] },
  { featureType: 'transit', elementType: 'geometry', stylers: [{ color: '#242426' }] },
  { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#0d3335' }] },
  { featureType: 'water', elementType: 'labels.text.fill', stylers: [{ color: '#4a7a7c' }] },
];
