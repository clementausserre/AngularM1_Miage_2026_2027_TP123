import { Component, DestroyRef, ElementRef, effect, inject, input, output, signal, viewChild } from '@angular/core';
import { coverFileError } from '../../shared/utils/cover-file';

@Component({
  selector: 'app-cover-picker',
  templateUrl: './cover-picker.html',
  styleUrl: './cover-picker.css',
})
export class CoverPickerComponent {
  readonly disabled = input(false);
  readonly resetKey = input(0);
  readonly inputId = input.required<string>();
  readonly fileChange = output<File | null>();
  readonly invalidChange = output<boolean>();
  readonly preview = signal('');
  readonly error = signal('');
  readonly filename = signal('');
  private readonly fileInput = viewChild<ElementRef<HTMLInputElement>>('fileInput');
  private objectUrl = '';

  constructor() {
    inject(DestroyRef).onDestroy(() => this.release());
    effect(() => {
      this.resetKey();
      this.release();
      this.preview.set('');
      this.error.set('');
      this.filename.set('');
      const input = this.fileInput();
      if (input) input.nativeElement.value = '';
    });
  }

  choose(event: Event): void {
    if (this.disabled()) return;
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    // Cancelling the OS picker does not discard an existing selection.
    if (!file) return;
    this.release();
    this.preview.set('');
    this.filename.set('');
    const error = coverFileError(file);
    this.error.set(error);
    this.invalidChange.emit(!!error);
    this.fileChange.emit(error ? null : file);
    if (error) { input.value = ''; return; }
    this.filename.set(file.name);
    this.objectUrl = URL.createObjectURL(file);
    this.preview.set(this.objectUrl);
  }

  clear(): void {
    if (this.disabled()) return;
    this.release();
    this.preview.set('');
    this.error.set('');
    this.filename.set('');
    const input = this.fileInput();
    if (input) input.nativeElement.value = '';
    this.fileChange.emit(null);
    this.invalidChange.emit(false);
  }

  previewFailed(): void {
    this.release();
    this.preview.set('');
    this.error.set('Cette image ne peut pas être affichée. Choisissez un autre fichier ou retirez la sélection.');
    this.fileChange.emit(null);
    this.invalidChange.emit(true);
  }

  private release(): void {
    if (this.objectUrl) URL.revokeObjectURL(this.objectUrl);
    this.objectUrl = '';
  }
}
