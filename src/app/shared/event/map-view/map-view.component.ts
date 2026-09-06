import { Component, EventEmitter, Input, OnInit, Output, computed, inject, input, signal } from '@angular/core';
import { IonIcon, IonSpinner } from '@ionic/angular/standalone';
import { GoogleMap, MapMarker, MapCircle } from '@angular/google-maps';
import { TranslatePipe } from '@ngx-translate/core';
import { addIcons } from 'ionicons';
import { navigateOutline, layersOutline } from 'ionicons/icons';
import { GeocodingService } from '../../../services/location/geocoding.service';
import { GoogleMapsLoaderService } from '../../../services/location/google-maps-loader.service';
import { ThemeService } from '../../../services/core/theme.service';
import { Discipline, EventWithCreatorName } from '../../../models';
import { disciplineIconUrl } from '../icon-catalog';
import { DEFAULT_MAP_CENTER, MapType, NIGHT_MAP_STYLES } from '../../location/maps';

const MARKER_ICON_SIZE = 34;

/** What a tap on the map (locate-me, or a search-mode tap on the map itself)
 * resolves to - hosts that care about "where the user wants to search from"
 * (Explorer, and Favoritos/Mis Events' own distance filter) listen for this;
 * hosts that don't just let the map recenter locally and ignore it. */
export interface MapLocationPicked {
  lat: number;
  lng: number;
  city?: string;
  address?: string;
}

interface MapMarkerData {
  event: EventWithCreatorName;
  position: google.maps.LatLngLiteral;
  options: google.maps.MarkerOptions;
}

/** google.maps.Marker only takes a single icon image, but an event can now
 * have more than one discipline - this composites all of them side by side
 * into one small SVG (each icon shrinks a bit as more are added) instead of
 * only ever showing the first one. A single discipline keeps using its plain
 * static icon URL directly (the pre-existing, known-good path) - only 2+
 * disciplines go through the generated data: URI, so a bug in the
 * compositing code can't take down every marker, just multi-discipline ones. */
function buildDisciplineMarkerIcon(disciplines: Discipline[]): { url: string; size: google.maps.Size } {
  if (disciplines.length === 1) {
    return { url: disciplineIconUrl(disciplines[0]), size: new google.maps.Size(MARKER_ICON_SIZE, MARKER_ICON_SIZE) };
  }
  const iconSize = Math.max(18, MARKER_ICON_SIZE * 0.7);
  const gap = 2;
  const width = disciplines.length * iconSize + (disciplines.length - 1) * gap;
  const images = disciplines
    .map((discipline, index) => {
      const x = index * (iconSize + gap);
      return `<image href="${disciplineIconUrl(discipline)}" x="${x}" y="0" width="${iconSize}" height="${iconSize}" />`;
    })
    .join('');
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${iconSize}">${images}</svg>`;
  // Standard percent-encoded data URI (no ";utf8" parameter, which is
  // non-standard and not reliably accepted by Google Maps' own icon loader).
  return { url: `data:image/svg+xml,${encodeURIComponent(svg)}`, size: new google.maps.Size(width, iconSize) };
}

/** The "Ver en mapa" mode shared by Explorer/Favoritos/Mis Events - extracted
 * out of what used to be Explorer's own standalone page, and later decoupled
 * from ExplorerFiltersService so the other two tabs (their own, different
 * filter state - see event-list-filters.ts) can reuse it too. Injects
 * ThemeService/GeocodingService/GoogleMapsLoaderService directly (all
 * root-provided, no prop-drilling cost); everything host-specific (the
 * already-filtered event list, an optional search center/radius to display,
 * whether tapping the map should even mean anything) comes in via @Input -
 * see `center`/`radiusMeters`/`searchOnTap` below. */
@Component({
  selector: 'app-map-view',
  standalone: true,
  templateUrl: './map-view.component.html',
  styleUrl: './map-view.component.scss',
  imports: [IonIcon, IonSpinner, GoogleMap, MapMarker, MapCircle, TranslatePipe],
})
export class MapViewComponent implements OnInit {
  private readonly mapsLoader = inject(GoogleMapsLoaderService);
  private readonly themeService = inject(ThemeService);
  private readonly geocodingService = inject(GeocodingService);

