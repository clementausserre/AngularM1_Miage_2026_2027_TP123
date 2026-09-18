import '@angular/compiler';
import { HttpErrorResponse } from '@angular/common/http';
import { Injector, runInInjectionContext } from '@angular/core';
import { Router } from '@angular/router';
import { Subject } from 'rxjs';
import { afterEach, expect, it, vi } from 'vitest';
import { PasswordFormComponent } from '../src/app/components/password-form/password-form';
import { AuthService } from '../src/app/shared/services/auth.service';

const cleanups: Array<() => void> = [];
afterEach(() => cleanups.splice(0).forEach(fn => fn()));
function setup() {
  const response = new Subject<void>();
  const auth = { changePassword: vi.fn(() => response), logout: vi.fn() };
  const router = { navigate: vi.fn().mockResolvedValue(true) };
  const injector = Injector.create({ providers: [
    { provide: AuthService, useValue: auth }, { provide: Router, useValue: router },
  ] });
  cleanups.push(() => injector.destroy());
  const component = runInInjectionContext(injector, () => new PasswordFormComponent());
  return { component, response, auth, router };
}
it.each([
  ['', '', ''], ['oldPassword', 'short', 'short'], ['oldPassword', 'oldPassword', 'oldPassword'],
  ['oldPassword', 'newPassword', 'different'], ['oldPassword', 'é'.repeat(37), 'é'.repeat(37)],
])('rejects invalid password forms', (currentPassword, newPassword, confirmation) => {
  const { component, auth } = setup();
  component.form.setValue({ currentPassword, newPassword, confirmation });
  component.submit();
  expect(auth.changePassword).not.toHaveBeenCalled();
});
it('submits once, clears secrets, logs out and explains success on login', () => {
  const { component, response, auth, router } = setup();
  component.form.setValue({ currentPassword: 'oldPassword', newPassword: 'newPassword', confirmation: 'newPassword' });
  component.submit(); component.submit();
  expect(auth.changePassword).toHaveBeenCalledExactlyOnceWith('oldPassword', 'newPassword');
  expect(component.pending()).toBe(true);
  response.next(); response.complete();
  expect(auth.logout).toHaveBeenCalledOnce();
  expect(component.form.controls.newPassword.value).toBe('');
  expect(router.navigate).toHaveBeenCalledWith(['/login'], {
    queryParams: { reason: 'password-changed', returnUrl: '/profile' }, replaceUrl: true,
  });
});
it('keeps the session and re-enables correction after a wrong current password', () => {
  const { component, response, auth } = setup();
  component.form.setValue({ currentPassword: 'oldPassword', newPassword: 'newPassword', confirmation: 'newPassword' });
  component.submit();
  response.error(new HttpErrorResponse({ status: 403 }));
  expect(auth.logout).not.toHaveBeenCalled();
  expect(component.error()).toContain('actuel est incorrect');
  expect(component.form.enabled).toBe(true);
  expect(component.pending()).toBe(false);
});
