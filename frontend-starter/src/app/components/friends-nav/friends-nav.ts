import { Component, DestroyRef, DOCUMENT, effect, inject, untracked } from '@angular/core';
import { Router, NavigationEnd, RouterLink, RouterLinkActive } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { filter, fromEvent, Subscription } from 'rxjs';
import { FriendService } from '../../shared/services/friend.service';
import { AuthService } from '../../shared/services/auth.service';

@Component({ selector: 'app-friends-nav', imports: [RouterLink, RouterLinkActive], templateUrl: './friends-nav.html', styleUrl: './friends-nav.css' })
export class FriendsNavComponent {
  readonly friends = inject(FriendService);
  private readonly auth = inject(AuthService);
  private readonly destroyRef = inject(DestroyRef);
  private request?: Subscription;
  constructor() {
    const doc = inject(DOCUMENT);
    effect(() => {
      const token = this.auth.token();
      untracked(() => { this.request?.unsubscribe(); this.friends.incoming.set(0); if (token) this.refresh(); });
    });
    inject(Router).events.pipe(filter(event => event instanceof NavigationEnd), takeUntilDestroyed()).subscribe(() => this.refresh());
    fromEvent(doc, 'visibilitychange').pipe(takeUntilDestroyed()).subscribe(() => { if (doc.visibilityState === 'visible') this.refresh(); });
  }
  private refresh(): void {
    if (!this.auth.token()) return;
    this.request?.unsubscribe();
    this.request = this.friends.summary().pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: result => this.friends.incoming.set(result.incoming),
      error: () => this.friends.incoming.set(0),
    });
  }
}
