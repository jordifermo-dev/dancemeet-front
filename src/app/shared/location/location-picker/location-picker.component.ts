import { Component, EventEmitter, Input, OnInit, Output, computed, inject, input, signal } from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { IonButton, IonIcon, IonModal, IonRange, IonSearchbar } from '@ionic/angular/standalone';
import { TranslatePipe } from '@ngx-translate/core';
import { GoogleMap, MapMarker } from '@angular/google-maps';
import { addIcons } from 'ionicons';
import {
  addOutline,
  checkmarkOutline,
  contractOutline,
  expandOutline,
  layersOutline,
  locateOutline,
  locationOutline,
  navigateOutline,
  removeOutline,
} from 'ionicons/icons';
import { GoogleMapsLoaderService } from '../../../services/location/google-maps-loader.service';
import { CitySuggestion } from '../../../services/location/geocoding.service';
import { ThemeService } from '../../../services/core/theme.service';
import { MapType, NIGHT_MAP_STYLES } from '../maps';

/** Fallback center (Barcelona) for editable screens that don't have a
 * location yet (a brand new register/create-event) - lets the map render
 * immediately instead of a separate "search first" placeholder screen. */
const DEFAULT_CENTER: google.maps.LatLngLiteral = { lat: 41.3874, lng: 2.1686 };

/** Single "pick/show a location on a map" building block, used everywhere the
 * app shows a location: register, profile, event create/edit, event view
 * ("event-card" - the section with the "Cómo llegar" button), the user
 * profile view, and the location filter. All of those used to be near-
 * identical copy-pasted markup (map + zoom/satellite + search + suggestions +
 * current-location + address line + distance) that had drifted out of sync
 * (different element order per page, no map at all in the location filter).
 *
 * Purely presentational - the host page still owns all state (search
 * debouncing, GeocodingService calls, current-location handling) exactly as
 * before and just feeds it in via inputs/outputs, so none of that working
 * logic needed to move. The only genuinely new behavior this adds is
 * `pinMoved`: tapping the map (only when `editable`) reverse-geocodes via the
 * same GeocodingService each host already uses for search suggestions -
 * something the old <iframe>-based Maps Embed API could never do, since a
 * cross-origin iframe can't report clicks back to the page.
 *
 * lat/lng/zoom/mapType are signal inputs (not @Input()) specifically so
 * `center`/`mapOptions` can be real computed()s: <google-map>'s `center`/
 * `options` bindings do an identity (===) check on every change-detection
 * pass, and a plain getter returning `{ lat, lng }`/`{ ...options }` object
 * literals hands it a NEW reference every single check even when nothing
 * changed - GoogleMap saw that as real repeated updates and kept calling the
 * underlying Maps JS setCenter()/setOptions() in a tight loop, which froze
 * the whole WebView hard enough to need a force-close (only surfaced after
 * an interaction like tapping zoom/satellite triggered more CD passes -
 * initial pinch-zoom is a native map gesture that never goes through Angular
 * bindings at all, so it stayed unaffected). computed() only produces a new
 * object when an actual input changed. */
@Component({
  selector: 'app-location-picker',
  standalone: true,
  templateUrl: './location-picker.component.html',
  styleUrl: './location-picker.component.scss',
  imports: [IonButton, IonIcon, IonModal, IonRange, IonSearchbar, NgTemplateOutlet, TranslatePipe, GoogleMap, MapMarker],
})
export class LocationPickerComponent implements OnInit {
  private readonly mapsLoader = inject(GoogleMapsLoaderService);
  private readonly themeService = inject(ThemeService);

  readonly lat = input<number | null>(null);
  readonly lng = input<number | null>(null);
  readonly zoom = input(15);
  readonly mapType = input<MapType>('roadmap');
  /** Tapping the map only drops/moves the pin (emits `pinMoved`) when true -
   * false renders the exact same pan/zoomable map Explorer already uses for
   * read-only display (event view, other users' profiles). */
  @Input() editable = false;

  @Input() titleKey?: string;
  @Input() required = false;
  @Input() showHideToggle = false;
  @Input() locationVisible = true;

  @Input() showSearch = true;
  @Input() addressValue = '';
  @Input() citySuggestions: CitySuggestion[] = [];

