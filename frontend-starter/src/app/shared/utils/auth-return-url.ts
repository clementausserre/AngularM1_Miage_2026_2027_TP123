/** Only return to known protected application pages, never to an external URL. */
export function authReturnUrl(value: string | null | undefined, fallback = '/tracks'): string {
  return value && /^\/(tracks|profile)(?:[?#].*)?$/.test(value) ? value : fallback;
}
