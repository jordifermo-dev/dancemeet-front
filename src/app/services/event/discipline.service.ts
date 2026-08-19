import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import { Discipline } from '../../models';

@Injectable({ providedIn: 'root' })
export class DisciplineService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = `${environment.apiUrl}/api/disciplines`;

  getAll(): Observable<Discipline[]> {
    return this.http.get<Discipline[]>(this.baseUrl);
  }
}
