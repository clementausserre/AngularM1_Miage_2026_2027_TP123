import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router, convertToParamMap, provideRouter } from '@angular/router';
import { BehaviorSubject } from 'rxjs';
import { afterEach, expect, it, vi } from 'vitest';
import { PlaylistsPageComponent } from '../src/app/components/playlists-page/playlists-page';
import { AddToPlaylistComponent } from '../src/app/components/add-to-playlist/add-to-playlist';
import { PlayerService } from '../src/app/shared/services/player.service';
import { Playlist } from '../src/app/shared/models/playlist.model';
import { routes } from '../src/app/routes';
import { authGuard } from '../src/app/shared/guards/auth.guard';

afterEach(() => { TestBed.resetTestingModule(); vi.restoreAllMocks(); });
const track = { id: 'one', title: 'One', originalName: 'one.wav', mimeType: 'audio/wav', size: 100, createdAt: '' };
const playlist: Playlist = { id: 'p', name: 'Mix', version: 3, createdAt: '', updatedAt: '', trackCount: 2, preview: track, tracks: [track, { ...track, id: 'two', title: 'Two' }] };
const dialog = () => ({ close: vi.fn(), showModal: vi.fn() }) as unknown as HTMLDialogElement;
function setup(id: string | null = 'p') {
  const params = new BehaviorSubject(convertToParamMap(id ? { id } : {}));
  const player = { playlist: signal<{ id: string; name: string } | null>(null), selectedTrack: signal(null), stop: vi.fn(), playPlaylist: vi.fn() };
  TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([]),
    { provide: ActivatedRoute, useValue: { paramMap: params } },
    { provide: PlayerService, useValue: player }] });
  const fixture = TestBed.createComponent(PlaylistsPageComponent), http = TestBed.inject(HttpTestingController);
  http.expectOne(id ? '/api/playlists/p' : '/api/playlists?page=1').flush(id ? playlist : { items: [], page: 1, pages: 1, total: 0, limit: 12 });
  fixture.detectChanges();
  return { fixture, http, component: fixture.componentInstance, player, params };
}
it('protects playlist routes and reorders with the expected version', () => {
  for (const path of ['playlists', 'playlists/:id']) expect(routes.find(route => route.path === path)?.canActivate).toContain(authGuard);
  const { component, http } = setup();
  component.move(0, 1);
  const request = http.expectOne('/api/playlists/p');
  expect(request.request.method).toBe('PUT');
  expect(request.request.body).toEqual({ version: 3, trackIds: ['two', 'one'] });
  request.flush({ ...playlist, version: 4, tracks: [...playlist.tracks].reverse() });
  expect(component.selected()?.tracks[0].id).toBe('two'); http.verify();
});
it('keeps the displayed order and exposes an actionable conflict on stale writes', () => {
  const { component, http } = setup();
  component.removeTrack('one');
  const request = http.expectOne('/api/playlists/p');
  expect(request.request.body.trackIds).toEqual(['two']);
  request.flush({ message: 'Actualisez la playlist.' }, { status: 409, statusText: 'Conflict' });
  expect(component.selected()?.tracks).toHaveLength(2);
  expect(component.error()).toContain('Actualisez'); expect(component.busy()).toBe(false); http.verify();
});
it('starts playback through the shared player and renames without changing track order', () => {
  const { component, http, fixture, player } = setup();
  const button = [...fixture.nativeElement.querySelectorAll('button')].find((item: unknown) => (item as HTMLButtonElement).textContent?.includes('Tout lire')) as HTMLButtonElement;
  button.click(); expect(player.playPlaylist).toHaveBeenCalledWith(playlist);
  component.startRename(); component.name.setValue('Updated'); component.rename();
  const request = http.expectOne('/api/playlists/p'); expect(request.request.body).toEqual({ version: 3, name: 'Updated' });
  request.flush({ ...playlist, name: 'Updated', version: 4 });
  expect(component.editing()).toBe(false); http.verify();
});
it('only stops playback when deleting the active playlist after confirmation', () => {
  const { component, http, player } = setup();
  vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockResolvedValue(true);
  const confirmation = dialog(); component.requestDelete(playlist, confirmation);
  http.expectNone(request => request.method === 'DELETE');
  player.playlist.set({ id: 'p', name: 'Mix' }); component.confirmDelete(confirmation);
  http.expectOne('/api/playlists/p').flush(null);
  expect(player.stop).toHaveBeenCalledOnce(); expect(confirmation.close).toHaveBeenCalledOnce(); http.verify();
});
it('creates a playlist and navigates to its detail', () => {
  const { component, http } = setup(null);
  const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
  component.name.setValue('  Mix  '); component.create(dialog());
  const request = http.expectOne('/api/playlists'); expect(request.request.body).toEqual({ name: 'Mix' });
  request.flush(playlist); expect(navigate).toHaveBeenCalledWith(['/playlists', 'p']); http.verify();
});
it('cancels a pending edit when navigation reuses the page for another playlist', () => {
  const { component, http, params } = setup();
  component.removeTrack('one');
  const stale = http.expectOne('/api/playlists/p');
  params.next(convertToParamMap({ id: 'other' }));
  expect(stale.cancelled).toBe(true);
  expect(component.busy()).toBe(false);
  http.expectOne('/api/playlists/other').flush({ ...playlist, id: 'other', name: 'Other list' });
  expect(component.selected()?.id).toBe('other'); http.verify();
});
it('loads the add dialog on demand and prevents double submission', () => {
  TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])] });
  const fixture = TestBed.createComponent(AddToPlaylistComponent), http = TestBed.inject(HttpTestingController);
  fixture.componentRef.setInput('track', track); fixture.detectChanges(); http.expectNone('/api/playlists?page=1');
  const component = fixture.componentInstance, popup = dialog(); component.open(popup);
  http.expectOne('/api/playlists?page=1').flush({ items: [playlist], page: 1, pages: 1, total: 1, limit: 12 });
  component.add('p', popup); component.add('p', popup);
  const request = http.expectOne('/api/playlists/p/tracks'); expect(request.request.body).toEqual({ trackId: 'one' });
  request.flush(playlist); expect(popup.close).toHaveBeenCalledOnce(); expect(component.success()).toContain('Mix'); http.verify();
});
