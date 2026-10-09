import { HttpErrorResponse } from '@angular/common/http';
import { DestroyRef, Injectable, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { MatSnackBar } from '@angular/material/snack-bar';
import { EMPTY, Subscription, expand, finalize, reduce } from 'rxjs';
import { Track } from '../models/track.model';
import { TrackService } from './track.service';
import { LibrarySyncService } from './library-sync.service';
import { Playlist } from '../models/playlist.model';

/** Owns the authenticated audio download independently of routed pages. */
@Injectable({ providedIn: 'root' })
export class PlayerService {
  private notify(message: string): void {
    this.snackBar.open(message, 'Fermer', { duration: 5000 });
  }
  private readonly service = inject(TrackService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly snackBar = inject(MatSnackBar);
  private readonly sync = inject(LibrarySyncService);
  private audioRequest?: Subscription;
  private selectedTrackRequest?: Subscription;
  private nextRequest?: Subscription;
  private element?: HTMLAudioElement;
  readonly audioUrl = signal('');
  readonly selectedTrack = signal<Track | null>(null);
  readonly audioLoading = signal(false);
  readonly audioError = signal('');
  readonly advancing = signal(false);
  readonly nextError = signal('');
  readonly playlist = signal<{ id: string; name: string } | null>(null);
  private queue: Track[] = [];
  private selection = 0;

  playPlaylist(playlist: Playlist, index = 0): void {
    const track = playlist.tracks[index];
    if (!track) return;
    this.queue = [...playlist.tracks];
    this.playlist.set({ id: playlist.id, name: playlist.name });
    this.loadTrack(track);
  }

  retry(): void {
    const track = this.selectedTrack();
    if (track) this.loadTrack(track);
  }

  /** Resolve library order, including tracks outside the currently displayed page. */
  advance(): void {
    const current = this.selectedTrack();
    if (!current || this.advancing() || this.audioLoading()) return;
    if (this.playlist()) {
      const index = this.queue.findIndex(track => track.id === current.id);
      const next = index >= 0 ? this.queue[index + 1] : undefined;
      if (next) this.loadTrack(next);
      return;
    }
    this.nextError.set('');
    this.advancing.set(true);
    this.nextRequest = this.service.list(1).pipe(
      expand((page, index) => index + 2 <= page.pages ? this.service.list(index + 2) : EMPTY),
      reduce((tracks, page) => [...tracks, ...page.items], [] as Track[]),
      takeUntilDestroyed(this.destroyRef),
      finalize(() => this.advancing.set(false)),
    ).subscribe({
      next: tracks => {
        if (this.selectedTrack()?.id !== current.id) return;
        const ordered = [...new Map(tracks.map(track => [track.id, track])).values()];
        const index = ordered.findIndex(track => track.id === current.id);
        const next = index >= 0 ? ordered[index + 1] : undefined;
        if (next) this.play(next);
      },
      error: () => this.nextError.set('Impossible de charger le morceau suivant. Réessayez.'),
    });
  }

  constructor() {
    this.destroyRef.onDestroy(() => this.stop());
    this.sync.changes.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(() => {
      const track = this.selectedTrack();
      if (track) this.refreshSelectedTrack(track.id);
    });
  }

  attach(element: HTMLAudioElement): void { this.element = element; }

  stop(): void {
    this.selection++;
    this.queue = [];
    this.playlist.set(null);
    this.nextRequest?.unsubscribe();
    this.nextError.set('');
    this.selectedTrackRequest?.unsubscribe();
    this.audioRequest?.unsubscribe();
    this.releaseAudio();
    this.selectedTrack.set(null);
    this.audioError.set('');
  }

  updateTrack(track: Track): void {
    if (this.selectedTrack()?.id !== track.id) return;
    this.selectedTrackRequest?.unsubscribe();
    this.selectedTrack.set(track);
  }

  private releaseAudio(): void {
    this.element?.pause();
    this.element?.removeAttribute('src');
    this.element?.load();
    const url = this.audioUrl();
    this.audioUrl.set('');
    if (url) URL.revokeObjectURL(url);
  }

  refreshSelectedTrack(id: string): void {
    this.selectedTrackRequest?.unsubscribe();
    this.selectedTrackRequest = this.service.get(id).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: track => {
        if (this.selectedTrack()?.id === id) this.selectedTrack.set(track);
      },
      error: (error: HttpErrorResponse) => {
        console.warn('[Player] Actualisation du morceau en lecture', error.status);
        if (error.status !== 404 || this.selectedTrack()?.id !== id) return;
        this.stop();
        this.notify('Le morceau en lecture n’est plus disponible.');
      },
    });
  }

  play(track: Track): void {
    this.queue = [];
    this.playlist.set(null);
    this.loadTrack(track);
  }

  private loadTrack(track: Track): void {
    const selection = ++this.selection;
    this.nextRequest?.unsubscribe();
    this.nextError.set('');
    if (this.selectedTrack()?.id === track.id && this.audioUrl() && !this.audioError()) {
      const element = this.element;
      if (element) void element.play().catch(() => { /* Native controls remain available. */ });
      return;
    }
    this.selectedTrackRequest?.unsubscribe();
    this.audioRequest?.unsubscribe();
    this.releaseAudio();
    this.selectedTrack.set(track);
    this.audioError.set('');
    this.audioLoading.set(true);
    this.audioRequest = this.service.audio(track.id).pipe(
      takeUntilDestroyed(this.destroyRef), finalize(() => this.audioLoading.set(false)),
    ).subscribe({
      next: blob => {
        if (!blob.size) {
          this.audioError.set('Le fichier audio reçu est vide.');
          return;
        }
        this.audioUrl.set(URL.createObjectURL(blob));
        console.debug('[Player] Audio chargé', track.id);
      },
      error: (error: HttpErrorResponse) => {
        console.error('[Player] Audio HTTP', error.status);
        if (error.status === 404 && this.playlist()) {
          // Wait for finalize before advancing so an old request cannot clear the next loading state.
          queueMicrotask(() => {
            if (this.selection === selection && this.selectedTrack()?.id === track.id && this.playlist()) this.advance();
          });
        }
        this.audioError.set(error.status === 404
          ? 'Ce fichier audio est introuvable ou vous n’y avez pas accès.'
          : 'Impossible de télécharger ce morceau. Vérifiez votre connexion et réessayez.');
      },
    });
  }

  playbackError(): void {
    this.audioError.set('Le navigateur ne peut pas lire ce fichier. Il est peut-être endommagé ou son encodage n’est pas pris en charge.');
  }

}
