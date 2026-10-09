import { Router } from 'express';
import { isObjectIdOrHexString } from 'mongoose';
import { Playlist } from '../models/Playlist.js';
import { Track, publicTrack } from '../models/Track.js';

const validName = value => typeof value === 'string' && value.trim().length > 0 && value.trim().length <= 100;
const validIds = value => Array.isArray(value) && value.length <= 200 && value.every(id => typeof id === 'string' && isObjectIdOrHexString(id))
  && new Set(value.map(id => id.toLowerCase())).size === value.length;

async function visibleTracks(playlist) {
  const rows = await Track.find({ _id: { $in: playlist.trackIds }, ownerId: playlist.ownerId }).select('-storedName -cover.storedName').lean();
  const byId = new Map(rows.map(track => [String(track._id), track]));
  return playlist.trackIds.map(id => byId.get(String(id))).filter(Boolean).map(publicTrack);
}
async function present(playlist, detail = true) {
  const tracks = await visibleTracks(playlist);
  return { id: String(playlist._id), name: playlist.name, version: playlist.version,
    createdAt: playlist.createdAt, updatedAt: playlist.updatedAt,
    trackCount: tracks.length, preview: tracks[0] ?? null, ...(detail ? { tracks } : {}) };
}

export function playlistsRouter(auth) {
  const router = Router();
  router.use(auth);
  router.use((_req, res, next) => { res.set('Cache-Control', 'private, no-store'); next(); });
  router.param('id', (req, res, next, id) => {
    if (!isObjectIdOrHexString(id)) return res.status(404).json({ message: 'Playlist introuvable.' });
    next();
  });
  router.get('/', async (req, res, next) => {
    const page = Number(req.query.page ?? 1);
    if (!Number.isSafeInteger(page) || page < 1 || page > 100000) return res.status(400).json({ message: 'Page invalide.' });
    try {
      const filter = { ownerId: req.auth.sub };
      const [rows, total] = await Promise.all([
        Playlist.find(filter).sort({ createdAt: -1, _id: -1 }).skip((page - 1) * 12).limit(12).lean(),
        Playlist.countDocuments(filter),
      ]);
      res.json({ items: await Promise.all(rows.map(row => present(row, false))), page, limit: 12, total, pages: Math.max(1, Math.ceil(total / 12)) });
    } catch (error) { next(error); }
  });
  router.post('/', (req, res, next) => {
    if (!validName(req.body?.name)) return res.status(400).json({ message: 'Choisissez un nom de 1 à 100 caractères.' });
    next();
  }, async (req, res, next) => {
    try {
      const row = await Playlist.create({ ownerId: req.auth.sub, name: req.body.name.trim() });
      res.status(201).json(await present(row));
    } catch (error) { next(error); }
  });
  router.get('/:id', async (req, res, next) => {
    try {
      const row = await Playlist.findOne({ _id: req.params.id, ownerId: req.auth.sub }).lean();
      if (!row) return res.status(404).json({ message: 'Playlist introuvable.' });
      res.json(await present(row));
    } catch (error) { next(error); }
  });
  router.put('/:id', (req, res, next) => {
    const body = req.body;
    if (!body || !Number.isSafeInteger(body.version) || body.version < 0 ||
      (body.name === undefined && body.trackIds === undefined) ||
      (body.name !== undefined && !validName(body.name)) ||
      (body.trackIds !== undefined && !validIds(body.trackIds))) {
      return res.status(400).json({ message: 'Nom, liste de morceaux ou version invalide (200 morceaux maximum, sans doublon).' });
    }
    next();
  }, async (req, res, next) => {
    try {
      const filter = { _id: req.params.id, ownerId: req.auth.sub };
      const row = await Playlist.findOne(filter).lean();
      if (!row) return res.status(404).json({ message: 'Playlist introuvable.' });
      const update = {};
      if (req.body.name !== undefined) update.name = req.body.name.trim();
      if (req.body.trackIds !== undefined) {
        const ids = req.body.trackIds.map(id => id.toLowerCase());
        const count = await Track.countDocuments({ _id: { $in: ids }, ownerId: req.auth.sub });
        if (count !== ids.length) return res.status(404).json({ message: 'Un morceau est absent ou inaccessible. Actualisez la playlist.' });
        update.trackIds = ids;
      }
      const saved = await Playlist.findOneAndUpdate({ ...filter, version: req.body.version },
        { $set: update, $inc: { version: 1 } }, { new: true, runValidators: true }).lean();
      if (!saved) return res.status(409).json({ message: 'Cette playlist a changé. Actualisez-la avant de réessayer.' });
      res.json(await present(saved));
    } catch (error) { next(error); }
  });
  router.post('/:id/tracks', (req, res, next) => {
    if (typeof req.body?.trackId !== 'string' || !isObjectIdOrHexString(req.body.trackId)) return res.status(400).json({ message: 'Morceau invalide.' });
    next();
  }, async (req, res, next) => {
    try {
      const filter = { _id: req.params.id, ownerId: req.auth.sub };
      const row = await Playlist.findOne(filter).lean();
      if (!row) return res.status(404).json({ message: 'Playlist introuvable.' });
      const track = await Track.findOne({ _id: req.body.trackId, ownerId: req.auth.sub }).lean();
      if (!track) return res.status(404).json({ message: 'Morceau introuvable.' });
      // Prune deleted references when adding, without changing the order of surviving tracks.
      const ids = (await visibleTracks(row)).map(item => item.id);
      if (ids.includes(String(track._id))) return res.json(await present(row));
      if (ids.length >= 200) return res.status(400).json({ message: 'Cette playlist contient déjà 200 morceaux.' });
      const saved = await Playlist.findOneAndUpdate({ ...filter, version: row.version },
        { $set: { trackIds: [...ids, String(track._id)] }, $inc: { version: 1 } }, { new: true, runValidators: true }).lean();
      if (!saved) return res.status(409).json({ message: 'La playlist a changé. Réessayez l’ajout.' });
      res.json(await present(saved));
    } catch (error) { next(error); }
  });
  router.delete('/:id', async (req, res, next) => {
    try {
      const row = await Playlist.findOneAndDelete({ _id: req.params.id, ownerId: req.auth.sub });
      if (!row) return res.status(404).json({ message: 'Playlist introuvable.' });
      res.sendStatus(204);
    } catch (error) { next(error); }
  });
  return router;
}
