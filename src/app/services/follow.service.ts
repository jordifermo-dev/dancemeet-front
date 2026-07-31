import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';
import { FollowUser } from '../models';

@Injectable({ providedIn: 'root' })
export class FollowService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = `${environment.apiUrl}/api/users`;
  private readonly followersBaseUrl = `${environment.apiUrl}/api/followers`;

  getFollowers(userId: string): Observable<FollowUser[]> {
    return this.http.get<FollowUser[]>(`${this.baseUrl}/${userId}/followers`);
  }

  getFollowing(userId: string): Observable<FollowUser[]> {
    return this.http.get<FollowUser[]>(`${this.baseUrl}/${userId}/following`);
  }

  /** userId = the one being followed, followerId = the one following. */
  unfollow(userId: string, followerId: string): Observable<{ success: boolean }> {
    return this.http.delete<{ success: boolean }>(`${this.followersBaseUrl}/${userId}/${followerId}/unfollow`);
  }

  /** userId = the one being followed, followerId = the one following. */
  follow(userId: string, followerId: string): Observable<unknown> {
    return this.http.post(`${this.followersBaseUrl}/${userId}/${followerId}/follow`, {});
  }
}
