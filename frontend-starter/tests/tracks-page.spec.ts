import '@angular/compiler';
import { HttpErrorResponse, HttpEvent, HttpEventType, HttpResponse } from '@angular/common/http';
import { Injector, runInInjectionContext } from '@angular/core';
import { MatSnackBar } from '@angular/material/snack-bar';
import { of, Subject, throwError } from 'rxjs';
import { afterEach, expect, it, vi } from 'vitest';
import { TracksPageComponent } from '../src/app/components/tracks-page/tracks-page';
import { LibrarySyncService } from '../src/app/shared/services/library-sync.service';
import { TrackService } from '../src/app/shared/services/track.service';
import { Track } from '../src/app/shared/models/track.model';

const track: Track = { id: '1', title: 'Blues', originalName: 'blues.mp3', mimeType: 'audio/mpeg', size: 2048, createdAt: '2026-09-18T10:00:00Z' };
const cleanups: Array<() => void> = [];
afterEach(() => { cleanups.splice(0).forEach(fn => fn()); vi.restoreAllMocks(); });
function setup() {
  const upload = new Subject<HttpEvent<Track>>();
  const deletion = new Subject<void>();
  const audios: Subject<Blob>[] = [];
  const service = {
    list: vi.fn(() => of({ items: [track], page: 1, pages: 2, total: 6, limit: 5 })),
    upload: vi.fn((_file: File, _title: string, _cover?: File | null) => upload),
    delete: vi.fn(() => deletion),
    audio: vi.fn(() => { const response = new Subject<Blob>(); audios.push(response); return response; }),
  };
  const snackBar = { open: vi.fn(), dismiss: vi.fn() };
  const changes = new Subject<void>();
  const sync = { changes, notifyChanged: vi.fn() };
  const injector = Injector.create({ providers: [
    { provide: TrackService, useValue: service },
    { provide: MatSnackBar, useValue: snackBar },
    { provide: LibrarySyncService, useValue: sync },
  ] });
  const component = runInInjectionContext(injector, () => new TracksPageComponent());
  cleanups.push(() => injector.destroy());
  const input = { value: 'file', files: [new File(['audio'], 'blues.mp3', { type: 'audio/mpeg' })] };
  const choose = () => component.choose({ target: input } as unknown as Event);
  return { component, service, snackBar, sync, changes, upload, deletion, audios, input, choose, injector };
}
it.each([
  new File([], 'empty.mp3', { type: 'audio/mpeg' }),
  new File(['text'], 'file.txt', { type: 'text/plain' }),
  new File([new Uint8Array(25 * 1024 * 1024 + 1)], 'large.mp3', { type: 'audio/mpeg' }),
])('rejects an invalid file before HTTP upload', file => {
  const { component, service, input, choose } = setup();
  input.files = [file]; choose();
  component.upload(input as unknown as HTMLInputElement);
  expect(component.uploadError()).not.toBe('');
  expect(component.file()).toBeNull();
  expect(service.upload).not.toHaveBeenCalled();
});
it('uploads once, clears the native input and title and reloads page one', () => {
  const { component, service, upload, input, choose } = setup();
  choose(); component.title.setValue('  My blues  '); component.page.set(2);
  component.upload(input as unknown as HTMLInputElement);
  component.upload(input as unknown as HTMLInputElement);
  expect(service.upload).toHaveBeenCalledTimes(1);
  expect(service.upload.mock.calls[0]?.[1]).toBe('My blues');
  expect(component.uploading()).toBe(true);
  upload.next(new HttpResponse({ body: track, status: 201 })); upload.complete();
  expect(input.value).toBe('');
  expect(component.title.value).toBe('');
  expect(component.file()).toBeNull();
  expect(component.page()).toBe(1);
  expect(service.list).toHaveBeenLastCalledWith(1);
  expect(component.uploadSuccess()).not.toBe('');
  expect(component.uploading()).toBe(false);
});
it('keeps selection after a server failure', () => {
  const { component, upload, input, choose } = setup();
  choose(); component.upload(input as unknown as HTMLInputElement);
  upload.error(new HttpErrorResponse({ status: 400 }));
  expect(component.uploadError()).toContain('Import refusé');
  expect(component.file()).not.toBeNull();
  expect(component.title.enabled).toBe(true);
});

