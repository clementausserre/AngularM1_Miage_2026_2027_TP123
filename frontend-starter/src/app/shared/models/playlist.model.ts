import { Track } from './track.model';

export interface PlaylistSummary {
  id: string; name: string; version: number; createdAt: string; updatedAt: string;
  trackCount: number; preview: Track | null;
}
export interface Playlist extends PlaylistSummary { tracks: Track[]; }
