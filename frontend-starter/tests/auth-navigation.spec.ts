import '@angular/compiler';
import { HttpClient } from '@angular/common/http';
import { Injector, runInInjectionContext } from '@angular/core';
import { ActivatedRouteSnapshot, Router, RouterStateSnapshot } from '@angular/router';
import { afterEach, expect, it, vi } from 'vitest';
import { AppComponent } from '../src/app/components/app/app';
import { routes } from '../src/app/routes';
import { authGuard } from '../src/app/shared/guards/auth.guard';
import { guestGuard } from '../src/app/shared/guards/guest.guard';
import { AuthService } from '../src/app/shared/services/auth.service';

afterEach(() => vi.unstubAllGlobals());

function setup(token: string | null) {
  const storage = new Map<string, string>();
  if (token) storage.set('gpc_token', token);
  storage.set('unrelated-preference', 'keep');
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => storage.get(key) ?? null,
    removeItem: (key: string) => storage.delete(key),
  });
  const router = {
    createUrlTree: vi.fn((paths: string[]) => paths.join('/')),
    navigateByUrl: vi.fn().mockResolvedValue(true),
  };
  const injector = Injector.create({ providers: [
    AuthService,
    { provide: HttpClient, useValue: {} },
    { provide: Router, useValue: router },
  ] });
  const auth = injector.get(AuthService);
  const guard = (fn: typeof guestGuard) => runInInjectionContext(injector,
    () => fn({} as ActivatedRouteSnapshot, {} as RouterStateSnapshot));
  return { storage, router, injector, auth, guard };
}

it('protects both authentication routes from direct navigation', () => {
  for (const path of ['login', 'register']) {
    expect(routes.find(route => route.path === path)?.canActivate).toContain(guestGuard);
  }
});

it('redirects an authenticated visitor even when only a persisted token is available', () => {
  const { auth, guard } = setup('test-token');
  expect(auth.currentUser()).toBeNull();
  expect(guard(guestGuard)).toBe('/tracks');
  expect(guard(authGuard)).toBe(true);
});

it('lets guests access authentication pages and rejects protected routes', () => {
  const { guard } = setup(null);
  expect(guard(guestGuard)).toBe(true);
  expect(guard(authGuard)).toBe('/login');
});

it('clears authentication on logout, redirects and blocks subsequent protected navigation', () => {
  const { auth, injector, storage, router, guard } = setup('test-token');
  auth.currentUser.set({ id: '1', name: 'Test', email: 'test@example.com', createdAt: '' });
  const app = runInInjectionContext(injector, () => new AppComponent());
  app.logout();
  expect(storage.has('gpc_token')).toBe(false);
  expect(storage.get('unrelated-preference')).toBe('keep');
  expect(auth.token()).toBeNull();
  expect(auth.currentUser()).toBeNull();
  expect(router.navigateByUrl).toHaveBeenCalledWith('/login', { replaceUrl: true });
  expect(guard(authGuard)).toBe('/login');
  expect(guard(guestGuard)).toBe(true);
});