  @Input() showCurrentLocationButton = true;
  @Input() locating = false;

  @Input() addressLine: string | null = null;

  @Input() showDistance = false;
  @Input() distanceValue = 50;

  @Input() showDirectionsButton = false;
  @Input() directionsActive = false;

  @Output() readonly zoomIn = new EventEmitter<void>();
  @Output() readonly zoomOut = new EventEmitter<void>();
  @Output() readonly mapTypeToggle = new EventEmitter<void>();
  @Output() readonly addressInput = new EventEmitter<string>();
  @Output() readonly suggestionSelect = new EventEmitter<CitySuggestion>();
  @Output() readonly useCurrentLocation = new EventEmitter<void>();
  @Output() readonly distanceChange = new EventEmitter<number>();
  @Output() readonly directions = new EventEmitter<void>();
  @Output() readonly visibleToggle = new EventEmitter<void>();
  @Output() readonly pinMoved = new EventEmitter<{ lat: number; lng: number }>();

  readonly mapReady = signal(false);
  readonly mapLoadError = signal(false);
  /** The small ~280px map preview is cramped for searching/dropping a pin on
   * a phone screen - lets the user blow the whole component up to a real
   * fullscreen `<ion-modal>` and back. A plain CSS `position: fixed` overlay
   * doesn't work here: Ionic's page wrapper applies a CSS transform during
   * navigation transitions, which becomes the containing block for any
   * `position: fixed` descendant, so "fixed" ends up relative to that
   * transformed page instead of the real viewport - the overlay comes out
   * clipped to (and scaled with) the page rather than covering the screen.
   * `<ion-modal>` renders through Ionic's own overlay portal, sidestepping
   * that entirely. The template (`pickerBody`) is a single shared
   * `<ng-template>` reused via `*ngTemplateOutlet` in both the inline compact
   * view and the modal, so there's only ever one `<google-map>` instance
   * mounted at a time - never two to keep in sync. */
  readonly isExpanded = signal(false);

  /** True once a real lat/lng has been picked - before that (a brand new
   * register/create-event with nothing chosen yet), the map still renders
   * (at DEFAULT_CENTER) so editable screens are never a bare placeholder
   * "screen" the user has to search past before the actual map appears, but
   * with no pin dropped anywhere real yet. */
  readonly hasLocation = computed(() => this.lat() !== null && this.lng() !== null);

  readonly center = computed<google.maps.LatLngLiteral>(() => {
    const lat = this.lat();
    const lng = this.lng();
    return lat === null || lng === null ? DEFAULT_CENTER : { lat, lng };
  });

  readonly mapOptions = computed<google.maps.MapOptions>(() => ({
    disableDefaultUI: true,
    clickableIcons: false,
    rotateControl: false,
    // Plain 'satellite' is bare imagery with no place/street labels in the
    // Maps JS API - 'hybrid' is what "Satélite" actually means in the
    // consumer Google Maps app (satellite imagery *with* labels overlaid).
    mapTypeId: this.mapType() === 'satellite' ? 'hybrid' : 'roadmap',
    styles: this.themeService.isDark() ? NIGHT_MAP_STYLES : undefined,
  }));

  constructor() {
    addIcons({
      removeOutline,
      addOutline,
      layersOutline,
      locateOutline,
      locationOutline,
      navigateOutline,
      checkmarkOutline,
      expandOutline,
      contractOutline,
    });
  }

  ngOnInit(): void {
    this.mapsLoader
      .load()
      .then(() => this.mapReady.set(true))
      .catch(() => this.mapLoadError.set(true));
  }

  toggleExpanded(): void {
    this.isExpanded.update((expanded) => !expanded);
  }

  onMapClick(event: google.maps.MapMouseEvent): void {
    if (!this.editable || !event.latLng) {
      return;
    }
    this.pinMoved.emit({ lat: event.latLng.lat(), lng: event.latLng.lng() });
  }

  onAddressInput(value: string | null | undefined): void {
    this.addressInput.emit(value ?? '');
  }

  onDistanceChange(event: Event): void {
    const value = Number((event as CustomEvent<{ value: number }>).detail.value);
    this.distanceChange.emit(value);
  }
}
