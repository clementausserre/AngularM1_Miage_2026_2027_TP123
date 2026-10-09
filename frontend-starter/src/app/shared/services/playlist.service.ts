import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Page } from '../models/page.model';
import { Playlist, PlaylistSummary } from '../models/playlist.model';

@Injectable({ providedIn: 'root' })
export class PlaylistService {
  private readonly http = inject(HttpClient);
  list(page = 1) { return this.http.get<Page<PlaylistSummary>>('/api/playlists', { params: { page } }); }
  get(id: string) { return this.http.get<Playlist>(`/api/playlists/${id}`); }
  create(name: string) { return this.http.post<Playlist>('/api/playlists', { name }); }
  update(id: string, version: number, change: { name?: string; trackIds?: string[] }) {
    return this.http.put<Playlist>(`/api/playlists/${id}`, { ...change, version });
  }
  add(id: string, trackId: string) { return this.http.post<Playlist>(`/api/playlists/${id}/tracks`, { trackId }); }
  remove(id: string) { return this.http.delete<void>(`/api/playlists/${id}`); }
}
