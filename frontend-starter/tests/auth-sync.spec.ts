import '@angular/compiler';
import { HttpClient, HttpEvent, HttpRequest, HttpResponse } from '@angular/common/http';
import { DOCUMENT, Injector, runInInjectionContext } from '@angular/core';
import { Router } from '@angular/router';
import { Subject } from 'rxjs';
import { afterEach, expect, it, vi } from 'vitest';
import { AuthService } from '../src/app/shared/services/auth.service';
import { authInterceptor } from '../src/app/shared/interceptors/auth.interceptor';
import { User } from '../src/app/shared/models/user.model';

const cleanups: Array<() => void> = [];
afterEach(() => { cleanups.splice(0).forEach(cleanup => cleanup()); vi.unstubAllGlobals(); });

function setup() {
  const stored = new Map<string, string>([['gpc_token', 'old-token'], ['preference', 'keep']]);
  const storage = { getItem: (key: string) => stored.get(key) ?? null,
    setItem: (key: string, value: string) => stored.set(key, value), removeItem: (key: string) => stored.delete(key) };
  vi.stubGlobal('localStorage', storage);
  const reload = vi.fn();
  const browser = Object.assign(new EventTarget(), { location: { reload } });
  const document = Object.assign(new EventTarget(), { defaultView: browser, visibilityState: 'visible' });
  const profile = new Subject<User>();
  const injector = Injector.create({ providers: [AuthService,
    { provide: DOCUMENT, useValue: document },
    { provide: HttpClient, useValue: { get: () => profile } },
    { provide: Router, useValue: {} },
  ] });
  const auth = injector.get(AuthService);
  auth.currentUser.set({ id: 'old-user', name: 'Old', email: 'old@example.test', createdAt: '' });
  cleanups.push(() => injector.destroy());
  const event = (key: string | null = 'gpc_token', storageArea: unknown = storage, newValue: string | null = null) => {
    browser.dispatchEvent(Object.assign(new Event('storage'), { key, storageArea, newValue }));
  };
  return { auth, stored, storage, reload, browser, document, injector, profile, event };
}

it.each([null, 'new-token'])('adopts another tab session %s, clears the profile and reloads once', token => {
  const { auth, stored, reload, event } = setup();
  const changed = vi.fn(); auth.externalSessionChanges.subscribe(changed);
  if (token) stored.set('gpc_token', token); else stored.delete('gpc_token');
  event(); event();
  expect(auth.token()).toBe(token);
  expect(auth.currentUser()).toBeNull();
  expect(reload).toHaveBeenCalledOnce();
  expect(changed).toHaveBeenCalledOnce();
  expect(stored.get('preference')).toBe('keep');
});

it('ignores unrelated storage and reads the latest value rather than a stale queued event', () => {
  const { auth, stored, reload, event, storage } = setup();
  event('preference'); event('gpc_token', {}); event();
  expect(reload).not.toHaveBeenCalled();
  stored.set('gpc_token', 'latest-token');
  event('gpc_token', storage, 'obsolete-token');
  expect(auth.token()).toBe('latest-token');
  expect(stored.get('gpc_token')).toBe('latest-token');
});

it('handles localStorage.clear and reconciles a missed change on return to the tab', () => {
  const { auth, stored, reload, event, document } = setup();
  stored.clear(); event(null);
  expect(auth.token()).toBeNull();
  stored.set('gpc_token', 'next-token');
  document.visibilityState = 'hidden'; document.dispatchEvent(new Event('visibilitychange'));
  expect(reload).toHaveBeenCalledOnce();
  document.visibilityState = 'visible'; document.dispatchEvent(new Event('visibilitychange'));
  expect(auth.token()).toBe('next-token');
  expect(reload).toHaveBeenCalledTimes(2);
});

it('cancels in-flight API responses before they can restore old account data', () => {
  const { injector, stored, event, auth } = setup();
  const response = new Subject<HttpEvent<unknown>>();
  const next = vi.fn((_request: HttpRequest<unknown>) => response);
  const received = vi.fn(); const complete = vi.fn();
  runInInjectionContext(injector, () => authInterceptor(new HttpRequest('GET', '/api/tracks'), next))
    .subscribe({ next: received, complete });
  expect(next.mock.calls[0][0].headers.get('Authorization')).toBe('Bearer old-token');
  stored.set('gpc_token', 'new-token'); event();
  response.next(new HttpResponse({ body: { privateData: 'old user' } }));
  expect(received).not.toHaveBeenCalled();
  expect(complete).toHaveBeenCalledOnce();
  expect(auth.token()).toBe('new-token');
});

it('does not restore the profile from an HTTP response received after local logout', () => {
  const { auth, profile, reload } = setup();
  const next = vi.fn(); auth.profile().subscribe(next);
  auth.logout();
  profile.next({ id: 'old-user', name: 'Old', email: 'old@example.test', createdAt: '' });
  expect(next).not.toHaveBeenCalled();
  expect(auth.currentUser()).toBeNull();
  expect(reload).not.toHaveBeenCalled();
});

it('removes storage and visibility listeners when destroyed', () => {
  const { injector, stored, event, document, reload } = setup();
  injector.destroy(); cleanups.pop();
  stored.clear(); event(); document.dispatchEvent(new Event('visibilitychange'));
  expect(reload).not.toHaveBeenCalled();
});
