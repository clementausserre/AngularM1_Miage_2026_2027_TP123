import { HttpErrorResponse } from '@angular/common/http';
import { Component, inject, signal } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { finalize } from 'rxjs';
import { AuthService } from '../../shared/services/auth.service';
import { authErrorMessage } from '../../shared/utils/auth-error-message';

@Component({
  imports: [ReactiveFormsModule, RouterLink],
  templateUrl: './register-page.html',
  styleUrl: './register-page.css',
})
export class RegisterPageComponent {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  readonly error = signal('');
  readonly pending = signal(false);
  readonly form = new FormGroup({
    name: new FormControl('', { nonNullable: true, validators: [Validators.required, Validators.pattern(/\S/)] }),
    email: new FormControl('', { nonNullable: true, validators: [Validators.required, Validators.email] }),
    password: new FormControl('', { nonNullable: true, validators: [Validators.required, Validators.minLength(8)] }),
  });

  submit(): void {
    if (this.pending()) return;
    this.error.set('');
    this.form.markAllAsTouched();
    if (this.form.invalid) return;
    const values = this.form.getRawValue();
    this.pending.set(true);
    this.form.disable();
    this.auth.register(values.name.trim(), values.email, values.password).pipe(finalize(() => {
      this.pending.set(false);
      this.form.enable();
    })).subscribe({
      next: () => {
        console.debug('[RegisterPage] Inscription réussie');
        void this.router.navigateByUrl('/profile');
      },
      error: (error: HttpErrorResponse) => {
        console.error('[RegisterPage] Échec HTTP', error.status);
        this.error.set(authErrorMessage(error, 'register'));
      },
    });
  }
}

