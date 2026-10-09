import { Component, DestroyRef, inject, signal } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormControl, ReactiveFormsModule, Validators } from '@angular/forms';
import { finalize, Subscription } from 'rxjs';
import { FriendService } from '../../shared/services/friend.service';
import { FriendKind, FriendLookup, Friendship } from '../../shared/models/friend.model';
import { FriendCodeComponent } from '../friend-code/friend-code';

@Component({ imports: [ReactiveFormsModule, FriendCodeComponent], templateUrl: './friends-page.html', styleUrl: './friends-page.css' })
export class FriendsPageComponent {
  readonly friends = inject(FriendService);
  private readonly destroyRef = inject(DestroyRef);
  private listRequest?: Subscription;
  private lookupRequest?: Subscription;
  readonly kind = signal<FriendKind>('accepted');
  readonly items = signal<Friendship[]>([]);
  readonly page = signal(1);
  readonly pages = signal(1);
  readonly total = signal(0);
  readonly loading = signal(false);
  readonly busy = signal(false);
  readonly error = signal('');
  readonly feedback = signal('');
  readonly lookup = signal<FriendLookup | null>(null);
  readonly searching = signal(false);
  readonly lookupError = signal('');
  readonly removeTarget = signal<Friendship | null>(null);
  readonly code = new FormControl('', { nonNullable: true, validators: [Validators.required, Validators.maxLength(32)] });
  private confirmedCode = '';

  constructor() {
    this.load();
    this.code.valueChanges.pipe(takeUntilDestroyed()).subscribe(() => {
      this.lookupRequest?.unsubscribe(); this.lookup.set(null); this.lookupError.set(''); this.confirmedCode = '';
    });
  }
  load(): void {
    this.listRequest?.unsubscribe(); this.loading.set(true); this.error.set('');
    this.listRequest = this.friends.list(this.kind(), this.page()).pipe(takeUntilDestroyed(this.destroyRef), finalize(() => this.loading.set(false))).subscribe({
      next: result => {
        if (result.page > result.pages) { this.page.set(result.pages); this.load(); return; }
        this.items.set(result.items); this.pages.set(result.pages); this.total.set(result.total);
        if (this.kind() === 'incoming') this.friends.incoming.set(result.total);
      },
      error: () => this.error.set('Impossible de charger cette liste. Réessayez.'),
    });
  }
  changeKind(kind: FriendKind): void {
    if (this.busy()) return;
    this.kind.set(kind); this.page.set(1); this.items.set([]); this.feedback.set(''); this.load();
  }
  go(page: number): void {
    if (this.loading() || this.busy() || page < 1 || page > this.pages()) return;
    this.page.set(page); this.load();
  }
  openAdd(dialog: HTMLDialogElement): void {
    this.code.reset(); this.lookup.set(null); this.lookupError.set(''); dialog.showModal();
  }
  closeAdd(dialog: HTMLDialogElement): void {
    if (this.busy()) return;
    this.lookupRequest?.unsubscribe(); dialog.close(); this.code.reset();
  }
  search(): void {
    if (this.code.invalid || this.busy()) return;
    this.lookupRequest?.unsubscribe(); this.searching.set(true); this.lookup.set(null); this.lookupError.set('');
    const code = this.code.value;
    this.lookupRequest = this.friends.lookup(code).pipe(takeUntilDestroyed(this.destroyRef), finalize(() => this.searching.set(false))).subscribe({
      next: result => { this.lookup.set(result); this.confirmedCode = code; },
      error: error => this.lookupError.set(this.message(error, 'Recherche impossible. Vérifiez votre connexion.')),
    });
  }
  send(dialog: HTMLDialogElement): void {
    if (this.busy() || !this.lookup() || this.lookup()?.relation || this.code.value !== this.confirmedCode) return;
    this.busy.set(true); this.lookupError.set(''); this.code.disable({ emitEvent: false });
    this.friends.send(this.confirmedCode).pipe(takeUntilDestroyed(this.destroyRef), finalize(() => {
      this.busy.set(false); this.code.enable({ emitEvent: false });
    })).subscribe({
      next: () => {
        dialog.close(); this.lookup.set(null); this.kind.set('outgoing'); this.page.set(1);
        this.feedback.set('Demande envoyée. Votre ami pourra l’accepter depuis ses demandes reçues.'); this.load();
      },
      error: error => this.lookupError.set(this.message(error, 'La demande n’a pas pu être envoyée. Réessayez.')),
    });
  }
  accept(item: Friendship): void { this.mutate(item, true); }
  requestRemove(item: Friendship, dialog: HTMLDialogElement): void {
    if (this.busy()) return;
    this.removeTarget.set(item); dialog.showModal();
  }
  cancelRemove(dialog: HTMLDialogElement): void {
    if (!this.busy()) { dialog.close(); this.removeTarget.set(null); }
  }
  confirmRemove(dialog: HTMLDialogElement): void {
    const item = this.removeTarget(); if (item) this.mutate(item, false, dialog);
  }
  private mutate(item: Friendship, accept: boolean, dialog?: HTMLDialogElement): void {
    if (this.busy()) return;
    this.busy.set(true); this.feedback.set(''); this.error.set('');
    (accept ? this.friends.accept(item.id) : this.friends.remove(item.id)).pipe(takeUntilDestroyed(this.destroyRef), finalize(() => this.busy.set(false))).subscribe({
      next: () => {
        dialog?.close(); this.removeTarget.set(null);
        if (this.kind() === 'incoming') this.friends.incoming.update(count => Math.max(0, count - 1));
        this.feedback.set(accept ? 'Demande acceptée : vous êtes maintenant amis.' : 'La relation a été retirée.');
        this.load();
      },
      error: error => {
        this.error.set(this.message(error, 'Action impossible. Réessayez.'));
        if (error.status === 404) { dialog?.close(); this.removeTarget.set(null); this.load(); this.feedback.set('Cette relation a changé. La liste a été actualisée.'); }
      },
    });
  }
  initials(name: string): string { return name.trim().split(/\s+/).slice(0, 2).map(part => Array.from(part)[0] ?? '').join('').toLocaleUpperCase('fr-FR'); }
  private message(error: HttpErrorResponse, fallback: string): string {
    return [400, 404, 409].includes(error.status) && typeof error.error?.message === 'string' ? error.error.message : fallback;
  }
}
