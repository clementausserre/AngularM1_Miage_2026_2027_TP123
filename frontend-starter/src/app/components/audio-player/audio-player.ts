import { AfterViewInit, Component, ElementRef, effect, inject, untracked, viewChild } from '@angular/core';
import { AuthService } from '../../shared/services/auth.service';
import { PlayerService } from '../../shared/services/player.service';
import { TrackCoverComponent } from '../track-cover/track-cover';

@Component({
  selector: 'app-audio-player',
  imports: [TrackCoverComponent],
  templateUrl: './audio-player.html',
  styleUrl: './audio-player.css',
})
export class AudioPlayerComponent implements AfterViewInit {
  readonly player = inject(PlayerService);
  private readonly auth = inject(AuthService);
  private readonly audio = viewChild.required<ElementRef<HTMLAudioElement>>('audio');

  constructor() {
    let token = this.auth.token();
    effect(() => {
      const next = this.auth.token();
      if (next !== token) untracked(() => this.player.stop());
      token = next;
    });
  }

  ngAfterViewInit(): void { this.player.attach(this.audio().nativeElement); }
}
