import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';
import { CreateEventPayload, Event, EventSearchParams, EventWithCreatorName, UpdateEventPayload } from '../models';

@Injectable({ providedIn: 'root' })
export class EventService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = `${environment.apiUrl}/api/events`;

  getById(id: string): Observable<EventWithCreatorName> {
    return this.http.get<EventWithCreatorName>(`${this.baseUrl}/${id}/detail`);
  }

  createEvent(payload: CreateEventPayload): Observable<Event> {
    return this.http.post<Event>(this.baseUrl, payload);
  }

  updateEvent(id: string, payload: UpdateEventPayload): Observable<{ success: boolean }> {
    return this.http.put<{ success: boolean }>(`${this.baseUrl}/${id}`, payload);
  }

  search(params: EventSearchParams): Observable<EventWithCreatorName[]> {
    const query: Record<string, string | number> = {};
    // !== undefined (not .length) - Explorer always has an opinion on which
    // disciplines/types to show, so an empty array must reach the backend as
    // an explicit "zero selected" rather than being silently dropped (which
    // the backend would otherwise read as "don't filter by this at all").
    if (params.disciplineIds !== undefined) {
      query['disciplineIds'] = params.disciplineIds.join(',');
    }
    if (params.typeIds !== undefined) {
      query['typeIds'] = params.typeIds.join(',');
    }
    if (params.statuses?.length) {
      query['statuses'] = params.statuses.join(',');
    }
    if (params.dateFrom !== undefined) {
      query['dateFrom'] = params.dateFrom;
    }
    if (params.dateTo !== undefined) {
      query['dateTo'] = params.dateTo;
    }
    if (params.latitude !== undefined) {
      query['latitude'] = params.latitude;
    }
    if (params.longitude !== undefined) {
      query['longitude'] = params.longitude;
    }
    if (params.radius !== undefined) {
      query['radius'] = params.radius;
    }
    if (params.search) {
      query['search'] = params.search;
    }
    if (params.priceOptions !== undefined) {
      query['priceOptions'] = params.priceOptions.join(',');
    }
    return this.http.get<EventWithCreatorName[]>(`${this.baseUrl}/search/list`, { params: query });
  }
}
