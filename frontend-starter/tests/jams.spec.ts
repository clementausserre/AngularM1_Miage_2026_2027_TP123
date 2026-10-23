import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router, convertToParamMap, provideRouter } from '@angular/router';
import { BehaviorSubject } from 'rxjs';
import { afterEach, expect, it, vi } from 'vitest';
import { JamsPageComponent } from '../src/app/components/jams-page/jams-page';
import { JamService } from '../src/app/shared/services/jam.service';
import { Jam } from '../src/app/shared/models/jam.model';
import { routes } from '../src/app/routes';
import { authGuard } from '../src/app/shared/guards/auth.guard';
import { authReturnUrl } from '../src/app/shared/utils/auth-return-url';

const jam: Jam = { id: 'a'.repeat(24), name: 'Friday', host: { id: 'host', name: 'Host' }, createdAt: '', role: 'host',
  participants: [{ id: 'host', name: 'Host' }], invitations: [] };
const friend = { id: 'relation', user: { id: 'friend', name: 'Friend' }, status: 'accepted', createdAt: '' };
const page = <T>(items: T[], current = 1, pages = 1) => ({ items, page: current, pages, total: items.length, limit: 12 });
afterEach(() => { TestBed.resetTestingModule(); vi.restoreAllMocks(); vi.useRealTimers(); });
function setup(detail: Jam | null = null) {
  const params = new BehaviorSubject(convertToParamMap(detail ? { id: detail.id } : {}));
  TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([]),
    { provide: ActivatedRoute, useValue: { paramMap: params } }] });
  const fixture = TestBed.createComponent(JamsPageComponent), http = TestBed.inject(HttpTestingController);
  if (detail) {
    http.expectOne(`/api/jams/${detail.id}`).flush(detail);
    if (detail.role === 'host') http.expectOne('/api/friends?kind=accepted&page=1').flush(page([friend]));
  } else http.expectOne('/api/jams?kind=joined&page=1').flush(page([]));
  fixture.detectChanges();
  return { fixture, component: fixture.componentInstance, http, params };
}

