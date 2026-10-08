// @vitest-environment jsdom
// TestBed a besoin d'un `document` : ce fichier s'exécute donc dans un DOM simulé (jsdom).
import '@angular/compiler';
import { HttpEvent, HttpEventType, provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { getTestBed, TestBed } from '@angular/core/testing';
import { BrowserTestingModule, platformBrowserTesting } from '@angular/platform-browser/testing';
import { afterEach, beforeAll, expect, it, vi } from 'vitest';
import { AuthService } from '../src/app/shared/services/auth.service';
import { TrackService } from '../src/app/shared/services/track.service';
import { Track } from '../src/app/shared/models/track.model';

const track: Track = { id: 'abc', title: 'Blues', originalName: 'blues.mp3', mimeType: 'audio/mpeg', size: 5, createdAt: '2026-10-06T10:00:00Z' };
const cleanups: Array<() => void> = [];
beforeAll(() => { if (!getTestBed().platform) getTestBed().initTestEnvironment(BrowserTestingModule, platformBrowserTesting()); });
afterEach(() => { cleanups.splice(0).forEach(fn => fn()); vi.unstubAllGlobals(); });

// Vrai HttpClient branché sur un backend simulé : aucune requête ne quitte le test.
function setup() {
  const storage = new Map<string, string>();
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => storage.set(key, value),
    removeItem: (key: string) => storage.delete(key),
  });
  TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
  const http = TestBed.inject(HttpTestingController);
  cleanups.push(() => { http.verify(); TestBed.resetTestingModule(); });
  return { http, storage, auth: TestBed.inject(AuthService), tracks: TestBed.inject(TrackService) };
}

it('AuthService.login() sends POST /api/auth/login with the credentials and stores the token', () => {
  const { http, storage, auth } = setup();
  const user = { id: 'u1', name: 'Demo', email: 'demo@example.com', createdAt: '2026-10-06T10:00:00Z' };
  auth.login('demo@example.com', 'Demo1234!').subscribe();
  const request = http.expectOne('/api/auth/login');
  expect(request.request.method).toBe('POST');
  expect(request.request.body).toEqual({ email: 'demo@example.com', password: 'Demo1234!' });
  request.flush({ token: 'jwt-token', user });
  expect(auth.token()).toBe('jwt-token');
  expect(storage.get('gpc_token')).toBe('jwt-token');
  expect(auth.currentUser()).toEqual(user);
});

it('AuthService.login() keeps the session empty after a 401', () => {
  const { http, storage, auth } = setup();
  const onError = vi.fn();
  auth.login('demo@example.com', 'wrong').subscribe({ error: onError });
  http.expectOne('/api/auth/login').flush({ message: 'Identifiants incorrects' }, { status: 401, statusText: 'Unauthorized' });
  expect(onError.mock.calls[0]?.[0].status).toBe(401);
  expect(auth.token()).toBeNull();
  expect(storage.has('gpc_token')).toBe(false);
});

it('TrackService.list() sends GET /api/tracks with page and limit', () => {
  const { http, tracks } = setup();
  const onPage = vi.fn();
  tracks.list(2, 5).subscribe(onPage);
  const request = http.expectOne(req => req.url === '/api/tracks');
  expect(request.request.method).toBe('GET');
  expect(request.request.params.get('page')).toBe('2');
  expect(request.request.params.get('limit')).toBe('5');
  expect(request.request.urlWithParams).toBe('/api/tracks?page=2&limit=5');
  const page = { items: [track], page: 2, limit: 5, total: 6, pages: 2 };
  request.flush(page);
  expect(onPage).toHaveBeenCalledWith(page);
});

it('TrackService.get() fetches only the metadata of the selected track', () => {
  const { http, tracks } = setup();
  const received = vi.fn();
  tracks.get('abc').subscribe(received);
  const request = http.expectOne('/api/tracks/abc');
  expect(request.request.method).toBe('GET');
  request.flush(track);
  expect(received).toHaveBeenCalledWith(track);
});

it('TrackService.delete() sends DELETE /api/tracks/:id', () => {
  const { http, tracks } = setup();
  const onDone = vi.fn();
  tracks.delete('abc').subscribe({ complete: onDone });
  const request = http.expectOne('/api/tracks/abc');
  expect(request.request.method).toBe('DELETE');
  expect(request.request.body).toBeNull();
  request.flush(null, { status: 204, statusText: 'No Content' });
  expect(onDone).toHaveBeenCalledOnce();
});

it('TrackService.delete() propagates a 404 for a missing or foreign track', () => {
  const { http, tracks } = setup();
  const onError = vi.fn();
  tracks.delete('other').subscribe({ error: onError });
  http.expectOne('/api/tracks/other').flush({ message: 'Piste inconnue' }, { status: 404, statusText: 'Not Found' });
  expect(onError.mock.calls[0]?.[0].status).toBe(404);
});

it('TrackService.upload() posts multipart data and reports progress events before the response', () => {
  const { http, tracks } = setup();
  const file = new File(['audio'], 'blues.mp3', { type: 'audio/mpeg' });
  const events: HttpEvent<Track>[] = [];
  tracks.upload(file, 'Blues').subscribe(event => events.push(event));
  const request = http.expectOne('/api/tracks');
  expect(request.request.method).toBe('POST');
  expect(request.request.reportProgress).toBe(true);
  const body = request.request.body as FormData;
  expect(body).toBeInstanceOf(FormData);
  expect((body.get('audio') as File).name).toBe('blues.mp3');
  expect(body.get('title')).toBe('Blues');
  request.event({ type: HttpEventType.UploadProgress, loaded: 3, total: 5 });
  request.flush(track, { status: 201, statusText: 'Created' });
  expect(events.map(event => event.type)).toEqual([HttpEventType.Sent, HttpEventType.UploadProgress, HttpEventType.Response]);
  expect(events[1]).toMatchObject({ loaded: 3, total: 5 });
});
