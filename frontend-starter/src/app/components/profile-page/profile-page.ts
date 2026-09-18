import { HttpErrorResponse } from '@angular/common/http';
import { Component, computed, DestroyRef, inject, OnInit, signal } from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { AbstractControl, FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { finalize } from 'rxjs';
import { User } from '../../shared/models/user.model';
import { AuthService } from '../../shared/services/auth.service';
import { PasswordFormComponent } from '../password-form/password-form';

@Component({
  imports: [ReactiveFormsModule, PasswordFormComponent],
  templateUrl: './profile-page.html',
  styleUrl: './profile-page.css',
})
export class ProfilePageComponent implements OnInit {
  private readonly auth = inject(AuthService);
  private readonly destroyRef = inject(DestroyRef);

  readonly user = signal<User | null>(null);
  readonly loading = signal(false);
  readonly saving = signal(false);
  readonly loadError = signal('');
  readonly saveError = signal('');
  readonly success = signal('');
  readonly form = new FormGroup({
    name: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, (control: AbstractControl<string>) =>
        control.value.trim().length >= 2 ? null : { minTrimmedLength: true }],
    }),
  });
  private readonly name = toSignal(this.form.controls.name.valueChanges, { initialValue: '' });
  readonly hasChanges = computed(() => this.name().trim() !== (this.user()?.name ?? ''));
  readonly hasEdits = computed(() => this.name() !== (this.user()?.name ?? ''));
  readonly initials = computed(() => (this.user()?.name ?? '').trim().split(/\s+/)
    .slice(0, 2).map(part => Array.from(part)[0] ?? '').join('').toLocaleUpperCase('fr-FR'));
  readonly memberSince = computed(() => {
    const date = new Date(this.user()?.createdAt ?? '');
    return Number.isNaN(date.getTime()) ? 'Date indisponible'
      : date.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
  });

  ngOnInit(): void {
    this.load();
  }

  load(): void {
    if (this.loading() || this.saving() || this.hasEdits()) return;
    this.loadError.set('');
    this.loading.set(true);
    this.auth.profile().pipe(
      takeUntilDestroyed(this.destroyRef),
      finalize(() => this.loading.set(false)),
    ).subscribe({
      next: (user) => {
        this.user.set(user);
        this.form.reset({ name: user.name });
        console.debug('[ProfilePage] Profil chargé');
      },
      error: (error: HttpErrorResponse) => {
        console.error('[ProfilePage] Échec du chargement HTTP', error.status);
        this.loadError.set(error.status === 0
          ? 'Impossible de joindre le serveur. Vérifiez votre connexion puis réessayez.'
          : 'Impossible de charger votre profil. Veuillez réessayer.');
      },
    });
  }

  clearFeedback(): void {
    this.saveError.set('');
    this.success.set('');
  }

  cancel(): void {
    if (this.saving() || !this.user()) return;
    this.form.reset({ name: this.user()!.name });
    this.clearFeedback();
  }

  save(): void {
    if (this.loading() || this.saving() || !this.user()) return;
    this.form.markAllAsTouched();
    if (this.form.invalid || !this.hasChanges()) return;
    const name = this.form.controls.name.value.trim();
    this.clearFeedback();
    this.saving.set(true);
    this.form.disable();
    this.auth.update(name).pipe(
      takeUntilDestroyed(this.destroyRef),
      finalize(() => {
        this.saving.set(false);
        this.form.enable();
      }),
    ).subscribe({
      next: (user) => {
        this.user.set(user);
        this.form.reset({ name: user.name });
        this.success.set('Votre nom a été mis à jour.');
        console.debug('[ProfilePage] Profil enregistré');
      },
      error: (error: HttpErrorResponse) => {
        console.error('[ProfilePage] Échec de la sauvegarde HTTP', error.status);
        this.saveError.set(error.status === 0
          ? 'Connexion au serveur impossible. Votre saisie est conservée : vous pouvez réessayer.'
          : error.status === 400
            ? 'Le nom a été refusé. Saisissez au moins 2 caractères, hors espaces au début et à la fin.'
            : 'Votre nom n’a pas pu être enregistré. Votre saisie est conservée : réessayez dans un instant.');
      },
    });
  }
}
