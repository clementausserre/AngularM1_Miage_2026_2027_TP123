import { Component, DestroyRef, inject, signal } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { FormControl, ReactiveFormsModule, Validators } from '@angular/forms';
import { finalize, Subscription } from 'rxjs';
import { PlaylistService } from '../../shared/services/playlist.service';
import { PlayerService } from '../../shared/services/player.service';
import { Playlist, PlaylistSummary } from '../../shared/models/playlist.model';
import { TrackCoverComponent } from '../track-cover/track-cover';

@Component({ imports: [RouterLink, ReactiveFormsModule, TrackCoverComponent], templateUrl: './playlists-page.html', styleUrl: './playlists-page.css' })
export class PlaylistsPageComponent {
  private readonly service = inject(PlaylistService);
  readonly player = inject(PlayerService);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);
  private request?: Subscription;
  private mutation?: Subscription;
  readonly id = signal<string | null>(null);
  readonly items = signal<PlaylistSummary[]>([]);
  readonly selected = signal<Playlist | null>(null);
  readonly page = signal(1);
  readonly pages = signal(1);
  readonly loading = signal(false);
  readonly busy = signal(false);
  readonly error = signal('');
  readonly feedback = signal('');
  readonly deleting = signal<PlaylistSummary | null>(null);
  readonly editing = signal(false);
  readonly name = new FormControl('', { nonNullable: true, validators: [Validators.required, Validators.maxLength(100)] });

  constructor() {
    inject(ActivatedRoute).paramMap.pipe(takeUntilDestroyed()).subscribe(params => {
      this.mutation?.unsubscribe(); this.busy.set(false);
      this.id.set(params.get('id')); this.selected.set(null); this.editing.set(false); this.page.set(1); this.feedback.set(''); this.load();
    });
  }
  load(): void {
    if (this.busy()) return;
    this.request?.unsubscribe(); this.loading.set(true); this.error.set('');
    const id = this.id();
    if (id) {
      this.request = this.service.get(id).pipe(takeUntilDestroyed(this.destroyRef), finalize(() => this.loading.set(false))).subscribe({
        next: playlist => this.selected.set(playlist),
        error: error => { this.selected.set(null); this.error.set(this.message(error)); },
      });
    } else {
      this.request = this.service.list(this.page()).pipe(takeUntilDestroyed(this.destroyRef), finalize(() => this.loading.set(false))).subscribe({
        next: result => {
          if (result.page > result.pages) { this.page.set(result.pages); this.load(); return; }
          this.items.set(result.items); this.pages.set(result.pages);
        },
        error: error => this.error.set(this.message(error)),
      });
    }
  }
  go(page: number): void { if (!this.busy() && !this.loading() && page >= 1 && page <= this.pages()) { this.page.set(page); this.load(); } }
  openCreate(dialog: HTMLDialogElement): void { this.name.reset(); this.error.set(''); dialog.showModal(); }
  close(dialog: HTMLDialogElement): void { if (!this.busy()) dialog.close(); }
  create(dialog: HTMLDialogElement): void {
    if (this.busy() || this.name.invalid || !this.name.value.trim()) return;
    this.busy.set(true); this.error.set(''); this.name.disable();
    this.service.create(this.name.value.trim()).pipe(takeUntilDestroyed(this.destroyRef), finalize(() => { this.busy.set(false); this.name.enable(); })).subscribe({
      next: playlist => { dialog.close(); this.busy.set(false); void this.router.navigate(['/playlists', playlist.id]); },
      error: error => this.error.set(this.message(error)),
    });
  }
  startRename(): void { this.name.setValue(this.selected()?.name ?? ''); this.editing.set(true); }
  rename(): void { if (this.name.valid && this.name.value.trim()) this.update({ name: this.name.value.trim() }); }
  move(index: number, delta: number): void {
    const playlist = this.selected(); if (!playlist) return;
    const ids = playlist.tracks.map(track => track.id), target = index + delta;
    if (target < 0 || target >= ids.length) return;
    [ids[index], ids[target]] = [ids[target], ids[index]];
    this.update({ trackIds: ids });
  }
  removeTrack(id: string): void { this.update({ trackIds: this.selected()?.tracks.filter(track => track.id !== id).map(track => track.id) ?? [] }); }
  private update(change: { name?: string; trackIds?: string[] }): void {
    const playlist = this.selected(); if (!playlist || this.busy() || this.loading()) return;
    this.busy.set(true); this.error.set(''); this.feedback.set('');
    this.mutation = this.service.update(playlist.id, playlist.version, change).pipe(takeUntilDestroyed(this.destroyRef), finalize(() => this.busy.set(false))).subscribe({
      next: saved => { this.selected.set(saved); this.editing.set(false); this.feedback.set('Playlist enregistrée.'); },
      error: error => this.error.set(this.message(error)),
    });
  }
  requestDelete(playlist: PlaylistSummary, dialog: HTMLDialogElement): void { this.deleting.set(playlist); this.error.set(''); dialog.showModal(); }
  confirmDelete(dialog: HTMLDialogElement): void {
    const playlist = this.deleting(); if (!playlist || this.busy()) return;
    this.busy.set(true); this.error.set('');
    this.service.remove(playlist.id).pipe(takeUntilDestroyed(this.destroyRef), finalize(() => this.busy.set(false))).subscribe({
      next: () => {
        if (this.player.playlist()?.id === playlist.id) this.player.stop();
        dialog.close(); this.deleting.set(null); this.busy.set(false);
        if (this.id()) void this.router.navigateByUrl('/playlists'); else this.load();
        this.feedback.set('Playlist supprimée. Vos morceaux sont conservés.');
      },
      error: error => this.error.set(this.message(error)),
    });
  }
  private message(error: HttpErrorResponse): string {
    return [400, 404, 409].includes(error.status) && typeof error.error?.message === 'string' ? error.error.message : 'Opération impossible. Vérifiez votre connexion et réessayez.';
  }
}
