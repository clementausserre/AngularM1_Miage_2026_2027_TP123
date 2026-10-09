import { Component, inject } from '@angular/core';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { AuthService } from '../../shared/services/auth.service';
import { AudioPlayerComponent } from '../audio-player/audio-player';
import { FriendsNavComponent } from '../friends-nav/friends-nav';

@Component({
  selector: 'app-root',
  imports: [RouterLink, RouterLinkActive, RouterOutlet, AudioPlayerComponent, FriendsNavComponent],
  templateUrl: './app.html',
  styleUrl: './app.css',
})
export class AppComponent {
  readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  logout(): void {
    this.auth.logout();
    void this.router.navigateByUrl('/login', { replaceUrl: true });
  }
}
