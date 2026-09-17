import '@angular/compiler';
import { HttpErrorResponse, HttpRequest } from '@angular/common/http';
import { Injector, runInInjectionContext, signal } from '@angular/core';
import { Router } from '@angular/router';
import { Subject } from 'rxjs';
import { expect, it, vi } from 'vitest';
import { authInterceptor } from '../src/app/shared/interceptors/auth.interceptor';
import { AuthService } from '../src/app/shared/services/auth.service';

function setup(url: string, initialToken: string | null = 'expired-token') {
  const token = signal(initialToken);
  const auth = { token, logout: vi.fn(() => token.set(null)) };
  const router = {
    url: '/profile',
    currentNavigation: vi.fn<() => { finalUrl: { toString(): string } } | null>(() => null),
    navigate: vi.fn().mockResolvedValue(true),
  };
  const injector = Injector.create({ providers: [
    { provide: AuthService, useValue: auth },
    { provide: Router, useValue: router },
  ] });
  const response = new Subject<never>();
  const next = vi.fn(() => response);
  const onError = vi.fn();
  runInInjectionContext(injector, () => authInterceptor(new HttpRequest('GET', url), next))
    .subscribe({ error: onError });
  return { auth, router, response, next, onError };
}

it('clears the expired session, redirects and propagates the 401', () => {
  const { auth, router, response, next, onError } = setup('/api/users/me');
  expect(next.mock.calls[0]?.[0].headers.get('Authorization')).toBe('Bearer expired-token');
  const error = new HttpErrorResponse({ status: 401 });
  response.error(error);
  expect(auth.logout).toHaveBeenCalledOnce();
  expect(router.navigate).toHaveBeenCalledWith(['/login'], {
    queryParams: { returnUrl: '/profile', reason: 'expired' }, replaceUrl: true,
  });
  expect(onError).toHaveBeenCalledWith(error);
});

it('redirects on protected API 401 responses even without a token', () => {
  const { auth, router, response } = setup('/api/tracks', null);
  response.error(new HttpErrorResponse({ status: 401 }));
  expect(auth.logout).toHaveBeenCalledOnce();
  expect(router.navigate).toHaveBeenCalledWith(['/login'], {
    queryParams: { returnUrl: '/profile' }, replaceUrl: true,
  });
});

it.each(['/api/auth/login', '/api/auth/register', 'https://example.com/data'])
('does not attach the token or redirect for %s', (url) => {
  const { auth, router, response, next, onError } = setup(url);
  expect(next.mock.calls[0]?.[0].headers.has('Authorization')).toBe(false);
  response.error(new HttpErrorResponse({ status: 401 }));
  expect(auth.logout).not.toHaveBeenCalled();
  expect(router.navigate).not.toHaveBeenCalled();
  expect(onError).toHaveBeenCalledOnce();
});

it.each([0, 400, 403, 500])('preserves the session for HTTP %s', (status) => {
  const { auth, router, response } = setup('/api/tracks');
  response.error(new HttpErrorResponse({ status }));
  expect(auth.logout).not.toHaveBeenCalled();
  expect(router.navigate).not.toHaveBeenCalled();
});

it('does not clear a newer session because of an older request', () => {
  const { auth, router, response } = setup('/api/tracks');
  auth.token.set('new-token');
  response.error(new HttpErrorResponse({ status: 401 }));
  expect(auth.logout).not.toHaveBeenCalled();
  expect(router.navigate).not.toHaveBeenCalled();
});

it('preserves the target page when a 401 occurs during navigation', () => {
  const { router, response } = setup('/api/tracks');
  router.currentNavigation.mockReturnValue({ finalUrl: { toString: () => '/tracks?sort=recent' } });
  response.error(new HttpErrorResponse({ status: 401 }));
  expect(router.navigate).toHaveBeenCalledWith(['/login'], {
    queryParams: { returnUrl: '/tracks?sort=recent', reason: 'expired' }, replaceUrl: true,
  });
});