it('includes a selected cover, keeps it on error and clears it after success', () => {
  const { component, service, upload, input, choose } = setup();
  const cover = new File(['image'], 'cover.png', { type: 'image/png' });
  choose(); component.coverFile.set(cover);
  component.upload(input as unknown as HTMLInputElement);
  expect(service.upload.mock.calls[0]?.[2]).toBe(cover);
  upload.next(new HttpResponse({ body: track, status: 201 })); upload.complete();
  expect(component.coverFile()).toBeNull();
  expect(component.coverReset()).toBe(1);
});

it('keeps image selection and displays the image-specific backend rejection', () => {
  const { component, upload, input, choose } = setup();
  const cover = new File(['image'], 'cover.png', { type: 'image/png' });
  choose(); component.coverFile.set(cover); component.upload(input as unknown as HTMLInputElement);
  upload.error(new HttpErrorResponse({ status: 400, error: { message: 'Image invalide' } }));
  expect(component.coverFile()).toBe(cover);
  expect(component.uploadError()).toBe('Image invalide');
});

it('prevents import when the picker reports an invalid image and updates the playing cover without reloading audio', () => {
  const { component, service, input, choose } = setup();
  choose(); component.coverInvalid.set(true); component.upload(input as unknown as HTMLInputElement);
  expect(service.upload).not.toHaveBeenCalled();
  component.selectedTrack.set(track);
  const updated = { ...track, cover: { version: 'v2', mimeType: 'image/webp', width: 100, height: 100, size: 42 } };
  component.coverUpdated(updated);
  expect(component.tracks()[0]).toEqual(updated);
  expect(component.selectedTrack()).toEqual(updated);
  expect(service.audio).not.toHaveBeenCalled();
});

it('reports upload progress but waits for the server response before confirming success', () => {
  const { component, upload, input, choose, service } = setup();
  choose(); component.upload(input as unknown as HTMLInputElement);
  upload.next({ type: HttpEventType.Sent });
  expect(component.uploadProgress()).toBeNull();
  upload.next({ type: HttpEventType.UploadProgress, loaded: 6, total: 10 });
  expect(component.uploadProgress()).toBe(60);
  upload.next({ type: HttpEventType.UploadProgress, loaded: 10, total: 10 });
  expect(component.uploadProgress()).toBe(100);
  expect(component.uploading()).toBe(true);
  expect(component.uploadSuccess()).toBe('');
  expect(component.file()).not.toBeNull();
  expect(service.list).toHaveBeenCalledOnce();
  upload.next(new HttpResponse({ body: track, status: 201 })); upload.complete();
  expect(component.uploadSuccess()).not.toBe('');
  expect(component.uploading()).toBe(false);
  expect(component.uploadProgress()).toBeNull();
});

it('handles unknown upload size and clears progress after an error and on retry', () => {
  const { component, upload, input, choose, service } = setup();
  choose(); component.upload(input as unknown as HTMLInputElement);
  upload.next({ type: HttpEventType.UploadProgress, loaded: 6 });
  expect(component.uploadProgress()).toBeNull();
  upload.next({ type: HttpEventType.UploadProgress, loaded: 6, total: 10 });
  upload.error(new HttpErrorResponse({ status: 0 }));
  expect(component.uploadProgress()).toBeNull();
  expect(component.uploading()).toBe(false);
  expect(component.file()).not.toBeNull();
  service.upload.mockReturnValue(new Subject<HttpEvent<Track>>());
  component.upload(input as unknown as HTMLInputElement);
  expect(component.uploadProgress()).toBeNull();
  expect(component.uploading()).toBe(true);
});
it('honours the last audio selection and revokes replaced and final URLs', () => {
  const create = vi.spyOn(URL, 'createObjectURL').mockReturnValueOnce('blob:first').mockReturnValueOnce('blob:last');
  const revoke = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
  const { component, audios, injector } = setup();
  component.play(track);
  component.play({ ...track, id: '2' });
  audios[0].next(new Blob(['old']));
  expect(create).not.toHaveBeenCalled();
  audios[1].next(new Blob(['selected'])); audios[1].complete();
  expect(component.audioUrl()).toBe('blob:first');
  component.play(track);
  expect(revoke).toHaveBeenCalledWith('blob:first');
  audios[2].next(new Blob(['last'])); audios[2].complete();
  injector.destroy(); cleanups.pop();
  expect(revoke).toHaveBeenCalledWith('blob:last');
});
it('shows download and native playback errors', () => {
  const { component, audios } = setup();
  component.play(track);
  audios[0].error(new HttpErrorResponse({ status: 404 }));
  expect(component.audioError()).toContain('introuvable');
  expect(component.audioLoading()).toBe(false);
  component.playbackError();
  expect(component.audioError()).toContain('navigateur');
});
it('formats bytes into readable units', () => {
  const { component } = setup();
  expect(component.formatSize(2048)).toBe('2 Ko');
  expect(component.formatSize(1048576)).toBe('1 Mo');
});

