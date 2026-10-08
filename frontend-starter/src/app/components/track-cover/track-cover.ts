import { Component, effect, inject, input, signal } from '@angular/core';
import { TrackService } from '../../shared/services/track.service';

/** Owns its authenticated request and releases its Blob when no longer displayed. */
@Component({
  selector: 'app-track-cover',
  templateUrl: './track-cover.html',
  styleUrl: './track-cover.css',
})
export class TrackCoverComponent {
  private readonly service = inject(TrackService);
  readonly trackId = input.required<string>();
  readonly version = input<string | null>(null);
  readonly url = signal('');
  readonly loading = signal(false);
  readonly failed = signal(false);

  constructor() {
    effect(onCleanup => {
      const id = this.trackId();
      const version = this.version();
      this.url.set('');
      this.failed.set(false);
      this.loading.set(!!version);
      if (!version) return;
      let objectUrl = '';
      const request = this.service.cover(id).subscribe({
        next: blob => {
          this.loading.set(false);
          if (!blob.size) { this.failed.set(true); return; }
          objectUrl = URL.createObjectURL(blob);
          this.url.set(objectUrl);
        },
        error: () => { this.loading.set(false); this.failed.set(true); },
      });
      onCleanup(() => {
        request.unsubscribe();
        if (objectUrl) URL.revokeObjectURL(objectUrl);
      });
    });
  }
}
