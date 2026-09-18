import '@angular/compiler';
import { HttpErrorResponse } from '@angular/common/http';
import { Injector, runInInjectionContext } from '@angular/core';
import { of, Subject } from 'rxjs';
import { afterEach, expect, it, vi } from 'vitest';
import { TracksPageComponent } from '../src/app/components/tracks-page/tracks-page';
import { TrackService } from '../src/app/shared/services/track.service';
import { Track } from '../src/app/shared/models/track.model';

const track: Track = { id: '1', title: 'Blues', originalName: 'blues.mp3', mimeType: 'audio/mpeg', size: 2048, createdAt: '2026-09-18T10:00:00Z' };
const cleanups: Array<() => void> = [];
afterEach(() => { cleanups.splice(0).forEach(fn => fn()); vi.restoreAllMocks(); });
function setup() {
  const upload = new Subject<Track>();
  const audios: Subject<Blob>[] = [];
  const service = {
    list: vi.fn(() => of({ items: [track], page: 1, pages: 2, total: 6, limit: 5 })),
    upload: vi.fn(() => upload),
    audio: vi.fn(() => { const response = new Subject<Blob>(); audios.push(response); return response; }),
  };
  const injector = Injector.create({ providers: [{ provide: TrackService, useValue: service }] });
  const component = runInInjectionContext(injector, () => new TracksPageComponent());
  cleanups.push(() => injector.destroy());
  const input = { value: 'file', files: [new File(['audio'], 'blues.mp3', { type: 'audio/mpeg' })] };
  const choose = () => component.choose({ target: input } as unknown as Event);
  return { component, service, upload, audios, input, choose, injector };
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
  upload.next(track); upload.complete();
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
