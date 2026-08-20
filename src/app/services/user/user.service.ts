import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, catchError, of } from 'rxjs';
import { environment } from '../../../environments/environment';
import { CreateUserPayload, UpdateUserPayload, User } from '../../models';

@Injectable({ providedIn: 'root' })
export class UserService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = `${environment.apiUrl}/api/users`;

  createUser(payload: CreateUserPayload): Observable<User> {
    return this.http.post<User>(this.baseUrl, payload);
  }

  updateUser(id: string, payload: UpdateUserPayload): Observable<{ success: boolean }> {
    return this.http.put<{ success: boolean }>(`${this.baseUrl}/${id}`, payload);
  }

  getByEmail(email: string): Observable<User | null> {
    return this.http.get<User>(`${this.baseUrl}/email/${encodeURIComponent(email)}`).pipe(
      catchError((err: HttpErrorResponse) => {
        if (err.status === 404) {
          return of(null);
        }
        throw err;
      }),
    );
  }

  getById(id: string): Observable<User | null> {
    return this.http.get<User>(`${this.baseUrl}/${id}`).pipe(
      catchError((err: HttpErrorResponse) => {
        if (err.status === 404) {
          return of(null);
        }
        throw err;
      }),
    );
  }

  /** Used by the "invitar gestor" search - requires a real query, an empty
   * one would otherwise match every user (see the backend's own guard). */
  searchUsers(query: string): Observable<User[]> {
    return this.http.get<User[]>(`${this.baseUrl}/search/list`, { params: { q: query } });
  }
}
