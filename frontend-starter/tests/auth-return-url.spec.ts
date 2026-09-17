import { expect, it } from 'vitest';
import { authReturnUrl } from '../src/app/shared/utils/auth-return-url';

it.each(['/tracks', '/profile', '/tracks?page=2', '/profile#name'])('accepts a protected destination: %s', (url) => {
  expect(authReturnUrl(url)).toBe(url);
});

it.each([null, '', 'https://example.com', '//example.com', '/login', '/register', '/unknown', '/tracks/../login', '/tracks(aux:login)'])
('falls back for an invalid or looping destination: %s', (url) => {
  expect(authReturnUrl(url)).toBe('/tracks');
  expect(authReturnUrl(url, '/profile')).toBe('/profile');
});
