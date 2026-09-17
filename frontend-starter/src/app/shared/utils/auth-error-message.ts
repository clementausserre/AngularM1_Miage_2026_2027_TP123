import { HttpErrorResponse } from '@angular/common/http';

export function authErrorMessage(error: HttpErrorResponse, action: 'login' | 'register'): string {
  if (error.status === 0) return 'Impossible de joindre le serveur. Vérifiez votre connexion et réessayez.';
  if (error.status === 401 && action === 'login') return 'Email ou mot de passe incorrect. Vérifiez vos identifiants.';
  if (error.status === 409 && action === 'register') return 'Cette adresse email est déjà utilisée. Connectez-vous ou utilisez une autre adresse.';
  if (error.status === 400) return 'Les informations saisies ne sont pas valides. Vérifiez les champs du formulaire.';
  if (error.status === 429) return 'Trop de tentatives. Patientez un moment avant de réessayer.';
  if (error.status >= 500) return 'Le serveur rencontre un problème. Réessayez dans quelques instants.';
  return action === 'login' ? 'La connexion a échoué. Veuillez réessayer.' : 'L’inscription a échoué. Veuillez réessayer.';
}
