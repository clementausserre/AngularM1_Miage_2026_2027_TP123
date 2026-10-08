import '@angular/compiler';
import { DOCUMENT, Injector } from '@angular/core';
import { afterEach, expect, it, vi } from 'vitest';
import { LibrarySyncService } from '../src/app/shared/services/library-sync.service';

class FakeChannel extends EventTarget {
  static instances: FakeChannel[] = [];
  readonly postMessage = vi.fn();
  readonly close = vi.fn();
  constructor(readonly name: string) { super(); FakeChannel.instances.push(this); }
}

afterEach(() => { FakeChannel.instances = []; vi.unstubAllGlobals(); });

function setup(withChannel = true) {
  if (withChannel) vi.stubGlobal('BroadcastChannel', FakeChannel);
  else vi.stubGlobal('BroadcastChannel', undefined);
  const document = Object.assign(new EventTarget(), { visibilityState: 'visible' as DocumentVisibilityState });
  const injector = Injector.create({ providers: [LibrarySyncService, { provide: DOCUMENT, useValue: document }] });
  const sync = injector.get(LibrarySyncService);
  const onChange = vi.fn();
  const subscription = sync.changes.subscribe(onChange);
  return { sync, document, injector, onChange, subscription, channel: FakeChannel.instances[0] };
}

it('posts a data-free message on the shared channel after a change', () => {
  const { sync, channel } = setup();
  expect(channel.name).toBe('gpc-library');
  sync.notifyChanged();
  expect(channel.postMessage).toHaveBeenCalledExactlyOnceWith('changed');
});

it('asks a visible tab to reload when another tab changed the library', () => {
  const { channel, onChange } = setup();
  channel.dispatchEvent(new Event('message'));
  expect(onChange).toHaveBeenCalledOnce();
});

it('lets a hidden tab wait, then reloads it when the user comes back', () => {
  const { channel, document, onChange } = setup();
  document.visibilityState = 'hidden';
  channel.dispatchEvent(new Event('message'));
  document.dispatchEvent(new Event('visibilitychange'));
  expect(onChange).not.toHaveBeenCalled();
  document.visibilityState = 'visible';
  document.dispatchEvent(new Event('visibilitychange'));
  expect(onChange).toHaveBeenCalledOnce();
});

it('closes the channel when the application is destroyed', () => {
  const { channel, injector, subscription } = setup();
  subscription.unsubscribe();
  injector.destroy();
  expect(channel.close).toHaveBeenCalledOnce();
});

it('still reloads on return to the tab when BroadcastChannel is unavailable', () => {
  const { sync, document, onChange } = setup(false);
  expect(() => sync.notifyChanged()).not.toThrow();
  document.dispatchEvent(new Event('visibilitychange'));
  expect(onChange).toHaveBeenCalledOnce();
});
