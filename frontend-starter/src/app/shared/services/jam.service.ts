import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Jam, JamKind, JamSummary } from '../models/jam.model';
import { Page } from '../models/page.model';

@Injectable({ providedIn: 'root' })
export class JamService {
  private readonly http = inject(HttpClient);
  list(kind: JamKind, page = 1) { return this.http.get<Page<JamSummary>>('/api/jams', { params: { kind, page } }); }
  get(id: string) { return this.http.get<Jam>(`/api/jams/${id}`); }
  create(name: string) { return this.http.post<{ id: string }>('/api/jams', { name }); }
  invite(id: string, userId: string) { return this.http.post<void>(`/api/jams/${id}/invitations`, { userId }); }
  accept(id: string) { return this.http.put<void>(`/api/jams/${id}/membership`, {}); }
  decline(id: string) { return this.http.delete<void>(`/api/jams/${id}/invitations/me`); }
  leave(id: string) { return this.http.delete<void>(`/api/jams/${id}/membership`); }
}
