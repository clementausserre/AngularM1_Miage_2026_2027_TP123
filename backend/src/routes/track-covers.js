import path from 'node:path';
import { Track } from '../models/Track.js';
import { UPLOADS, COVERS, uploadTrack, uploadCover, uploadError, prepareCover, keepAudio, removeFiles } from '../middleware/track-upload.js';

/** Check ownership before accepting a cover modification body. */
async function ownedTrack(req, res, next) {
  try {
    const track = await Track.findOne({ _id: req.params.id, ownerId: req.auth.sub }).select('+cover.storedName');
    if (!track) return res.status(404).json({ message: 'Piste inconnue' });
    req.track = track;
    next();
  } catch (error) {
    console.error('[covers] Vérification du propriétaire impossible', { name: error.name });
    next(error);
  }
}

// Compare the version to avoid overwriting a concurrent replacement or deletion.
function coverFilter(req) {
  return { _id: req.track._id, ownerId: req.auth.sub,
    ...(req.track.cover ? { 'cover.version': req.track.cover.version } : { cover: null }) };
}

export function registerCoverRoutes(app, auth) {
  app.post('/api/tracks', auth, uploadTrack, async (req, res, next) => {
    const audio = req.files?.audio?.[0];
    const image = req.files?.cover?.[0];
    let storedName, cover, committed = false;
    try {
      if (!audio) throw uploadError('Fichier audio requis.');
      if (image) cover = await prepareCover(image);
      storedName = await keepAudio(audio);
      const track = await Track.create({
        ownerId: req.auth.sub, title: req.body.title || audio.originalname,
        originalName: audio.originalname, storedName, mimeType: audio.mimetype,
        size: audio.size, cover: cover ?? null,
      });
      committed = true;
      res.status(201).json(track.toPublic());
    } catch (error) {
      console.error('[tracks] Échec de l’import', { name: error.name });
      next(error);
    } finally {
      await removeFiles([
        audio?.path, image?.path,
        !committed && storedName ? path.join(UPLOADS, storedName) : null,
        !committed && cover ? path.join(COVERS, cover.storedName) : null,
      ]);
    }
  });

  app.get('/api/tracks/:id/cover', auth, ownedTrack, (req, res, next) => {
    if (!req.track.cover) return res.status(404).json({ message: 'Aucune couverture' });
    res.set({ 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' });
    res.type(req.track.cover.mimeType);
    res.sendFile(path.join(COVERS, req.track.cover.storedName), error => {
      if (error) {
        console.error('[covers] Envoi impossible', { code: error.code });
        if (!res.headersSent) {
          if (error.code === 'ENOENT' || error.status === 404) return res.status(404).json({ message: 'Couverture introuvable' });
          next(error);
        }
      }
    });
  });

  app.put('/api/tracks/:id/cover', auth, ownedTrack, uploadCover, async (req, res, next) => {
    let cover, committed = false;
    try {
      cover = await prepareCover(req.file);
      const track = await Track.findOneAndUpdate(coverFilter(req), { $set: { cover } }, { new: true, runValidators: true });
      if (!track) throw uploadError('Le morceau a changé. Actualisez la bibliothèque.', 409);
      committed = true;
      if (req.track.cover) await removeFiles([path.join(COVERS, req.track.cover.storedName)]);
      res.json(track.toPublic());
    } catch (error) {
      console.error('[covers] Modification impossible', { name: error.name });
      next(error);
    } finally {
      await removeFiles([req.file?.path, !committed && cover ? path.join(COVERS, cover.storedName) : null]);
    }
  });

  app.delete('/api/tracks/:id/cover', auth, ownedTrack, async (req, res, next) => {
    try {
      const track = await Track.findOneAndUpdate(coverFilter(req), { $set: { cover: null } }, { new: true, runValidators: true });
      if (!track) throw uploadError('Le morceau a changé. Actualisez la bibliothèque.', 409);
      if (req.track.cover && !await removeFiles([path.join(COVERS, req.track.cover.storedName)])) {
        return res.status(500).json({ message: 'Couverture retirée, mais nettoyage du fichier incomplet. Actualisez la bibliothèque.' });
      }
      res.status(204).end();
    } catch (error) {
      console.error('[covers] Suppression impossible', { name: error.name });
      next(error);
    }
  });
}
