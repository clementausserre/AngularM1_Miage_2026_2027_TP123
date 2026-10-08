/** Audio track metadata returned by the API. */
export interface Track {
  id: string;
  title: string;
  originalName: string;
  mimeType: string;
  size: number;
  createdAt: string;
  cover?: TrackCover | null;
}

export interface TrackCover {
  mimeType: string;
  size: number;
  width: number;
  height: number;
  version: string;
}
