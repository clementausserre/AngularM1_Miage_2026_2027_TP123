import { DestroyRef, DOCUMENT, inject, Injectable, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { filter, Subject, tap } from 'rxjs';
import { AuthResponse } from '../models/auth-response.model';
import { User } from '../models/user.model';

/** Handles authentication and the current user's profile. */
@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly http = inject(HttpClient);
  private readonly document = inject(DOCUMENT);
  private readonly externalSessionChange = new Subject<void>();
  readonly externalSessionChanges = this.externalSessionChange.asObservable();

  readonly currentUser = signal<User | null>(null);
  readonly token = signal<string | null>(localStorage.getItem('gpc_token'));

  constructor() {
    const browser = this.document.defaultView;
    if (!browser) return;
    const reconcile = () => {
      // Read the current value, not an older storage event queued in a hidden tab.
      const storedToken = localStorage.getItem('gpc_token');
      if (storedToken === this.token()) return;
      this.token.set(storedToken);
      this.currentUser.set(null);
      this.externalSessionChange.next();
      // A full reload also clears routed component state, audio Blobs and forms.
      // The route guards then evaluate the new session on the current URL.
      browser.location.reload();
    };
    const onStorage = (event: StorageEvent) => {
      if (event.storageArea === localStorage && (event.key === 'gpc_token' || event.key === null)) reconcile();
    };
    const onVisibility = () => { if (this.document.visibilityState === 'visible') reconcile(); };
    browser.addEventListener('storage', onStorage);
    this.document.addEventListener('visibilitychange', onVisibility);
    inject(DestroyRef).onDestroy(() => {
      browser.removeEventListener('storage', onStorage);
      this.document.removeEventListener('visibilitychange', onVisibility);
      this.externalSessionChange.complete();
    });
  }

  login(email: string, password: string) {
    return this.http
      .post<AuthResponse>('/api/auth/login', { email, password })
      .pipe(tap((response) => this.storeAuthentication(response)));
  }

  register(name: string, email: string, password: string) {
    return this.http
      .post<AuthResponse>('/api/auth/register', { name, email, password })
      .pipe(tap((response) => this.storeAuthentication(response)));
  }

  profile() {
    const token = this.token();
    return this.http
      .get<User>('/api/users/me')
      .pipe(filter(() => this.token() === token), tap((user) => this.currentUser.set(user)));
  }

  update(name: string) {
    const token = this.token();
    return this.http
      .put<User>('/api/users/me', { name })
      .pipe(filter(() => this.token() === token), tap((user) => this.currentUser.set(user)));
  }

  logout(): void {
    localStorage.removeItem('gpc_token');
    this.token.set(null);
    this.currentUser.set(null);
  }

  changePassword(currentPassword: string, newPassword: string) {
    return this.http.put<void>('/api/users/me/password', { currentPassword, newPassword });
  }

  private storeAuthentication(response: AuthResponse): void {
    localStorage.setItem('gpc_token', response.token);
    this.token.set(response.token);
    this.currentUser.set(response.user);
  }
}
