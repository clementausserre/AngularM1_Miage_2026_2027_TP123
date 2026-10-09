import { Injectable, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Page } from '../models/page.model';
import { FriendKind, FriendLookup, Friendship } from '../models/friend.model';

@Injectable({ providedIn: 'root' })
export class FriendService {
  private readonly http = inject(HttpClient);
  readonly incoming = signal(0);
  code() { return this.http.get<{ code: string }>('/api/friends/code'); }
  summary() { return this.http.get<{ incoming: number }>('/api/friends/summary'); }
  list(kind: FriendKind, page = 1) { return this.http.get<Page<Friendship>>('/api/friends', { params: { kind, page } }); }
  lookup(code: string) { return this.http.post<FriendLookup>('/api/friends/lookup', { code }); }
  send(code: string) { return this.http.post<{ id: string; status: string }>('/api/friends/requests', { code }); }
  accept(id: string) { return this.http.put<void>(`/api/friends/${id}/accept`, {}); }
  remove(id: string) { return this.http.delete<void>(`/api/friends/${id}`); }
}
