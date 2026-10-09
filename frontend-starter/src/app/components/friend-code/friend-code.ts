import { Component, DestroyRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { finalize } from 'rxjs';
import { FriendService } from '../../shared/services/friend.service';

@Component({ selector: 'app-friend-code', templateUrl: './friend-code.html', styleUrl: './friend-code.css' })
export class FriendCodeComponent {
  private readonly friends = inject(FriendService);
  private readonly destroyRef = inject(DestroyRef);
  readonly code = signal('');
  readonly loading = signal(false);
  readonly error = signal('');
  readonly message = signal('');
  constructor() { this.load(); }
  load(): void {
    if (this.loading()) return;
    this.loading.set(true); this.error.set('');
    this.friends.code().pipe(takeUntilDestroyed(this.destroyRef), finalize(() => this.loading.set(false))).subscribe({
      next: value => this.code.set(value.code),
      error: () => this.error.set('Votre code ami est indisponible pour le moment.'),
    });
  }
  async copy(): Promise<void> {
    try { await navigator.clipboard.writeText(this.code()); this.message.set('Code copié !'); }
    catch { this.message.set('Copie indisponible : sélectionnez le code pour le copier manuellement.'); }
  }
}
