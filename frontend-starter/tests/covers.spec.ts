import { HttpErrorResponse, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { NEVER, Subject } from 'rxjs';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { TrackCoverComponent } from '../src/app/components/track-cover/track-cover';
import { CoverPickerComponent } from '../src/app/components/cover-picker/cover-picker';
import { CoverEditorComponent } from '../src/app/components/cover-editor/cover-editor';
import { TrackService } from '../src/app/shared/services/track.service';
import { Track } from '../src/app/shared/models/track.model';
import { AuthService } from '../src/app/shared/services/auth.service';
import { authInterceptor } from '../src/app/shared/interceptors/auth.interceptor';

const track: Track = { id: 'track-1', title: 'Blues', originalName: 'blues.mp3', size: 10,
  mimeType: 'audio/mpeg', createdAt: '2026-09-25',
  cover: { version: 'v1', mimeType: 'image/webp', width: 800, height: 600, size: 100 } };

beforeEach(() => {
  let count = 0;
  vi.stubGlobal('URL', class extends URL {
    static override createObjectURL = vi.fn(() => `blob:test-${++count}`);
    static override revokeObjectURL = vi.fn();
  });
});
afterEach(() => { TestBed.resetTestingModule(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

it('loads images with JWT and releases URLs on version change and destruction', () => {
  TestBed.configureTestingModule({ providers: [provideHttpClient(withInterceptors([authInterceptor])),
    provideHttpClientTesting(), { provide: AuthService, useValue: { token: () => 'credential', externalSessionChanges: NEVER } },
    { provide: Router, useValue: {} }] });
  const http = TestBed.inject(HttpTestingController);
  const fixture = TestBed.createComponent(TrackCoverComponent);
  fixture.componentRef.setInput('trackId', track.id);
  fixture.componentRef.setInput('version', 'v1');
  fixture.detectChanges();
  const request = http.expectOne('/api/tracks/track-1/cover');
  expect(request.request.headers.get('Authorization')).toBe('Bearer credential');
  expect(request.request.responseType).toBe('blob');
  request.flush(new Blob(['image'], { type: 'image/webp' }));
  fixture.detectChanges();
  expect(fixture.nativeElement.querySelector('img').getAttribute('src')).toBe('blob:test-1');
  fixture.componentRef.setInput('version', 'v2');
  fixture.detectChanges();
  expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:test-1');
  http.expectOne('/api/tracks/track-1/cover').flush(new Blob(['replacement']));
  fixture.destroy();
  expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:test-2');
  http.verify();
});

it('does not request missing covers, shows fallback on failure and cancels pending requests', () => {
  TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
  const http = TestBed.inject(HttpTestingController);
  const fixture = TestBed.createComponent(TrackCoverComponent);
  fixture.componentRef.setInput('trackId', track.id);
  fixture.detectChanges();
  http.expectNone('/api/tracks/track-1/cover');
  expect(fixture.nativeElement.textContent).toContain('Sans couverture');
  fixture.componentRef.setInput('version', 'v1');
  fixture.detectChanges();
  http.expectOne('/api/tracks/track-1/cover').flush(new Blob(), { status: 404, statusText: 'Not Found' });
  fixture.detectChanges();
  expect(fixture.nativeElement.textContent).toContain('Image indisponible');
  fixture.componentRef.setInput('version', 'v2');
  fixture.detectChanges();
  const pending = http.expectOne('/api/tracks/track-1/cover');
  fixture.destroy();
  expect(pending.cancelled).toBe(true);
  http.verify();
});

it('previews locally, rejects invalid selections, resets and releases the preview', () => {
  const fixture = TestBed.createComponent(CoverPickerComponent);
  fixture.componentRef.setInput('inputId', 'test-cover');
  fixture.detectChanges();
  const selected = vi.fn();
  fixture.componentInstance.fileChange.subscribe(selected);
  const invalid = vi.fn();
  fixture.componentInstance.invalidChange.subscribe(invalid);
  const input: HTMLInputElement = fixture.nativeElement.querySelector('input');
  const choose = (file: File) => {
    Object.defineProperty(input, 'files', { configurable: true, value: [file] });
    input.dispatchEvent(new Event('change')); fixture.detectChanges();
  };
  const image = new File(['image'], 'cover.png', { type: 'image/png' });
  choose(image);
  expect(selected).toHaveBeenLastCalledWith(image);
  expect(fixture.nativeElement.querySelector('img')).not.toBeNull();
  choose(new File(['not image'], 'cover.svg', { type: 'image/svg+xml' }));
  expect(invalid).toHaveBeenLastCalledWith(true);
  expect(selected).toHaveBeenLastCalledWith(null);
  expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:test-1');
  choose(image);
  fixture.componentRef.setInput('resetKey', 1); fixture.detectChanges();
  expect(fixture.componentInstance.preview()).toBe('');
  expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:test-2');
  choose(new File([new Uint8Array(5 * 1024 * 1024 + 1)], 'large.png', { type: 'image/png' }));
  expect(fixture.nativeElement.textContent).toContain('5 Mo');
  choose(image);
  fixture.destroy();
  expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:test-3');
});

it('sends optional cover in the existing import and uses dedicated modification routes', () => {
  TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
  const http = TestBed.inject(HttpTestingController);
  const service = TestBed.inject(TrackService);
  const audio = new File(['audio'], 'track.mp3', { type: 'audio/mpeg' });
  const cover = new File(['image'], 'cover.png', { type: 'image/png' });
  service.upload(audio, 'Blues', cover).subscribe();
  const upload = http.expectOne('/api/tracks');
  expect([...upload.request.body.keys()]).toEqual(['audio', 'title', 'cover']);
  expect(upload.request.body.get('cover')).toBe(cover);
  upload.flush(track);
  service.setCover(track.id, cover).subscribe();
  const update = http.expectOne('/api/tracks/track-1/cover');
  expect(update.request.method).toBe('PUT');
  expect([...update.request.body.keys()]).toEqual(['cover']);
  update.flush(track);
  service.removeCover(track.id).subscribe();
  const deletion = http.expectOne('/api/tracks/track-1/cover');
  expect(deletion.request.method).toBe('DELETE');
  deletion.flush(null);
  http.verify();
});

it('keeps an editor selection after failure, prevents duplicate saves and emits the updated track', () => {
  const first = new Subject<Track>();
  const retry = new Subject<Track>();
  const service = { setCover: vi.fn().mockReturnValueOnce(first).mockReturnValueOnce(retry) };
  TestBed.configureTestingModule({ providers: [{ provide: TrackService, useValue: service }] });
  const fixture = TestBed.createComponent(CoverEditorComponent);
  fixture.componentRef.setInput('track', track); fixture.detectChanges();
  const component = fixture.componentInstance;
  const updated = vi.fn(); component.updated.subscribe(updated);
  component.toggle();
  const cover = new File(['image'], 'cover.png', { type: 'image/png' });
  component.file.set(cover);
  component.save(); component.save();
  expect(service.setCover).toHaveBeenCalledOnce();
  first.error(new HttpErrorResponse({ status: 400, error: { message: 'Image invalide' } }));
  expect(component.file()).toBe(cover);
  expect(component.error()).toBe('Image invalide');
  component.save(); retry.next(track); retry.complete();
  expect(updated).toHaveBeenCalledWith(track);
  expect(component.editing()).toBe(false);
});
