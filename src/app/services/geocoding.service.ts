import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';

export interface CitySuggestion {
  placeId: string;
  description: string;
}

export interface GeocodeResult {
  city: string;
  formattedAddress: string;
  latitude: number;
  longitude: number;
}

export interface ReverseGeocodeResult {
  city: string;
  formattedAddress: string;
}

@Injectable({ providedIn: 'root' })
export class GeocodingService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = `${environment.apiUrl}/api/geocoding`;

  reverse(latitude: number, longitude: number): Observable<ReverseGeocodeResult | null> {
    return this.http.get<ReverseGeocodeResult | null>(`${this.baseUrl}/reverse`, {
      params: { lat: latitude, lng: longitude },
    });
  }

  /** `type: 'address'` returns specific venues/street addresses instead of
   * just cities (event location editing vs. the city-only pickers elsewhere). */
  search(query: string, type?: 'address'): Observable<CitySuggestion[]> {
    const params: Record<string, string> = { query };
    if (type) {
      params['type'] = type;
    }
    return this.http.get<CitySuggestion[]>(`${this.baseUrl}/search`, { params });
  }

  place(placeId: string): Observable<GeocodeResult | null> {
    return this.http.get<GeocodeResult | null>(`${this.baseUrl}/place`, { params: { placeId } });
  }
}
