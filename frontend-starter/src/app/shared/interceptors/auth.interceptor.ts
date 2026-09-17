import { inject } from '@angular/core';
import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { Router } from '@angular/router';
import { catchError, throwError } from 'rxjs';
import { AuthService } from '../services/auth.service';
import { authReturnUrl } from '../utils/auth-return-url';

/** Adds API credentials and clears the session when the API rejects them. */
export const authInterceptor: HttpInterceptorFn = (request, next) => {
  const auth = inject(AuthService);
  const router = inject(Router);
  const token = auth.token();
  const path = request.url.split(/[?#]/)[0];
  const isProtectedApi = path.startsWith('/api/')
    && path !== '/api/auth/login'
    && path !== '/api/auth/register'
    && path !== '/api/health';

  return next(
    token && isProtectedApi
      ? request.clone({
          setHeaders: { Authorization: `Bearer ${token}` },
        })
      : request,
  ).pipe(catchError((error: unknown) => {
    // Ignore late failures belonging to a session that has already changed.
    if (error instanceof HttpErrorResponse && error.status === 401
      && isProtectedApi && auth.token() === token) {
      const returnUrl = authReturnUrl(router.currentNavigation()?.finalUrl?.toString() ?? router.url);
      auth.logout();
      void router.navigate(['/login'], {
        queryParams: { returnUrl, ...(token ? { reason: 'expired' } : {}) },
        replaceUrl: true,
      });
    }
    return throwError(() => error);
  }));
};
