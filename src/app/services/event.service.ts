import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';
import {
  CreateEventPayload,
  CreateEventSeriesPayload,
  Event,
  EventSearchParams,
  EventWithCreatorName,
  PatchEventSeriesPayload,
  RecurrenceRule,
  UpdateEventPayload,
} from '../models';

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

  createSeries(payload: CreateEventSeriesPayload): Observable<{ seriesId: string; events: Event[] }> {
    return this.http.post<{ seriesId: string; events: Event[] }>(`${this.baseUrl}/series`, payload);
  }

  getSeries(seriesId: string): Observable<Event[]> {
    return this.http.get<Event[]>(`${this.baseUrl}/series/${seriesId}`);
  }

  updateSeries(seriesId: string, patch: PatchEventSeriesPayload): Observable<{ modifiedCount: number }> {
    return this.http.patch<{ modifiedCount: number }>(`${this.baseUrl}/series/${seriesId}`, patch);
  }

  deleteSeries(seriesId: string): Observable<{ deletedCount: number }> {
    return this.http.delete<{ deletedCount: number }>(`${this.baseUrl}/series/${seriesId}`);
  }

  /** Turns an already-saved single event into the first instance of a new
   * series - keeps its id, generates the rest. */
  attachRecurrence(eventId: string, recurrence: RecurrenceRule): Observable<{ seriesId: string; events: Event[] }> {
    return this.http.patch<{ seriesId: string; events: Event[] }>(`${this.baseUrl}/${eventId}/recurrence`, {
      recurrence,
    });
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
