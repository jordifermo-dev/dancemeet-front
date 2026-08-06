import { Component, inject, signal } from '@angular/core';
import { IonSearchbar, IonIcon, IonButton, IonModal, IonRange } from '@ionic/angular/standalone';
import { TranslatePipe } from '@ngx-translate/core';
import { addIcons } from 'ionicons';
import { locationOutline, locateOutline } from 'ionicons/icons';
import { CitySuggestion, GeocodingService } from '../../services/geocoding.service';
import { ExplorerFiltersService } from '../../pages/explorer/explorer-filters.service';
import { createApplyFlash } from '../success-flash';
import { FilterSheetHeaderComponent } from '../filter-sheet-header/filter-sheet-header.component';
import { FilterActionsRowComponent } from '../filter-actions-row/filter-actions-row.component';

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
    IonSearchbar,
    IonIcon,
    IonButton,
    IonModal,
    IonRange,
    TranslatePipe,
    FilterSheetHeaderComponent,
    FilterActionsRowComponent,
  ],
})
export class LocationFilterButtonComponent {
  private readonly geocodingService = inject(GeocodingService);
  readonly filters = inject(ExplorerFiltersService);

  readonly isOpen = signal(false);
  readonly citySuggestions = signal<CitySuggestion[]>([]);
  readonly locatingMe = signal(false);
  private cityInputTimer: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    addIcons({ locationOutline, locateOutline });
  }

  open(): void {
    this.citySuggestions.set([]);
    this.filters.draftDistanceRange.set(this.filters.appliedDistanceRange());
    this.filters.draftLatitude.set(this.filters.appliedLatitude());
    this.filters.draftLongitude.set(this.filters.appliedLongitude());
    this.filters.draftCity.set(this.filters.appliedCity());
    this.isOpen.set(true);
  }

  onDistanceChange(event: Event): void {
    const value = (event as CustomEvent<{ value: number }>).detail.value;
    this.filters.setDraftDistanceRange(value);
  }

  onCityInput(value: string | null | undefined): void {
    const query = (value ?? '').trim();
    this.filters.draftCity.set(value ?? '');
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
        this.filters.setDraftLocation(result.latitude, result.longitude, result.city);
        this.citySuggestions.set([]);
      },
    });
  }

  useCurrentLocation(): void {
    if (!navigator.geolocation) {
      return;
    }
    this.locatingMe.set(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const lat = position.coords.latitude;
        const lng = position.coords.longitude;
        this.geocodingService.reverse(lat, lng).subscribe({
          next: (result) => {
            this.filters.setDraftLocation(lat, lng, result?.city ?? '');
            this.locatingMe.set(false);
          },
          error: () => {
            this.filters.setDraftLocation(lat, lng);
            this.locatingMe.set(false);
          },
        });
      },
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
