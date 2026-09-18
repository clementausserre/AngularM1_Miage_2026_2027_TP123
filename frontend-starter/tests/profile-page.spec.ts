import '@angular/compiler';
import { HttpErrorResponse } from '@angular/common/http';
import { Injector, runInInjectionContext } from '@angular/core';
import { Subject } from 'rxjs';
import { afterEach, expect, it, vi } from 'vitest';
import { ProfilePageComponent } from '../src/app/components/profile-page/profile-page';
import { User } from '../src/app/shared/models/user.model';
import { AuthService } from '../src/app/shared/services/auth.service';

const original: User = { id: '1', name: 'Camille Martin', email: 'camille@example.com', createdAt: '2026-09-17T12:00:00Z' };
const cleanups: Array<() => void> = [];
afterEach(() => cleanups.splice(0).forEach(cleanup => cleanup()));

function setup() {
  const loaded = new Subject<User>();
  const saved = new Subject<User>();
  const auth = { profile: vi.fn(() => loaded), update: vi.fn(() => saved) };
  const injector = Injector.create({ providers: [{ provide: AuthService, useValue: auth }] });
  cleanups.push(() => injector.destroy());
  const component = runInInjectionContext(injector, () => new ProfilePageComponent());
  component.ngOnInit();
  const resolveLoad = () => { loaded.next(original); loaded.complete(); };
  return { component, auth, loaded, saved, injector, resolveLoad };
}

it('loads automatically and prefills the name, initials and French membership date', () => {
  const { component, auth, resolveLoad } = setup();
  expect(auth.profile).toHaveBeenCalledOnce();
  expect(component.loading()).toBe(true);
  component.load();
  expect(auth.profile).toHaveBeenCalledOnce();
  resolveLoad();
  expect(component.loading()).toBe(false);
  expect(component.form.controls.name.value).toBe(original.name);
  expect(component.initials()).toBe('CM');
  expect(component.memberSince()).toBe('17 septembre 2026');
  expect(component.hasChanges()).toBe(false);
});

it('shows a load error and recovers on retry', () => {
  const { component, auth, loaded } = setup();
  loaded.error(new HttpErrorResponse({ status: 0 }));
  expect(component.loadError()).toContain('connexion');
  expect(component.loading()).toBe(false);
  const retry = new Subject<User>();
  auth.profile.mockReturnValueOnce(retry);
  component.load();
  expect(component.loadError()).toBe('');
  retry.next(original);
  retry.complete();
  expect(component.user()).toEqual(original);
});

it.each(['', ' ', 'A', ' A ', 'Camille Martin', ' Camille Martin '])
('does not save invalid or unchanged names: "%s"', (name) => {
  const { component, auth, resolveLoad } = setup();
  resolveLoad();
  component.form.controls.name.setValue(name);
  component.save();
  expect(auth.update).not.toHaveBeenCalled();
});

it('trims names, prevents duplicate writes and displays the server-confirmed result', () => {
  const { component, auth, saved, resolveLoad } = setup();
  resolveLoad();
  component.form.controls.name.setValue('  Nouveau nom  ');
  component.save();
  component.save();
  component.cancel();
  component.load();
  expect(auth.update).toHaveBeenCalledExactlyOnceWith('Nouveau nom');
  expect(auth.profile).toHaveBeenCalledOnce();
  expect(component.form.disabled).toBe(true);
  expect(component.saving()).toBe(true);
  saved.next({ ...original, name: 'Nouveau nom' });
  saved.complete();
  expect(component.user()?.name).toBe('Nouveau nom');
  expect(component.form.controls.name.value).toBe('Nouveau nom');
  expect(component.saving()).toBe(false);
  expect(component.form.enabled).toBe(true);
  expect(component.hasChanges()).toBe(false);
  expect(component.success()).toContain('mis à jour');
});

it('preserves unsaved input after a failure and supports another save', () => {
  const { component, auth, saved, resolveLoad } = setup();
  resolveLoad();
  component.form.controls.name.setValue('Autre nom');
  component.save();
  saved.error(new HttpErrorResponse({ status: 500 }));
  expect(component.saveError()).toContain('conservée');
  expect(component.form.controls.name.value).toBe('Autre nom');
  expect(component.user()?.name).toBe(original.name);
  expect(component.saving()).toBe(false);
  expect(component.form.enabled).toBe(true);
  const retry = new Subject<User>();
  auth.update.mockReturnValueOnce(retry);
  component.save();
  expect(component.saveError()).toBe('');
  retry.next({ ...original, name: 'Autre nom' });
  retry.complete();
  expect(component.success()).toBeTruthy();
});

it('cancels edits without an HTTP request and restores a pristine form', () => {
  const { component, auth, resolveLoad } = setup();
  resolveLoad();
  component.form.controls.name.setValue('Autre nom');
  component.form.markAllAsTouched();
  component.cancel();
  expect(component.form.controls.name.value).toBe(original.name);
  expect(component.form.pristine).toBe(true);
  expect(component.form.untouched).toBe(true);
  expect(component.hasEdits()).toBe(false);
  expect(auth.update).not.toHaveBeenCalled();
});

it('cancels the subscription when the page is destroyed', () => {
  const { component, loaded, injector } = setup();
  injector.destroy();
  loaded.next(original);
  expect(component.user()).toBeNull();
  cleanups.pop();
});
