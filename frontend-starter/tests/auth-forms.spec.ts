import '@angular/compiler';
import { HttpErrorResponse } from '@angular/common/http';
import { Injector, runInInjectionContext } from '@angular/core';
import { Router } from '@angular/router';
import { Subject } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';
import { LoginPageComponent } from '../src/app/components/login-page/login-page';
import { RegisterPageComponent } from '../src/app/components/register-page/register-page';
import { AuthService } from '../src/app/shared/services/auth.service';
import { authErrorMessage } from '../src/app/shared/utils/auth-error-message';

for (const Component of [LoginPageComponent, RegisterPageComponent]) {
  describe(Component.name, () => {
    function setup() {
      const response = new Subject<unknown>();
      const request = vi.fn(() => response);
      const router = { navigateByUrl: vi.fn().mockResolvedValue(true) };
      const injector = Injector.create({ providers: [
        { provide: AuthService, useValue: { login: request, register: request } },
        { provide: Router, useValue: router },
      ] });
      const component = runInInjectionContext(injector, () => new Component());
      return { component, response, request, router };
    }

    it('rejects empty or invalid fields before making a request', () => {
      const { component, request } = setup();
      component.submit();
      expect(request).not.toHaveBeenCalled();
      expect(component.form.controls.email.touched).toBe(true);
      component.form.patchValue({ email: 'invalid', password: 'long-enough' });
      component.submit();
      expect(request).not.toHaveBeenCalled();
    });

    it('prevents duplicate requests, recovers after failure and allows a retry', () => {
      const { component, response, request } = setup();
      component.form.patchValue({ email: 'test@example.com', password: 'long-enough' });
      if (component instanceof RegisterPageComponent) component.form.controls.name.setValue('Test');
      component.submit();
      component.submit();
      expect(request).toHaveBeenCalledTimes(1);
      expect(component.pending()).toBe(true);
      expect(component.form.disabled).toBe(true);
      response.error(new HttpErrorResponse({ status: 503 }));
      expect(component.pending()).toBe(false);
      expect(component.form.enabled).toBe(true);
      expect(component.error()).toContain('serveur');
      component.submit();
      expect(request).toHaveBeenCalledTimes(2);
    });

    it('navigates after successful authentication', () => {
      const { component, response, router } = setup();
      component.form.patchValue({ email: 'test@example.com', password: 'long-enough' });
      if (component instanceof RegisterPageComponent) component.form.controls.name.setValue('Test');
      component.submit();
      response.next({});
      response.complete();
      expect(router.navigateByUrl).toHaveBeenCalledWith(component instanceof RegisterPageComponent ? '/profile' : '/tracks');
      expect(component.pending()).toBe(false);
    });

    if (Component === RegisterPageComponent) {
      it('rejects whitespace-only names and passwords shorter than eight characters', () => {
        const { component, request } = setup();
        const register = component as RegisterPageComponent;
        register.form.setValue({ name: '   ', email: 'test@example.com', password: 'short' });
        register.submit();
        expect(register.form.controls.name.invalid).toBe(true);
        expect(register.form.controls.password.hasError('minlength')).toBe(true);
        expect(request).not.toHaveBeenCalled();
      });
    }
  });
}

it('provides understandable messages without displaying raw server errors', () => {
  for (const [status, action, text] of [
    [0, 'login', 'connexion'], [401, 'login', 'incorrect'],
    [409, 'register', 'déjà utilisée'], [400, 'register', 'champs'],
    [429, 'login', 'tentatives'], [500, 'register', 'serveur'],
    [403, 'login', 'échoué'],
  ] as const) {
    const message = authErrorMessage(new HttpErrorResponse({ status, error: { message: 'technical detail' } }), action);
    expect(message).toContain(text);
    expect(message).not.toContain('technical detail');
  }
});