function deletionDialog() {
  return { showModal: vi.fn(), close: vi.fn() } as unknown as HTMLDialogElement;
}

it('requires confirmation and allows cancelling without deleting', () => {
  const { component, service } = setup();
  const dialog = deletionDialog();
  component.requestDelete(track, dialog);
  expect(dialog.showModal).toHaveBeenCalledOnce();
  expect(service.delete).not.toHaveBeenCalled();
  component.cancelDelete(dialog);
  component.confirmDelete(dialog, { focus: vi.fn() } as unknown as HTMLElement);
  expect(service.delete).not.toHaveBeenCalled();
  expect(component.deleteTarget()).toBeNull();
});

it('deletes once, clears the selected audio and returns from an emptied page', () => {
  vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:deleted');
  const revoke = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
  const { component, service, snackBar, deletion, audios } = setup();
  const dialog = deletionDialog();
  const focusTarget = { focus: vi.fn() } as unknown as HTMLElement;
  component.page.set(2);
  component.play(track);
  audios[0].next(new Blob(['audio'])); audios[0].complete();
  component.requestDelete(track, dialog);
  component.confirmDelete(dialog, focusTarget);
  component.confirmDelete(dialog, focusTarget);
  component.cancelDelete(dialog);
  expect(dialog.close).not.toHaveBeenCalled();
  expect(service.delete).toHaveBeenCalledExactlyOnceWith(track.id);
  deletion.next(); deletion.complete();
  expect(revoke).toHaveBeenCalledWith('blob:deleted');
  expect(component.selectedTrack()).toBeNull();
  expect(component.audioUrl()).toBe('');
  expect(component.page()).toBe(1);
  expect(service.list).toHaveBeenLastCalledWith(1);
  expect(dialog.close).toHaveBeenCalledOnce();
  expect(focusTarget.focus).toHaveBeenCalledOnce();
  expect(component.deleting()).toBe(false);
  expect(snackBar.open).toHaveBeenCalledExactlyOnceWith(`« ${track.title} » a été supprimé.`, 'Fermer', { duration: 5000 });
});

it('keeps the card and confirmation open after a failed deletion', () => {
  const { component, service, snackBar, deletion } = setup();
  const dialog = deletionDialog();
  component.requestDelete(track, dialog);
  component.confirmDelete(dialog, { focus: vi.fn() } as unknown as HTMLElement);
  deletion.error(new HttpErrorResponse({ status: 0 }));
  expect(snackBar.open).toHaveBeenCalledOnce();
  expect(snackBar.open.mock.calls[0]?.[0]).toContain('Serveur inaccessible');
  expect(component.deleting()).toBe(false);
  expect(component.tracks()).toEqual([track]);
  expect(component.deleteTarget()).toEqual(track);
  expect(dialog.close).not.toHaveBeenCalled();
  expect(service.list).toHaveBeenCalledOnce();
});

