import { Component, DestroyRef, DOCUMENT, inject, signal } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { FormControl, ReactiveFormsModule, Validators } from '@angular/forms';
import { Observable, Subscription, finalize, timer } from 'rxjs';
import { JamService } from '../../shared/services/jam.service';
import { FriendService } from '../../shared/services/friend.service';
import { Jam, JamKind, JamSummary } from '../../shared/models/jam.model';
import { Friendship } from '../../shared/models/friend.model';

@Component({
  imports: [RouterLink, ReactiveFormsModule],
  templateUrl: './jams-page.html',
  styleUrl: './jams-page.css',
})
export class JamsPageComponent {
  private readonly service = inject(JamService);
  private readonly friendsService = inject(FriendService);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);
  private readonly document = inject(DOCUMENT);
  private request?: Subscription;
  private mutation?: Subscription;
  private friendRequest?: Subscription;
  readonly id = signal<string | null>(null);
  readonly kind = signal<JamKind>('joined');
  readonly selected = signal<Jam | null>(null);
  readonly items = signal<JamSummary[]>([]);
  readonly page = signal(1);
  readonly pages = signal(1);
  readonly loading = signal(false);
  readonly busy = signal(false);
  readonly error = signal('');
  readonly feedback = signal('');
  readonly confirmingLeave = signal(false);
  readonly friends = signal<Friendship[]>([]);
  readonly friendPage = signal(1);
  readonly friendPages = signal(1);
  readonly friendsLoading = signal(false);
  readonly friendsError = signal('');
  readonly name = new FormControl('', { nonNullable: true, validators: [Validators.required, Validators.maxLength(100)] });

  constructor() {
    inject(ActivatedRoute).paramMap.pipe(takeUntilDestroyed()).subscribe(params => {
      this.request?.unsubscribe(); this.mutation?.unsubscribe(); this.friendRequest?.unsubscribe();
      this.id.set(params.get('id')); this.selected.set(null); this.items.set([]);
      this.friends.set([]); this.friendPage.set(1); this.friendsError.set('');
      this.page.set(1); this.confirmingLeave.set(false); this.feedback.set('');
      this.load();
    });
    timer(10000, 10000).pipe(takeUntilDestroyed()).subscribe(() => {
      if (this.document.visibilityState === 'visible' && !this.loading() && !this.busy() && !this.confirmingLeave()) this.load(true);
    });
  }

  load(silent = false): void {
    if (this.busy()) return;
    this.request?.unsubscribe(); this.loading.set(true);
    if (!silent) this.error.set('');
    const id = this.id();
    if (id) {
      this.request = this.service.get(id).pipe(takeUntilDestroyed(this.destroyRef), finalize(() => this.loading.set(false))).subscribe({
        next: jam => {
          const firstHostLoad = this.selected()?.role !== 'host' && jam.role === 'host';
          this.selected.set(jam); this.error.set('');
          if (firstHostLoad) this.loadFriends(1);
        },
        error: (error: HttpErrorResponse) => {
          if (error.status === 404) { this.selected.set(null); this.confirmingLeave.set(false); this.friends.set([]); }
          this.error.set(this.message(error));
        },
      });
    } else {
      this.request = this.service.list(this.kind(), this.page()).pipe(takeUntilDestroyed(this.destroyRef), finalize(() => this.loading.set(false))).subscribe({
        next: result => {
          if (result.page > result.pages) { this.page.set(result.pages); this.load(); return; }
          this.items.set(result.items); this.pages.set(result.pages); this.error.set('');
        },
        error: (error: HttpErrorResponse) => this.error.set(this.message(error)),
      });
    }
  }

  changeKind(kind: JamKind): void {
    if (this.busy()) return;
    this.kind.set(kind); this.page.set(1); this.items.set([]); this.feedback.set(''); this.load();
  }
  go(page: number): void {
    if (this.busy() || this.loading() || page < 1 || page > this.pages()) return;
    this.page.set(page); this.load();
  }
  create(): void {
    if (this.busy() || this.name.invalid || !this.name.value.trim()) return;
    this.request?.unsubscribe(); this.busy.set(true); this.error.set(''); this.name.disable();
    this.mutation = this.service.create(this.name.value.trim()).pipe(takeUntilDestroyed(this.destroyRef),
      finalize(() => { this.busy.set(false); this.name.enable(); })).subscribe({
      next: jam => { this.name.reset(); void this.router.navigate(['/jams', jam.id]); },
      error: (error: HttpErrorResponse) => this.error.set(this.message(error)),
    });
  }
  accept(jam: JamSummary): void {
    this.act(this.service.accept(jam.id), () => { void this.router.navigate(['/jams', jam.id]); });
  }
  decline(jam: JamSummary): void {
    this.act(this.service.decline(jam.id), () => { this.feedback.set('Invitation refusée.'); this.load(); });
  }
  invite(userId: string): void {
    const jam = this.selected();
    if (!jam || jam.role !== 'host') return;
    this.act(this.service.invite(jam.id, userId), () => { this.feedback.set('Invitation envoyée.'); this.load(); });
  }
  leave(): void {
    const jam = this.selected();
    if (!jam || !this.confirmingLeave()) return;
    this.act(this.service.leave(jam.id), () => { this.kind.set('joined'); void this.router.navigateByUrl('/jams'); });
  }
  private act(operation: Observable<void>, success: () => void): void {
    if (this.busy()) return;
    this.request?.unsubscribe(); this.busy.set(true); this.error.set(''); this.feedback.set('');
    this.mutation = operation.pipe(takeUntilDestroyed(this.destroyRef), finalize(() => this.busy.set(false))).subscribe({
      next: () => { this.busy.set(false); success(); },
      error: (error: HttpErrorResponse) => this.error.set(this.message(error)),
    });
  }
  loadFriends(page = this.friendPage()): void {
    if (this.selected()?.role !== 'host' || this.busy() || page < 1) return;
    this.friendRequest?.unsubscribe(); this.friendsLoading.set(true); this.friendsError.set('');
    this.friendRequest = this.friendsService.list('accepted', page).pipe(takeUntilDestroyed(this.destroyRef),
      finalize(() => this.friendsLoading.set(false))).subscribe({
      next: result => {
        if (result.page > result.pages) { this.loadFriends(result.pages); return; }
        this.friends.set(result.items); this.friendPage.set(result.page); this.friendPages.set(result.pages);
      },
      error: () => this.friendsError.set('Impossible de charger vos amis. Réessayez.'),
    });
  }
  inviteLabel(userId: string): string {
    const jam = this.selected();
    if (jam?.participants.some(user => user.id === userId)) return 'Déjà dans la jam';
    if (jam?.invitations.some(user => user.id === userId)) return 'Invitation envoyée';
    return 'Inviter';
  }
  private message(error: HttpErrorResponse): string {
    return [400, 404, 409].includes(error.status) && typeof error.error?.message === 'string'
      ? error.error.message : 'Opération impossible. Vérifiez votre connexion et réessayez.';
  }
}