  // Signal inputs (not @Input()) specifically because markers/resolvedCenter/
  // radiusCircleOptions below need to be real computed()s - same reasoning
  // as LocationPickerComponent's own lat/lng/zoom/mapType (see its doc
  // comment): a computed() only re-runs when a *signal* it read changes, a
  // plain @Input() property read inside one is invisible to it, so the map
  // silently kept showing whichever markers/center happened to be there on
  // the very first computation and never updated again as filters changed.
  readonly events = input.required<EventWithCreatorName[]>();
  readonly disciplinesById = input.required<Map<string, Discipline>>();
  @Input() loading = false;
  @Input() noCategorySelected = false;
  @Output() readonly eventTap = new EventEmitter<string>();

  /** A host-owned search center to show the map centered on (Explorer/
   * Favoritos/Mis Events' own distance filter) - when the host has no such
   * concept, or nothing set yet, omit it and the map centers on its own
   * markers instead (see resolvedCenter). Always wins over the map's own
   * locate-me/tap-to-pick state once provided, same single-source-of-truth
   * round-trip Explorer always had (tap emits locationPicked, host updates
   * its filter, the new value flows back down through this input). */
  readonly center = input<google.maps.LatLngLiteral>();
  /** A host-owned search radius (meters) to visualize as a translucent
   * circle around `center` - omitted entirely (no circle drawn) for hosts
   * with no distance-filter concept of their own. */
  readonly radiusMeters = input<number>();
  /** Whether tapping the map (outside a marker) should drop/move a search
   * pin at all - only makes sense for a host that has a location filter to
   * update (Explorer always; Favoritos/Mis Events only while their own
   * location filter is the thing being edited). Off by default: a plain
   * "where are my events" map (no host `center`) has nothing for a tap to
   * usefully do. */
  @Input() searchOnTap = false;
  /** Emitted by both the locate-me button and (only while searchOnTap) a map
   * tap - the host decides what a "location picked" moment means for it
   * (Explorer/Favoritos/Mis Events all write it into their own filter's
   * applied+draft lat/lng/city/address); a host with no such filter just
   * doesn't bind this and the map still recenters itself locally either way. */
  @Output() readonly locationPicked = new EventEmitter<MapLocationPicked>();

  readonly mapReady = signal(false);
  readonly mapError = signal(false);
  readonly locatingMe = signal(false);
  readonly droppingPin = signal(false);
  readonly mapType = signal<MapType>('roadmap');
  readonly mapZoom = signal(12);
  /** Local fallback center, set by centerOnMyLocation()/onMapClick() - only
   * ever consulted when the host doesn't supply its own `center` @Input (see
   * resolvedCenter), so a host with no location-filter concept still gets a
   * map that visually recenters on tap/locate instead of just sitting still. */
  private readonly manualCenter = signal<google.maps.LatLngLiteral | null>(null);

  readonly resolvedCenter = computed<google.maps.LatLngLiteral>(() => {
    const center = this.center();
    if (center) {
      return center;
    }
    const manual = this.manualCenter();
    if (manual) {
      return manual;
    }
    const points = this.markers();
    if (!points.length) {
      return DEFAULT_MAP_CENTER;
    }
    return {
      lat: points.reduce((sum, m) => sum + m.position.lat, 0) / points.length,
      lng: points.reduce((sum, m) => sum + m.position.lng, 0) / points.length,
    };
  });

