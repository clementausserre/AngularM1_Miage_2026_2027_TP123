import multer from 'multer';
import crypto from 'node:crypto';
import fs from 'node:fs';
import fsPromises from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

export const UPLOADS = path.resolve('data/uploads');
export const COVERS = path.join(UPLOADS, 'covers');
const INCOMING = path.join(UPLOADS, '.incoming');
const MAX_COVER_SIZE = 5 * 1024 * 1024;
const audioTypes = new Set(['audio/mpeg', 'audio/wav', 'audio/x-wav', 'audio/ogg', 'audio/mp4', 'audio/x-m4a']);
const imageTypes = new Set(['image/jpeg', 'image/png', 'image/webp']);
for (const directory of [UPLOADS, COVERS, INCOMING]) fs.mkdirSync(directory, { recursive: true });

export function uploadError(message, status = 400) {
  return Object.assign(new Error(message), { status, uploadValidation: true });
}

const storage = multer.diskStorage({
  destination: (_req, _file, callback) => callback(null, INCOMING),
  filename: (_req, _file, callback) => callback(null, crypto.randomUUID()),
});

function fileFilter(_req, file, callback) {
  const valid = file.fieldname === 'audio' ? audioTypes.has(file.mimetype) : imageTypes.has(file.mimetype);
  callback(valid ? null : uploadError(file.fieldname === 'audio'
    ? 'Format audio non accepté (MP3, WAV, OGG ou M4A).'
    : 'Format de couverture non accepté (JPEG, PNG ou WebP).'), valid);
}

// Multer's byte limit is shared by the fields. On the combined upload the
// cover's smaller limit is also checked before decoding or keeping the file.
export const uploadTrack = multer({
  storage, fileFilter,
  limits: { fileSize: 25 * 1024 * 1024, files: 2, fields: 1, parts: 4, fieldSize: 4096 },
}).fields([{ name: 'audio', maxCount: 1 }, { name: 'cover', maxCount: 1 }]);

export const uploadCover = multer({
  storage, fileFilter,
  limits: { fileSize: MAX_COVER_SIZE, files: 1, fields: 0, parts: 2 },
}).single('cover');

/** Attempt every cleanup, including when one file cannot be removed. */
export async function removeFiles(paths) {
  const results = await Promise.allSettled(paths.filter(Boolean).map(file => fsPromises.unlink(file)));
  let success = true;
  for (const result of results) {
    if (result.status === 'rejected' && result.reason?.code !== 'ENOENT') {
      success = false;
      console.error('[uploads] Fichier non supprimé', { code: result.reason?.code });
    }
  }
  return success;
}

export async function prepareCover(file) {
  if (!file || !file.size) throw uploadError('Choisissez une image non vide.');
  if (file.size > MAX_COVER_SIZE) throw uploadError('La couverture dépasse la limite de 5 Mo.', 413);
  let output;
  try {
    const image = sharp(file.path, { limitInputPixels: 16_000_000, failOn: 'warning' });
    const metadata = await image.metadata();
    if (!['jpeg', 'png', 'webp'].includes(metadata.format) || (metadata.pages ?? 1) !== 1) {
      throw new Error('Format ou animation refusé');
    }
    output = await image.rotate().resize({ width: 800, height: 800, fit: 'inside', withoutEnlargement: true })
      .webp({ quality: 82 }).toBuffer({ resolveWithObject: true });
  } catch (error) {
    console.warn('[covers] Image non décodable ou dimensions refusées', { name: error.name });
    throw uploadError('Image invalide : JPEG, PNG ou WebP non animé, 16 millions de pixels maximum.');
  }
  const version = crypto.randomUUID();
  const storedName = `${version}.webp`;
  const destination = path.join(COVERS, storedName);
  try {
    await fsPromises.writeFile(destination, output.data, { flag: 'wx' });
  } catch (error) {
    await removeFiles([destination]);
    throw error;
  }
  return { storedName, version, mimeType: 'image/webp', size: output.info.size, width: output.info.width, height: output.info.height };
}

export async function keepAudio(file) {
  if (!file || !file.size) throw uploadError('Fichier audio non vide requis.');
  const extensions = { 'audio/mpeg': '.mp3', 'audio/wav': '.wav', 'audio/x-wav': '.wav', 'audio/ogg': '.ogg', 'audio/mp4': '.m4a', 'audio/x-m4a': '.m4a' };
  const storedName = crypto.randomUUID() + extensions[file.mimetype];
  await fsPromises.rename(file.path, path.join(UPLOADS, storedName));
  return storedName;
}
