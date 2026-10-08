import { HttpErrorResponse } from '@angular/common/http';
import { Component, DestroyRef, inject, input, output, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { finalize, map } from 'rxjs';
import { Track } from '../../shared/models/track.model';
import { TrackService } from '../../shared/services/track.service';
import { uploadErrorMessage } from '../../shared/utils/upload-error-message';
import { CoverPickerComponent } from '../cover-picker/cover-picker';

@Component({
  selector: 'app-cover-editor',
  imports: [CoverPickerComponent],
  templateUrl: './cover-editor.html',
  styleUrl: './cover-editor.css',
})
export class CoverEditorComponent {
  private readonly service = inject(TrackService);
  private readonly destroyRef = inject(DestroyRef);
  readonly track = input.required<Track>();
  readonly disabled = input(false);
  readonly updated = output<Track>();
  readonly editing = signal(false);
  readonly file = signal<File | null>(null);
  readonly invalid = signal(false);
  readonly busy = signal(false);
  readonly error = signal('');
  readonly success = signal('');

  toggle(): void {
    if (this.busy() || this.disabled()) return;
    this.file.set(null);
    this.invalid.set(false);
    this.error.set('');
    this.success.set('');
    this.editing.update(value => !value);
  }

  save(remove = false): void {
    if (this.busy() || this.disabled() || (!remove && (!this.file() || this.invalid()))) return;
    const track = this.track();
    this.busy.set(true);
    this.error.set('');
    this.success.set('');
    const request = remove
      ? this.service.removeCover(track.id).pipe(map(() => ({ ...track, cover: null })))
      : this.service.setCover(track.id, this.file()!);
    request.pipe(takeUntilDestroyed(this.destroyRef), finalize(() => this.busy.set(false))).subscribe({
      next: updated => {
        this.updated.emit(updated);
        this.editing.set(false);
        this.file.set(null);
        this.invalid.set(false);
        this.success.set(remove ? 'Couverture retirée.' : 'Couverture enregistrée.');
      },
      error: (error: HttpErrorResponse) => {
        console.error('[CoverEditor] Modification HTTP', error.status);
        this.error.set(uploadErrorMessage(error));
      },
    });
  }
}
