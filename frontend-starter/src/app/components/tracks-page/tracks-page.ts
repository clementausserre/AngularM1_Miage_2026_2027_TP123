import { HttpErrorResponse } from '@angular/common/http';
import { Component, DestroyRef, inject, signal } from '@angular/core';
import { HttpEventType } from '@angular/common/http';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { MatSnackBar } from '@angular/material/snack-bar';
import { finalize, Subscription } from 'rxjs';
import { Track } from '../../shared/models/track.model';
import { LibrarySyncService } from '../../shared/services/library-sync.service';
import { PlayerService } from '../../shared/services/player.service';
import { TrackService } from '../../shared/services/track.service';
import { CoverPickerComponent } from '../cover-picker/cover-picker';
import { TrackCoverComponent } from '../track-cover/track-cover';
import { CoverEditorComponent } from '../cover-editor/cover-editor';
import { coverFileError } from '../../shared/utils/cover-file';
import { uploadErrorMessage } from '../../shared/utils/upload-error-message';

@Component({
  imports: [ReactiveFormsModule, CoverPickerComponent, TrackCoverComponent, CoverEditorComponent],
  templateUrl: './tracks-page.html',
  styleUrl: './tracks-page.css',
})
export class TracksPageComponent {
  private readonly service = inject(TrackService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly snackBar = inject(MatSnackBar);
  private readonly sync = inject(LibrarySyncService);
  private listRequest?: Subscription;
  readonly player = inject(PlayerService);
  readonly tracks = signal<Track[]>([]);
  readonly page = signal(1);
  readonly pages = signal(1);
  readonly loading = signal(false);
  readonly error = signal('');
  readonly audioUrl = this.player.audioUrl;
  readonly selectedTrack = this.player.selectedTrack;
  readonly audioLoading = this.player.audioLoading;
  readonly audioError = this.player.audioError;
  readonly uploading = signal(false);
  readonly uploadProgress = signal<number | null>(null);
  readonly uploadError = signal('');
  readonly uploadSuccess = signal('');
  readonly deleteTarget = signal<Track | null>(null);
  readonly deleting = signal(false);
  readonly file = signal<File | null>(null);
  readonly coverFile = signal<File | null>(null);
  readonly coverInvalid = signal(false);
  readonly coverReset = signal(0);
  readonly title = new FormControl('', { nonNullable: true });

  constructor() {
    this.load();
    // Ajout ou suppression dans un autre onglet, ou retour sur cet onglet : la liste se met à jour seule.
    this.sync.changes.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(() => this.load({ silent: true }));
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
    this.resetCover();
  }

  private resetCover(): void {
    this.coverFile.set(null);
    this.coverInvalid.set(false);
    this.coverReset.update(value => value + 1);
  }

  coverUpdated(updated: Track): void {
    // A response started before this edit must not restore the old cover.
    this.listRequest?.unsubscribe();
    this.tracks.update(tracks => tracks.map(track => track.id === updated.id ? updated : track));
    this.player.updateTrack(updated);
    this.sync.notifyChanged();
  }

  /**
   * Charge la page courante. En mode silencieux (synchronisation entre onglets),
   * la liste affichée reste visible pendant la requête et un échec la conserve.
   */
  load({ silent = false } = {}): void {
    this.listRequest?.unsubscribe();
    if (!silent) {
      this.error.set('');
      this.loading.set(true);
    }
    this.listRequest = this.service.list(this.page()).pipe(
      takeUntilDestroyed(this.destroyRef), finalize(() => this.loading.set(false)),
    ).subscribe({
      next: response => {
        // La page courante a disparu (pistes supprimées ailleurs) : afficher la dernière page existante.
        if (!response.items.length && this.page() > response.pages) {
          this.page.set(response.pages);
          this.load({ silent });
          return;
        }
        this.error.set('');
        this.tracks.set(response.items);
        this.pages.set(response.pages);
        console.debug('[TracksPage] Pistes chargées', response.items.length);
      },
      error: (error: HttpErrorResponse) => {
        console.error('[TracksPage] Chargement HTTP', error.status);
        if (silent) return;
        this.error.set('Impossible de charger les pistes. Vérifiez votre connexion puis réessayez.');
      },
    });
  }

  refresh(): void {
    const selected = this.selectedTrack();
    if (selected) this.player.refreshSelectedTrack(selected.id);
    this.load();
  }

  go(page: number): void {
    if (this.loading() || page < 1 || page > this.pages()) return;
    this.page.set(page);
    this.load();
  }

  upload(input: HTMLInputElement): void {
    if (this.uploading() || this.coverInvalid()) return;
    const file = this.file();
    this.uploadSuccess.set('');
    this.uploadError.set(file ? this.fileError(file) : 'Choisissez un fichier audio.');
    if (!file || this.uploadError()) return;
    const cover = this.coverFile();
    if (cover) {
      this.uploadError.set(coverFileError(cover));
      if (this.uploadError()) return;
    }
    this.uploading.set(true);
    this.uploadProgress.set(null);
    this.title.disable();
    this.service.upload(file, this.title.value.trim() || file.name, cover).pipe(
      takeUntilDestroyed(this.destroyRef),
      finalize(() => { this.uploading.set(false); this.uploadProgress.set(null); this.title.enable(); }),
    ).subscribe({
      next: event => {
        if (event.type === HttpEventType.UploadProgress) {
          this.uploadProgress.set(event.total && event.total > 0
            ? Math.min(100, Math.floor(100 * event.loaded / event.total)) : null);
          return;
        }
        if (event.type !== HttpEventType.Response) return;
        console.debug('[TracksPage] Import réussi', event.body?.id);
        this.title.reset();
        this.file.set(null);
        this.resetCover();
        input.value = '';
        this.uploadSuccess.set('Votre morceau a été importé.');
        this.sync.notifyChanged();
        this.page.set(1);
        this.load();
      },
      error: (error: HttpErrorResponse) => {
        console.error('[TracksPage] Import HTTP', error.status);
        this.uploadError.set(uploadErrorMessage(error));
      },
    });
  }

  requestDelete(track: Track, dialog: HTMLDialogElement): void {
    if (this.deleting()) return;
    this.deleteTarget.set(track);
    this.snackBar.dismiss();
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
    this.snackBar.dismiss();
    this.service.delete(track.id).pipe(
      takeUntilDestroyed(this.destroyRef), finalize(() => this.deleting.set(false)),
    ).subscribe({
      next: () => {
        console.debug('[TracksPage] Piste supprimée', track.id);
        this.sync.notifyChanged();
        this.removeFromScreen(track, dialog, focusTarget);
        this.notify(`« ${track.title} » a été supprimé.`);
      },
      error: (error: HttpErrorResponse) => {
        console.error('[TracksPage] Suppression HTTP', error.status);
        if (error.status === 404) {
          // Piste déjà supprimée (autre onglet) ou appartenant à un autre utilisateur :
          // le backend ne distingue pas les deux cas, la carte affichée est donc obsolète.
          this.removeFromScreen(track, dialog, focusTarget);
          this.notify('Ce morceau est introuvable ou vous n’y avez pas accès. La liste a été actualisée.');
          return;
        }
        // Erreur réseau ou serveur : la confirmation reste ouverte pour pouvoir réessayer.
        this.notify(error.status === 0
          ? 'Serveur inaccessible. Vérifiez votre connexion puis réessayez.'
          : 'La suppression n’a pas pu être confirmée. Actualisez la liste avant de réessayer.');
      },
    });
  }

  private removeFromScreen(track: Track, dialog: HTMLDialogElement, focusTarget: HTMLElement): void {
    if (this.selectedTrack()?.id === track.id) this.player.stop();
    this.deleteTarget.set(null);
    dialog.close();
    focusTarget.focus();
    if (this.tracks().length === 1 && this.page() > 1) this.page.update(page => page - 1);
    this.load();
  }

  private notify(message: string): void {
    this.snackBar.open(message, 'Fermer', { duration: 5000 });
  }

  play(track: Track): void { this.player.play(track); }

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