it('protects jam routes and returns to a jam after authentication', () => {
  for (const path of ['jams', 'jams/:id']) expect(routes.find(route => route.path === path)?.canActivate).toContain(authGuard);
  expect(authReturnUrl('/jams')).toBe('/jams');
  expect(authReturnUrl(`/jams/${jam.id}`)).toBe(`/jams/${jam.id}`);
  expect(authReturnUrl('/jams/../login')).toBe('/tracks');
});
it('creates a named jam once and opens the returned session', () => {
  const { component, http } = setup();
  const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
  component.name.setValue('  Friday  '); component.create(); component.create();
  const request = http.expectOne('/api/jams');
  expect(request.request.method).toBe('POST'); expect(request.request.body).toEqual({ name: 'Friday' });
  expect(component.name.disabled).toBe(true);
  request.flush({ id: jam.id });
  expect(navigate).toHaveBeenCalledWith(['/jams', jam.id]);
  expect(component.busy()).toBe(false); expect(component.name.enabled).toBe(true); http.verify();
});
it('keeps the name and exposes a creation conflict for an existing hosted jam', () => {
  const { component, http } = setup();
  component.name.setValue('Friday'); component.create();
  http.expectOne('/api/jams').flush({ message: 'Vous animez déjà une jam.' }, { status: 409, statusText: 'Conflict' });
  expect(component.name.value).toBe('Friday'); expect(component.error()).toContain('déjà'); expect(component.busy()).toBe(false); http.verify();
});
it('loads incoming invitations and accepts exactly once before navigating', () => {
  const { component, http, fixture } = setup();
  const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
  component.changeKind('invitations');
  const invitation = { ...jam, role: 'invited' as const };
  http.expectOne('/api/jams?kind=invitations&page=1').flush(page([invitation])); fixture.detectChanges();
  const button = [...fixture.nativeElement.querySelectorAll('button')].find((item: unknown) => (item as HTMLButtonElement).textContent?.includes('Accepter')) as HTMLButtonElement;
  button.click(); button.click();
  const request = http.expectOne(`/api/jams/${jam.id}/membership`);
  expect(request.request.method).toBe('PUT'); request.flush(null);
  expect(navigate).toHaveBeenCalledExactlyOnceWith(['/jams', jam.id]); http.verify();
});
it('refuses an invitation and reloads its list', () => {
  const { component, http } = setup();
  component.changeKind('invitations'); http.expectOne('/api/jams?kind=invitations&page=1').flush(page([jam]));
  component.decline(jam);
  const request = http.expectOne(`/api/jams/${jam.id}/invitations/me`);
  expect(request.request.method).toBe('DELETE'); request.flush(null);
  http.expectOne('/api/jams?kind=invitations&page=1').flush(page([]));
  expect(component.items()).toEqual([]); expect(component.feedback()).toContain('refusée'); http.verify();
});
it('invites an accepted friend and marks the pending invitation after refreshing', () => {
  const { component, http, fixture } = setup(jam);
  component.invite('friend'); component.invite('friend');
  const request = http.expectOne(`/api/jams/${jam.id}/invitations`);
  expect(request.request.method).toBe('POST'); expect(request.request.body).toEqual({ userId: 'friend' }); request.flush(null);
  http.expectOne(`/api/jams/${jam.id}`).flush({ ...jam, invitations: [friend.user] }); fixture.detectChanges();
  expect(component.inviteLabel('friend')).toBe('Invitation envoyée');
  const button = fixture.nativeElement.querySelector('button[aria-label="Invitation envoyée : Friend"]') as HTMLButtonElement;
  expect(button.disabled).toBe(true); http.verify();
});
it('only leaves after confirmation and hides host controls from guests', () => {
  const { component, http, fixture } = setup({ ...jam, role: 'participant' });
  const navigate = vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockResolvedValue(true);
  expect(fixture.nativeElement.textContent).not.toContain('Inviter mes amis');
  component.leave(); http.expectNone(`/api/jams/${jam.id}/membership`);
  component.confirmingLeave.set(true); component.leave();
  const request = http.expectOne(`/api/jams/${jam.id}/membership`);
  expect(request.request.method).toBe('DELETE'); request.flush(null);
  expect(navigate).toHaveBeenCalledWith('/jams'); http.verify();
});
it('clears participants when a host closes the jam elsewhere', () => {
  const { component, http, fixture } = setup({ ...jam, role: 'participant' });
  component.load();
  http.expectOne(`/api/jams/${jam.id}`).flush({ message: 'Cette jam est terminée.' }, { status: 404, statusText: 'Not Found' });
  fixture.detectChanges();
  expect(component.selected()).toBeNull(); expect(fixture.nativeElement.textContent).toContain('terminée'); http.verify();
});
it('cancels stale requests when changing rooms and when destroying the page', () => {
  const { component, http, params, fixture } = setup(jam);
  component.invite('friend'); const invitation = http.expectOne(`/api/jams/${jam.id}/invitations`);
  params.next(convertToParamMap({ id: 'b'.repeat(24) }));
  expect(invitation.cancelled).toBe(true); expect(component.busy()).toBe(false);
  const detail = http.expectOne(`/api/jams/${'b'.repeat(24)}`);
  fixture.destroy(); expect(detail.cancelled).toBe(true); http.verify();
});
it('refreshes visible sessions, pauses during mutations and stops polling after destruction', () => {
  vi.useFakeTimers(); vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible');
  const { component, http, fixture } = setup({ ...jam, role: 'participant' });
  vi.advanceTimersByTime(10000); http.expectOne(`/api/jams/${jam.id}`).flush(jam);
  http.expectOne('/api/friends?kind=accepted&page=1').flush(page([friend]));
  component.invite('friend'); const request = http.expectOne(`/api/jams/${jam.id}/invitations`);
  vi.advanceTimersByTime(10000); http.expectNone(`/api/jams/${jam.id}`);
  request.flush(null); http.expectOne(`/api/jams/${jam.id}`).flush(jam);
  fixture.destroy(); vi.advanceTimersByTime(20000); http.verify();
});
it('uses the requested page in jam service requests', () => {
  const { http } = setup();
  TestBed.inject(JamService).list('invitations', 2).subscribe({ next: result => expect(result.page).toBe(2), error: () => { throw new Error('Unexpected HTTP error'); } });
  http.expectOne('/api/jams?kind=invitations&page=2').flush(page([], 2, 2)); http.verify();
});
