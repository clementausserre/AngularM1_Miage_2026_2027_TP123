import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { afterEach, expect, it, vi } from 'vitest';
import { AudioPlayerComponent } from '../src/app/components/audio-player/audio-player';
import { AuthService } from '../src/app/shared/services/auth.service';
import { PlayerService } from '../src/app/shared/services/player.service';

afterEach(() => TestBed.resetTestingModule());

it.each([null, 'another-session'])('stops the player when the session becomes %s', next => {
  const token = signal<string | null>('initial-session');
  const player = {
    selectedTrack: signal(null), playlist: signal(null), audioUrl: signal(''), audioLoading: signal(false),
    audioError: signal(''), advancing: signal(false), nextError: signal(''), advance: vi.fn(), attach: vi.fn(), stop: vi.fn(),
  };
  TestBed.configureTestingModule({ providers: [
    { provide: AuthService, useValue: { token } },
    { provide: PlayerService, useValue: player },
  ] });
  const fixture = TestBed.createComponent(AudioPlayerComponent);
  fixture.detectChanges();
  const audio = fixture.nativeElement.querySelector('audio');
  expect(player.attach).toHaveBeenCalledExactlyOnceWith(audio);
  expect(player.stop).not.toHaveBeenCalled();
  audio.dispatchEvent(new Event('ended'));
  expect(player.advance).toHaveBeenCalledOnce();
  token.set(next);
  fixture.detectChanges();
  expect(player.stop).toHaveBeenCalledOnce();
  expect(fixture.nativeElement.querySelector('audio')).toBe(audio);
});
