export function coverFileError(file: File): string {
  if (!file.size) return 'Cette image est vide.';
  if (file.size > 5 * 1024 * 1024) return 'La couverture dépasse la limite de 5 Mo.';
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)
    || !/\.(jpe?g|png|webp)$/i.test(file.name)) {
    return 'Choisissez une image JPEG, PNG ou WebP.';
  }
  return '';
}
