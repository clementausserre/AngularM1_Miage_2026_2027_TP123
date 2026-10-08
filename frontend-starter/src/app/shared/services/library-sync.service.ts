import { DestroyRef, DOCUMENT, inject, Injectable } from '@angular/core';
import { EMPTY, filter, fromEvent, map, merge, Observable } from 'rxjs';

/**
 * Keeps the library up to date across browser tabs.
 * BroadcastChannel reaches the other tabs of the same origin (never the sender);
 * visibilitychange covers changes made from another browser or device.
 */
@Injectable({ providedIn: 'root' })
export class LibrarySyncService {
  private readonly document = inject(DOCUMENT);
  private readonly channel = typeof BroadcastChannel === 'undefined' ? null : new BroadcastChannel('gpc-library');

  /** Emits when the visible tab should reload: another tab changed the library, or the user came back to this tab. */
  readonly changes: Observable<void> = merge(
    this.channel ? fromEvent(this.channel, 'message') : EMPTY,
    fromEvent(this.document, 'visibilitychange'),
  ).pipe(
    // A hidden tab waits: it will reload when it becomes visible again.
    filter(() => this.document.visibilityState === 'visible'),
    map(() => undefined),
  );

  constructor() {
    inject(DestroyRef).onDestroy(() => this.channel?.close());
  }

  /** Tells the other tabs that a track was added or deleted. The message carries no data. */
  notifyChanged(): void {
    this.channel?.postMessage('changed');
  }
}
