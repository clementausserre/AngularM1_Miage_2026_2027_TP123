/** Fail closed in every environment; tests supply their own random secret. */
export function readJwtSecret(environment = process.env) {
  const secret = environment.JWT_SECRET;
  if (typeof secret !== 'string' || !secret.trim() || secret === 'tp1-development-secret') {
    throw new Error('JWT_SECRET doit être configuré avec un secret privé avant de démarrer le backend.');
  }
  return secret;
}
