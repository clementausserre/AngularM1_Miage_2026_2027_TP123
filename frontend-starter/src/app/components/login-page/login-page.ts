import { HttpErrorResponse } from '@angular/common/http';
import { Component, inject, signal } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { finalize } from 'rxjs';
import { AuthService } from '../../shared/services/auth.service';
import { authErrorMessage } from '../../shared/utils/auth-error-message';
import { authReturnUrl } from '../../shared/utils/auth-return-url';

@Component({
  imports: [ReactiveFormsModule, RouterLink],
  templateUrl: './login-page.html',
  styleUrl: './login-page.css',
})
export class LoginPageComponent {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  readonly requestedReturnUrl = authReturnUrl(this.route.snapshot.queryParamMap.get('returnUrl'), '');
  readonly returnUrl = this.requestedReturnUrl || '/tracks';
  readonly sessionExpired = this.route.snapshot.queryParamMap.get('reason') === 'expired';
  readonly passwordVisible = signal(false);
  readonly error = signal('');
  readonly pending = signal(false);
  readonly form = new FormGroup({
    email: new FormControl('', { nonNullable: true, validators: [Validators.required, Validators.email] }),
    password: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
  });

  submit(formElement?: HTMLFormElement): void {
    if (this.pending()) return;
    this.error.set('');
    this.form.markAllAsTouched();
    if (this.form.invalid) {
      const firstInvalid = Object.entries(this.form.controls).find(([, control]) => control.invalid)?.[0];
      formElement?.querySelector<HTMLInputElement>(`[formControlName="${firstInvalid}"]`)?.focus();
      return;
    }
    const values = this.form.getRawValue();
    this.pending.set(true);
    this.passwordVisible.set(false);
    this.form.disable();
    this.auth.login(values.email, values.password).pipe(finalize(() => {
      this.pending.set(false);
      this.form.enable();
    })).subscribe({
      next: () => {
        console.debug('[LoginPage] Connexion réussie');
        void this.router.navigateByUrl(this.returnUrl, { replaceUrl: true });
      },
      error: (error: HttpErrorResponse) => {
        console.error('[LoginPage] Échec HTTP', error.status);
        this.error.set(authErrorMessage(error, 'login'));
      },
    });
  }
}
