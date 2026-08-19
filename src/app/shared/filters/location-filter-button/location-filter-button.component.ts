import { Component, computed, inject, signal } from '@angular/core';
import { IonIcon, IonButton, IonModal } from '@ionic/angular/standalone';
import { TranslatePipe } from '@ngx-translate/core';
import { addIcons } from 'ionicons';
import { locationOutline, bookmarkOutline, refreshOutline, checkmarkOutline } from 'ionicons/icons';
import { CitySuggestion, GeocodingService } from '../../../services/location/geocoding.service';
import { ExplorerFiltersService } from '../../../services/filters/explorer-filters.service';
import { MapType } from '../../location/maps';
import { createApplyFlash } from '../../common/success-flash';
import { FilterSheetHeaderComponent } from '../filter-sheet-header/filter-sheet-header.component';
import { FilterActionsRowComponent } from '../filter-actions-row/filter-actions-row.component';
import { LocationPickerComponent } from '../../location/location-picker/location-picker.component';

const MIN_ZOOM = 3;
const MAX_ZOOM = 20;

/** The "Ubicación" icon button + bottom sheet (distance, city search, current
 * location) shared by every tab that filters by location - all bound to the
 * same ExplorerFiltersService draft/applied state, so opening it from
 * Explorer, Favorites or any future tab is the exact same filter. */
@Component({
  selector: 'app-location-filter-button',
  standalone: true,
  templateUrl: './location-filter-button.component.html',
  styleUrl: './location-filter-button.component.scss',
  imports: [
    IonIcon,
    IonButton,
    IonModal,
    TranslatePipe,
    FilterSheetHeaderComponent,
    FilterActionsRowComponent,
    LocationPickerComponent,
  ],
})
export class LocationFilterButtonComponent {
  private readonly geocodingService = inject(GeocodingService);
  readonly filters = inject(ExplorerFiltersService);

  readonly isOpen = signal(false);
  readonly citySuggestions = signal<CitySuggestion[]>([]);
  readonly locatingMe = signal(false);
  readonly zoomLevel = signal(15);
  readonly mapType = signal<MapType>('roadmap');
  /** Only truthy once a real location is resolved (mirrors `filters.draftCity`
   * being empty while still typing) - shows the full address line below the
   * search box, or the hint text while nothing's resolved yet. */
  readonly resolvedAddressLine = computed(() => (this.filters.draftCity() ? this.filters.draftAddress() : null));
  private cityInputTimer: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    addIcons({ locationOutline, bookmarkOutline, refreshOutline, checkmarkOutline });
  }

  open(): void {
    this.citySuggestions.set([]);
    this.filters.draftDistanceRange.set(this.filters.appliedDistanceRange());
    this.filters.draftLatitude.set(this.filters.appliedLatitude());
    this.filters.draftLongitude.set(this.filters.appliedLongitude());
    this.filters.draftCity.set(this.filters.appliedCity());
    this.filters.draftAddress.set(this.filters.appliedAddress());
    this.isOpen.set(true);
  }

  zoomIn(): void {
    this.zoomLevel.update((zoom) => Math.min(MAX_ZOOM, zoom + 1));
  }

  zoomOut(): void {
    this.zoomLevel.update((zoom) => Math.max(MIN_ZOOM, zoom - 1));
  }

  toggleMapType(): void {
    this.mapType.update((type) => (type === 'roadmap' ? 'satellite' : 'roadmap'));
  }

  onDistanceChange(value: number): void {
    this.filters.setDraftDistanceRange(value);
  }

  onCityInput(value: string | null | undefined): void {
    const query = (value ?? '').trim();
    this.filters.draftAddress.set(value ?? '');
    this.filters.draftCity.set('');
    if (this.cityInputTimer) {
      clearTimeout(this.cityInputTimer);
    }
    if (query.length < 2) {
      this.citySuggestions.set([]);
      return;
    }
    this.cityInputTimer = setTimeout(() => {
      this.geocodingService.search(query, 'address').subscribe({
        next: (suggestions) => this.citySuggestions.set(suggestions),
        error: () => this.citySuggestions.set([]),
      });
    }, 300);
  }

  selectCitySuggestion(suggestion: CitySuggestion): void {
    this.geocodingService.place(suggestion.placeId).subscribe({
      next: (result) => {
        if (!result) {
          return;
        }
        this.filters.setDraftLocation(result.latitude, result.longitude, result.city, result.formattedAddress);
        this.citySuggestions.set([]);
      },
    });
  }

  /** Shared by "use my current location" (GPS) and tapping a pin on the map. */
  private reverseGeocodeTo(lat: number, lng: number): void {
    this.geocodingService.reverse(lat, lng).subscribe({
      next: (result) => {
        this.filters.setDraftLocation(lat, lng, result?.city ?? '', result?.formattedAddress ?? '');
        this.locatingMe.set(false);
      },
      error: () => {
        this.filters.setDraftLocation(lat, lng);
        this.locatingMe.set(false);
      },
    });
  }

  onPinMoved(coords: { lat: number; lng: number }): void {
    this.reverseGeocodeTo(coords.lat, coords.lng);
  }

  useCurrentLocation(): void {
    if (!navigator.geolocation) {
      return;
    }
    this.locatingMe.set(true);
    navigator.geolocation.getCurrentPosition(
      (position) => this.reverseGeocodeTo(position.coords.latitude, position.coords.longitude),
      () => this.locatingMe.set(false),
    );
  }

  readonly applyLocationFlash = createApplyFlash(() => this.isOpen.set(false));

  applyLocationFilter(): void {
    this.filters.applyLocation();
    this.applyLocationFlash.trigger();
  }


  resetLocationFilter(): void {
    this.filters.resetLocation();
    this.isOpen.set(false);
  }

  saveLocationFilter(): void {
    this.filters.saveLocation();
    this.isOpen.set(false);
  }
}
