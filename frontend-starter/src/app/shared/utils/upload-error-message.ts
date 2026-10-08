import { HttpErrorResponse } from '@angular/common/http';

export function uploadErrorMessage(error: HttpErrorResponse): string {
  if ([400, 404, 409, 413].includes(error.status) && typeof error.error?.message === 'string') {
    return error.error.message;
  }
  if (error.status === 0) return 'Serveur inaccessible. Votre sélection est conservée pour réessayer.';
  if (error.status === 400 || error.status === 413) return 'Import refusé. Vérifiez le format et la taille des fichiers.';
  return 'L’enregistrement n’a pas pu être confirmé. Actualisez la bibliothèque avant de réessayer.';
}