  // Computed (not a plain object) so toggling Light/Dark/System live-restyles
  // an already-open map instead of only applying on the next visit - GoogleMap
  // forwards options changes straight to the underlying Maps JS instance.
  readonly mapOptions = computed<google.maps.MapOptions>(() => ({
    disableDefaultUI: true,
    zoomControl: true,
    clickableIcons: false,
    // disableDefaultUI doesn't cover this one - Maps shows its own compass/
    // reset-rotation control as soon as the map is tilted or rotated (e.g. a
    // two-finger touch gesture on a real device), floating right above our
    // zoom buttons.
    rotateControl: false,
    // Plain 'satellite' is bare imagery with no place/street labels in the
    // Maps JS API - 'hybrid' is what "Satélite" actually means in the
    // consumer Google Maps app (satellite imagery *with* labels overlaid).
    mapTypeId: this.mapType() === 'satellite' ? 'hybrid' : 'roadmap',
    styles: this.themeService.isDark() ? NIGHT_MAP_STYLES : undefined,
  }));

  // Visualizes the host's search radius as a translucent circle around
  // resolvedCenter, so the search area is visible, not just a number - only
  // while the host actually has a radius to show (see radiusMeters's own doc
  // comment above).
  readonly radiusCircleOptions = computed<google.maps.CircleOptions>(() => ({
    center: this.resolvedCenter(),
    radius: this.radiusMeters() ?? 0,
    strokeColor: '#106568',
    strokeOpacity: 0.6,
    strokeWeight: 1.5,
    fillColor: '#106568',
    fillOpacity: 0.08,
    clickable: false,
  }));

  readonly markers = computed<MapMarkerData[]>(() => {
    const byId = this.disciplinesById();
    // The explorer never returns drafts (backend-enforced), but a marker
    // needs real coordinates regardless - skip anything without them rather
    // than trusting that invariant here too.
    return this.events()
      .filter((event) => event.latitude !== undefined && event.longitude !== undefined)
      .map((event) => {
        const disciplines = (event.disciplineIds ?? []).map((id) => byId.get(id)).filter((d): d is Discipline => !!d);
        if (!disciplines.length) {
          return { event, position: { lat: event.latitude!, lng: event.longitude! }, options: {} };
        }
        const icon = buildDisciplineMarkerIcon(disciplines);
        return {
          event,
          position: { lat: event.latitude!, lng: event.longitude! },
          options: { icon: { url: icon.url, scaledSize: icon.size } },
        };
      });
  });

  constructor() {
    addIcons({ navigateOutline, layersOutline });
  }

  ngOnInit(): void {
    this.mapsLoader
      .load()
      .then(() => this.mapReady.set(true))
      .catch(() => this.mapError.set(true));
  }

  /** The floating "locate me" button on the map - an instant recenter,
   * always effective locally (see manualCenter), and reported upward via
   * locationPicked for whichever hosts care to persist it into a filter. */
  centerOnMyLocation(): void {
    if (!navigator.geolocation) {
      return;
    }
    this.locatingMe.set(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const lat = position.coords.latitude;
        const lng = position.coords.longitude;
        this.manualCenter.set({ lat, lng });
        this.locationPicked.emit({ lat, lng });
        this.locatingMe.set(false);
      },
      () => this.locatingMe.set(false),
    );
  }

  toggleMapType(): void {
    this.mapType.update((type) => (type === 'roadmap' ? 'satellite' : 'roadmap'));
  }

  /** Tapping the map (outside an event marker, which has its own mapClick and
   * never bubbles here) drops/moves the search pin, same as
   * centerOnMyLocation() but from a tapped point instead of the GPS - also
   * reverse-geocodes so city/address travel along with it. Only while
   * searchOnTap - a host with nothing for a tap to mean shouldn't have random
   * taps silently recentering its map. */
  onMapClick(event: google.maps.MapMouseEvent): void {
    if (!this.searchOnTap || !event.latLng) {
      return;
    }
    const lat = event.latLng.lat();
    const lng = event.latLng.lng();
    this.manualCenter.set({ lat, lng });
    this.droppingPin.set(true);
    this.geocodingService.reverse(lat, lng).subscribe({
      next: (result) => {
        this.locationPicked.emit({ lat, lng, city: result?.city, address: result?.formattedAddress });
        this.droppingPin.set(false);
      },
      error: () => {
        this.locationPicked.emit({ lat, lng });
        this.droppingPin.set(false);
      },
    });
  }
}
