/** Only return to known protected application pages, never to an external URL. */
export function authReturnUrl(value: string | null | undefined, fallback = '/tracks'): string {
  return value && /^\/(tracks|profile|jams(?:\/[a-fA-F0-9]{24})?)(?:[?#].*)?$/.test(value) ? value : fallback;
}
