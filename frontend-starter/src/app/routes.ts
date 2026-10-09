import { Routes } from '@angular/router';
import { authGuard } from './shared/guards/auth.guard';
import { guestGuard } from './shared/guards/guest.guard';
import { LoginPageComponent } from './components/login-page/login-page';
import { ProfilePageComponent } from './components/profile-page/profile-page';
import { RegisterPageComponent } from './components/register-page/register-page';
import { TracksPageComponent } from './components/tracks-page/tracks-page';
import { FriendsPageComponent } from './components/friends-page/friends-page';
import { PlaylistsPageComponent } from './components/playlists-page/playlists-page';

export const routes: Routes = [
  { path: '', pathMatch: 'full', redirectTo: 'tracks' },
  { path: 'login', component: LoginPageComponent, canActivate: [guestGuard] },
  { path: 'register', component: RegisterPageComponent, canActivate: [guestGuard] },
  { path: 'profile', component: ProfilePageComponent, canActivate: [authGuard] },
  { path: 'tracks', component: TracksPageComponent, canActivate: [authGuard] },
  { path: 'friends', component: FriendsPageComponent, canActivate: [authGuard] },
  { path: 'playlists', component: PlaylistsPageComponent, canActivate: [authGuard] },
  { path: 'playlists/:id', component: PlaylistsPageComponent, canActivate: [authGuard] },
  { path: '**', redirectTo: 'tracks' },
];
