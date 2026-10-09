import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { afterEach, expect, it, vi } from 'vitest';
import { FriendsPageComponent } from '../src/app/components/friends-page/friends-page';
import { routes } from '../src/app/routes';
import { authGuard } from '../src/app/shared/guards/auth.guard';

afterEach(() => { TestBed.resetTestingModule(); vi.restoreAllMocks(); });
const empty = { items: [], page: 1, pages: 1, total: 0, limit: 12 };
function setup() {
  TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
  const fixture = TestBed.createComponent(FriendsPageComponent);
  fixture.detectChanges();
  const http = TestBed.inject(HttpTestingController);
  http.expectOne('/api/friends?kind=accepted&page=1').flush(empty);
  http.expectOne('/api/friends/code').flush({ code: 'GPC-ABCD-2345' });
  fixture.detectChanges();
  const dialog = { close: vi.fn(), showModal: vi.fn() } as unknown as HTMLDialogElement;
  return { fixture, component: fixture.componentInstance, http, dialog };
}
it('protects the friends route and displays the code and empty state', () => {
  const { fixture, http } = setup();
  expect(routes.find(route => route.path === 'friends')?.canActivate).toContain(authGuard);
  expect(fixture.nativeElement.textContent).toContain('GPC-ABCD-2345');
  expect(fixture.nativeElement.textContent).toContain('Votre communauté commence ici');
  http.verify();
});
it('requires a confirmed lookup before sending and cancels stale searches on input change', () => {
  const { component, http, dialog } = setup();
  component.code.setValue('GPC-ABCD-5678'); component.search();
  const stale = http.expectOne('/api/friends/lookup');
  component.code.setValue('GPC-ABCD-9999');
  expect(stale.cancelled).toBe(true);
  component.send(dialog); http.expectNone('/api/friends/requests');
  component.search();
  http.expectOne('/api/friends/lookup').flush({ user: { id: 'b', name: 'Camille' }, relation: null });
  component.send(dialog); component.send(dialog);
  const sent = http.expectOne('/api/friends/requests');
  expect(sent.request.body).toEqual({ code: 'GPC-ABCD-9999' });
  expect(component.code.disabled).toBe(true);
  sent.flush({ id: 'relationship', status: 'pending' });
  http.expectOne('/api/friends?kind=outgoing&page=1').flush(empty);
  expect(component.code.enabled).toBe(true);
  expect(dialog.close).toHaveBeenCalledOnce();
  expect(component.feedback()).toContain('Demande envoyée'); http.verify();
});
it('handles existing incoming requests and rejects sending a duplicate', () => {
  const { component, http, dialog, fixture } = setup();
  component.code.setValue('GPC-ABCD-5678'); component.search();
  http.expectOne('/api/friends/lookup').flush({ user: { id: 'b', name: 'Camille' }, relation: { id: 'r', status: 'pending', direction: 'incoming' } });
  fixture.detectChanges();
  expect(fixture.nativeElement.textContent).toContain('demandes reçues');
  component.send(dialog); http.expectNone('/api/friends/requests'); http.verify();
});
it('accepts a received request and refreshes the incoming badge and list', () => {
  const { component, http } = setup();
  component.changeKind('incoming');
  const item = { id: 'r', status: 'pending' as const, createdAt: '', user: { id: 'b', name: 'Camille' } };
  http.expectOne('/api/friends?kind=incoming&page=1').flush({ ...empty, items: [item], total: 1 });
  expect(component.friends.incoming()).toBe(1);
  component.accept(item);
  const request = http.expectOne('/api/friends/r/accept'); expect(request.request.method).toBe('PUT');
  request.flush(null);
  http.expectOne('/api/friends?kind=incoming&page=1').flush(empty);
  expect(component.friends.incoming()).toBe(0);
  expect(component.feedback()).toContain('maintenant amis'); http.verify();
});
it('keeps confirmation open on deletion error and permits retry', () => {
  const { component, http, dialog } = setup();
  component.requestRemove({ id: 'r', status: 'accepted', createdAt: '', user: { id: 'b', name: 'Camille' } }, dialog);
  expect(dialog.showModal).toHaveBeenCalledOnce();
  component.confirmRemove(dialog);
  http.expectOne('/api/friends/r').flush({}, { status: 500, statusText: 'Error' });
  expect(component.error()).not.toBe(''); expect(dialog.close).not.toHaveBeenCalled();
  component.confirmRemove(dialog); http.expectOne('/api/friends/r').flush(null);
  http.expectOne('/api/friends?kind=accepted&page=1').flush(empty);
  expect(dialog.close).toHaveBeenCalledOnce(); http.verify();
});
