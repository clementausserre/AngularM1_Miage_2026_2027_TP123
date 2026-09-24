import { HttpErrorResponse } from '@angular/common/http';
import { Component, DestroyRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { finalize, Subscription, timer } from 'rxjs';
import { Track } from '../../shared/models/track.model';
import { TrackService } from '../../shared/services/track.service';

@Component({
  imports: [ReactiveFormsModule],
  templateUrl: './tracks-page.html',
  styleUrl: './tracks-page.css',
})
export class TracksPageComponent {
  private readonly service = inject(TrackService);
  private readonly destroyRef = inject(DestroyRef);
  private listRequest?: Subscription;
  private audioRequest?: Subscription;
  private deleteSuccessTimer?: Subscription;
  readonly tracks = signal<Track[]>([]);
  readonly page = signal(1);
  readonly pages = signal(1);
  readonly loading = signal(false);
  readonly error = signal('');
  readonly audioUrl = signal('');
  readonly selectedTrack = signal<Track | null>(null);
  readonly audioLoading = signal(false);
  readonly audioError = signal('');
  readonly uploading = signal(false);
  readonly uploadError = signal('');
  readonly uploadSuccess = signal('');
  readonly deleteTarget = signal<Track | null>(null);
  readonly deleting = signal(false);
  readonly deleteError = signal('');
  readonly deleteSuccess = signal('');
  readonly file = signal<File | null>(null);
  readonly title = new FormControl('', { nonNullable: true });

  constructor() {
    this.destroyRef.onDestroy(() => this.releaseAudio());
    this.load();
  }

  private fileError(file: File): string {
    if (!file.size) return 'Ce fichier est vide. Choisissez un fichier audio contenant du son.';
    if (file.size > 25 * 1024 * 1024) return 'Le fichier dépasse la limite de 25 Mo.';
    const allowed = ['audio/mpeg', 'audio/wav', 'audio/x-wav', 'audio/ogg', 'audio/mp4', 'audio/x-m4a'];
    if (!/\.(mp3|wav|ogg|m4a)$/i.test(file.name) || !allowed.includes(file.type)) {
      return 'Format non pris en charge ou non reconnu. Choisissez un fichier MP3, WAV, OGG ou M4A.';
    }
    return '';
  }

  choose(event: Event): void {
    if (this.uploading()) return;
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0] ?? null;
    this.uploadSuccess.set('');
    this.uploadError.set(file ? this.fileError(file) : '');
    this.file.set(file && !this.uploadError() ? file : null);
    if (this.uploadError()) input.value = '';
  }

  clearUpload(input: HTMLInputElement): void {
    if (this.uploading()) return;
    this.file.set(null);
    this.title.reset();
    input.value = '';
    this.uploadError.set('');
    this.uploadSuccess.set('');
  }

  load(): void {
    this.listRequest?.unsubscribe();
    this.error.set('');
    this.loading.set(true);
    this.listRequest = this.service.list(this.page()).pipe(
      takeUntilDestroyed(this.destroyRef), finalize(() => this.loading.set(false)),
    ).subscribe({
      next: response => {
        this.tracks.set(response.items);
        this.pages.set(response.pages);
        console.debug('[TracksPage] Pistes chargées', response.items.length);
      },
      error: (error: HttpErrorResponse) => {
        console.error('[TracksPage] Chargement HTTP', error.status);
        this.error.set('Impossible de charger les pistes. Vérifiez votre connexion puis réessayez.');
      },
    });
  }

  refresh(): void {
    this.clearDeleteSuccess();
    this.load();
  }

  private clearDeleteSuccess(): void {
    this.deleteSuccessTimer?.unsubscribe();
    this.deleteSuccess.set('');
  }

  go(page: number): void {
    if (this.loading() || page < 1 || page > this.pages()) return;
    this.page.set(page);
    this.load();
  }

  upload(input: HTMLInputElement): void {
    if (this.uploading()) return;
    const file = this.file();
    this.uploadSuccess.set('');
    this.uploadError.set(file ? this.fileError(file) : 'Choisissez un fichier audio.');
    if (!file || this.uploadError()) return;
    this.uploading.set(true);
    this.title.disable();
    this.service.upload(file, this.title.value.trim() || file.name).pipe(
      takeUntilDestroyed(this.destroyRef),
      finalize(() => { this.uploading.set(false); this.title.enable(); }),
    ).subscribe({
      next: track => {
        console.debug('[TracksPage] Import réussi', track.id);
        this.title.reset();
        this.file.set(null);
        input.value = '';
        this.uploadSuccess.set('Votre morceau a été importé.');
        this.page.set(1);
        this.load();
      },
      error: (error: HttpErrorResponse) => {
        console.error('[TracksPage] Import HTTP', error.status);
        this.uploadError.set(error.status === 400 || error.status === 413
          ? 'Import refusé. Vérifiez le format MP3, WAV, OGG ou M4A et la limite de 25 Mo.'
          : error.status === 0 ? 'Serveur inaccessible. Votre sélection est conservée pour réessayer.'
          : 'L’import a échoué. Votre sélection est conservée pour réessayer.');
      },
    });
  }

  private releaseAudio(): void {
    const url = this.audioUrl();
    this.audioUrl.set('');
    if (url) URL.revokeObjectURL(url);
  }

  requestDelete(track: Track, dialog: HTMLDialogElement): void {
    if (this.deleting()) return;
    this.deleteTarget.set(track);
    this.deleteError.set('');
    this.clearDeleteSuccess();
    dialog.showModal();
  }

  cancelDelete(dialog: HTMLDialogElement): void {
    if (this.deleting()) return;
    dialog.close();
    this.deleteTarget.set(null);
  }

  confirmDelete(dialog: HTMLDialogElement, focusTarget: HTMLElement): void {
    const track = this.deleteTarget();
    if (!track || this.deleting()) return;
    this.deleting.set(true);
    this.deleteError.set('');
    this.service.delete(track.id).pipe(
      takeUntilDestroyed(this.destroyRef), finalize(() => this.deleting.set(false)),
    ).subscribe({
      next: () => {
        console.debug('[TracksPage] Piste supprimée', track.id);
        if (this.selectedTrack()?.id === track.id) {
          this.audioRequest?.unsubscribe();
          this.releaseAudio();
          this.selectedTrack.set(null);
          this.audioError.set('');
        }
        this.clearDeleteSuccess();
        this.deleteSuccess.set(`« ${track.title} » a été supprimé.`);
        this.deleteSuccessTimer = timer(4000).pipe(
          takeUntilDestroyed(this.destroyRef),
        ).subscribe(() => this.deleteSuccess.set(''));
        this.deleteTarget.set(null);
        dialog.close();
        focusTarget.focus();
        if (this.tracks().length === 1 && this.page() > 1) this.page.update(page => page - 1);
        this.load();
      },
      error: (error: HttpErrorResponse) => {
        console.error('[TracksPage] Suppression HTTP', error.status);
        this.deleteError.set(error.status === 404
          ? 'Ce morceau est introuvable ou vous n’y avez pas accès. Fermez cette fenêtre et actualisez la liste.'
          : error.status === 0 ? 'Serveur inaccessible. Vérifiez votre connexion puis réessayez.'
          : 'La suppression n’a pas pu être confirmée. Actualisez la liste avant de réessayer.');
      },
    });
  }

  play(track: Track): void {
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
        console.debug('[TracksPage] Audio chargé', track.id);
      },
      error: (error: HttpErrorResponse) => {
        console.error('[TracksPage] Audio HTTP', error.status);
        this.audioError.set(error.status === 404
          ? 'Ce fichier audio est introuvable ou vous n’y avez pas accès.'
          : 'Impossible de télécharger ce morceau. Vérifiez votre connexion et réessayez.');
      },
    });
  }

  playbackError(): void {
    this.audioError.set('Le navigateur ne peut pas lire ce fichier. Il est peut-être endommagé ou son encodage n’est pas pris en charge.');
  }

  formatSize(bytes: number): string {
    return bytes < 1024 * 1024
      ? `${(bytes / 1024).toLocaleString('fr-FR', { maximumFractionDigits: 1 })} Ko`
      : `${(bytes / (1024 * 1024)).toLocaleString('fr-FR', { maximumFractionDigits: 1 })} Mo`;
  }

  formatDate(value: string): string {
    return new Date(value).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' });
  }

  format(track: Track): string {
    return track.originalName.split('.').pop()?.toUpperCase() ?? 'AUDIO';
  }
}
