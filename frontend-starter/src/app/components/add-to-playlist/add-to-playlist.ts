import { Component, DestroyRef, inject, input, signal } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { FormControl, ReactiveFormsModule, Validators } from '@angular/forms';
import { finalize } from 'rxjs';
import { PlaylistService } from '../../shared/services/playlist.service';
import { PlaylistSummary } from '../../shared/models/playlist.model';
import { Track } from '../../shared/models/track.model';

@Component({ selector: 'app-add-to-playlist', imports: [RouterLink, ReactiveFormsModule], templateUrl: './add-to-playlist.html', styleUrl: './add-to-playlist.css' })
export class AddToPlaylistComponent {
  readonly track = input.required<Track>();
  private readonly service = inject(PlaylistService);
  private readonly destroyRef = inject(DestroyRef);
  readonly items = signal<PlaylistSummary[]>([]);
  readonly page = signal(1);
  readonly pages = signal(1);
  readonly loading = signal(false);
  readonly busy = signal(false);
  readonly error = signal('');
  readonly success = signal('');
  readonly name = new FormControl('', { nonNullable: true, validators: [Validators.required, Validators.maxLength(100)] });

  open(dialog: HTMLDialogElement): void {
    this.success.set(''); this.name.reset(); dialog.showModal(); this.load(1);
  }
  close(dialog: HTMLDialogElement): void { if (!this.busy()) dialog.close(); }
  load(page: number): void {
    if (this.loading() || this.busy()) return;
    this.loading.set(true); this.error.set('');
    this.service.list(page).pipe(takeUntilDestroyed(this.destroyRef), finalize(() => this.loading.set(false))).subscribe({
      next: result => { this.items.set(result.items); this.page.set(result.page); this.pages.set(result.pages); },
      error: () => this.error.set('Impossible de charger vos playlists.'),
    });
  }
  add(id: string, dialog: HTMLDialogElement): void {
    if (this.busy()) return;
    this.busy.set(true); this.error.set('');
    this.service.add(id, this.track().id).pipe(takeUntilDestroyed(this.destroyRef), finalize(() => this.busy.set(false))).subscribe({
      next: result => { this.success.set(`Morceau présent dans « ${result.name} ».`); dialog.close(); },
      error: (error: HttpErrorResponse) => this.error.set([400, 404, 409].includes(error.status) ? error.error?.message : 'Ajout impossible. Réessayez.'),
    });
  }
  create(): void {
    if (this.busy() || this.loading() || this.name.invalid || !this.name.value.trim()) return;
    this.busy.set(true); this.error.set('');
    this.service.create(this.name.value.trim()).pipe(takeUntilDestroyed(this.destroyRef), finalize(() => this.busy.set(false))).subscribe({
      next: playlist => { this.items.update(items => [playlist, ...items]); this.name.reset(); },
      error: () => this.error.set('Création impossible. Réessayez.'),
    });
  }
}
