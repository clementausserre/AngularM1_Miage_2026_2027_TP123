import { HttpErrorResponse } from '@angular/common/http';
import { Component, DestroyRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { finalize } from 'rxjs';
import { AuthService } from '../../shared/services/auth.service';

@Component({
  selector: 'app-password-form',
  imports: [ReactiveFormsModule],
  templateUrl: './password-form.html',
  styleUrl: './password-form.css',
})
export class PasswordFormComponent {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);
  readonly pending = signal(false);
  readonly visible = signal(false);
  readonly error = signal('');
  readonly fields = [
    { key: 'currentPassword', label: 'Mot de passe actuel', autocomplete: 'current-password' },
    { key: 'newPassword', label: 'Nouveau mot de passe', autocomplete: 'new-password' },
    { key: 'confirmation', label: 'Confirmer le nouveau mot de passe', autocomplete: 'new-password' },
  ] as const;
  readonly form = new FormGroup({
    currentPassword: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
    newPassword: new FormControl('', { nonNullable: true, validators: [Validators.required, Validators.minLength(8),
      control => new TextEncoder().encode(control.value as string).length <= 72 ? null : { tooLong: true }] }),
    confirmation: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
  }, { validators: control => {
    const { currentPassword, newPassword, confirmation } = control.getRawValue();
    if (newPassword && newPassword === currentPassword) return { unchanged: true };
    if (confirmation && confirmation !== newPassword) return { mismatch: true };
    return null;
  } });

  reset(): void {
    if (this.pending()) return;
    this.form.reset();
    this.error.set('');
    this.visible.set(false);
  }

  submit(): void {
    if (this.pending()) return;
    this.form.markAllAsTouched();
    this.error.set('');
    if (this.form.invalid) return;
    const { currentPassword, newPassword } = this.form.getRawValue();
    this.pending.set(true);
    this.visible.set(false);
    this.form.disable();
    this.auth.changePassword(currentPassword, newPassword).pipe(
      takeUntilDestroyed(this.destroyRef),
      finalize(() => { this.pending.set(false); this.form.enable(); }),
    ).subscribe({
      next: () => {
        console.debug('[PasswordForm] Mot de passe modifié');
        this.form.reset();
        this.auth.logout();
        void this.router.navigate(['/login'], {
          queryParams: { reason: 'password-changed', returnUrl: '/profile' }, replaceUrl: true,
        });
      },
      error: (error: HttpErrorResponse) => {
        console.error('[PasswordForm] Échec HTTP', error.status);
        this.error.set(error.status === 403 ? 'Le mot de passe actuel est incorrect.'
          : error.status === 400 ? 'Le nouveau mot de passe doit être différent, contenir au moins 8 caractères et ne pas dépasser 72 octets.'
          : error.status === 409 ? 'Votre mot de passe a déjà changé. Déconnectez-vous puis reconnectez-vous.'
          : error.status === 0 ? 'Impossible de joindre le serveur. Vérifiez votre connexion puis réessayez.'
          : 'Impossible de modifier votre mot de passe. Veuillez réessayer.');
      },
    });
  }
}