it('closes the confirmation and reloads the list when the track no longer exists or belongs to someone else', () => {
  const { component, service, snackBar, deletion } = setup();
  const dialog = deletionDialog();
  const focusTarget = { focus: vi.fn() } as unknown as HTMLElement;
  component.requestDelete(track, dialog);
  component.confirmDelete(dialog, focusTarget);
  deletion.error(new HttpErrorResponse({ status: 404 }));
  expect(snackBar.open).toHaveBeenCalledOnce();
  expect(snackBar.open.mock.calls[0]?.[0]).toContain('introuvable');
  expect(component.deleting()).toBe(false);
  expect(component.deleteTarget()).toBeNull();
  expect(dialog.close).toHaveBeenCalledOnce();
  expect(focusTarget.focus).toHaveBeenCalledOnce();
  expect(service.list).toHaveBeenCalledTimes(2);
});

it('tells the other tabs only after a successful upload or deletion', () => {
  const { component, sync, upload, deletion, input, choose } = setup();
  choose(); component.upload(input as unknown as HTMLInputElement);
  upload.next({ type: HttpEventType.UploadProgress, loaded: 5, total: 10 });
  expect(sync.notifyChanged).not.toHaveBeenCalled();
  upload.next(new HttpResponse({ body: track, status: 201 })); upload.complete();
  expect(sync.notifyChanged).toHaveBeenCalledOnce();

  const dialog = deletionDialog();
  component.requestDelete(track, dialog);
  component.confirmDelete(dialog, { focus: vi.fn() } as unknown as HTMLElement);
  deletion.next(); deletion.complete();
  expect(sync.notifyChanged).toHaveBeenCalledTimes(2);
});

it('does not notify the other tabs after a failed upload or deletion', () => {
  const { component, service, sync, upload, deletion, input, choose } = setup();
  choose(); component.upload(input as unknown as HTMLInputElement);
  upload.error(new HttpErrorResponse({ status: 500 }));
  const dialog = deletionDialog();
  component.requestDelete(track, dialog);
  component.confirmDelete(dialog, { focus: vi.fn() } as unknown as HTMLElement);
  deletion.error(new HttpErrorResponse({ status: 404 }));
  expect(service.delete).toHaveBeenCalledOnce();
  expect(sync.notifyChanged).not.toHaveBeenCalled();
});

it('reloads silently when another tab changes the library, keeping the list on screen', () => {
  const { component, service, changes } = setup();
  const added: Track = { ...track, id: '2', title: 'Funk' };
  const response = new Subject<{ items: Track[]; page: number; pages: number; total: number; limit: number }>();
  service.list.mockReturnValueOnce(response as never);
  changes.next();
  expect(service.list).toHaveBeenCalledTimes(2);
  expect(component.loading()).toBe(false);
  expect(component.tracks()).toEqual([track]);
  response.next({ items: [added, track], page: 1, pages: 2, total: 7, limit: 5 }); response.complete();
  expect(component.tracks()).toEqual([added, track]);
  expect(component.loading()).toBe(false);
});

it('keeps the current list without an error message when a silent reload fails', () => {
  const { component, service, changes } = setup();
  service.list.mockReturnValueOnce(throwError(() => new HttpErrorResponse({ status: 0 })) as never);
  changes.next();
  expect(component.tracks()).toEqual([track]);
  expect(component.error()).toBe('');
  expect(component.loading()).toBe(false);
});

it('moves to the last existing page when the current page disappeared', () => {
  const { component, service, changes } = setup();
  component.page.set(2);
  service.list
    .mockReturnValueOnce(of({ items: [], page: 2, pages: 1, total: 5, limit: 5 }))
    .mockReturnValueOnce(of({ items: [track], page: 1, pages: 1, total: 5, limit: 5 }));
  changes.next();
  expect(service.list).toHaveBeenNthCalledWith(2, 2);
  expect(service.list).toHaveBeenLastCalledWith(1);
  expect(component.page()).toBe(1);
  expect(component.pages()).toBe(1);
  expect(component.tracks()).toEqual([track]);
});

it('stops listening to the other tabs when the page is destroyed', () => {
  const { service, changes, injector } = setup();
  injector.destroy(); cleanups.pop();
  changes.next();
  expect(service.list).toHaveBeenCalledOnce();
});
