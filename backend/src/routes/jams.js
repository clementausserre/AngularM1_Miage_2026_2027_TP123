import { Router } from 'express';
import { isObjectIdOrHexString } from 'mongoose';
import { Jam } from '../models/Jam.js';
import { User } from '../models/User.js';
import { Friendship, friendPair } from '../models/Friendship.js';

const includes = (ids, id) => ids.some(value => String(value) === String(id));

async function publicJams(rows, me, detail = false) {
  const ids = rows.flatMap(row => detail ? [row.hostId, ...row.participantIds,
    ...(String(row.hostId) === me ? row.invitedIds : [])] : [row.hostId]);
  const users = await User.find({ _id: { $in: ids } }).select('name').lean();
  const names = new Map(users.map(user => [String(user._id), user.name]));
  const person = id => ({ id: String(id), name: names.get(String(id)) ?? 'Compte supprimé' });
  return rows.map(row => ({
    id: String(row._id), name: row.name, host: person(row.hostId), createdAt: row.createdAt,
    role: String(row.hostId) === me ? 'host' : includes(row.participantIds, me) ? 'participant' : 'invited',
    ...(detail ? { participants: row.participantIds.map(person),
      invitations: String(row.hostId) === me ? row.invitedIds.map(person) : [] } : {}),
  }));
}

// Conditional writes serialize invitation, acceptance, departure and closure races.
async function save(row, changes, res) {
  const updated = await Jam.findOneAndUpdate({ _id: row._id, active: true, version: row.version },
    { $set: changes, $inc: { version: 1 } }, { new: true, runValidators: true });
  if (!updated) { res.status(409).json({ message: 'La jam a changé. Actualisez puis réessayez.' }); return; }
  res.sendStatus(204);
}

export function jamsRouter(auth) {
  const router = Router();
  router.use(auth);
  router.use((_req, res, next) => { res.set('Cache-Control', 'private, no-store'); next(); });

  router.get('/', async (req, res, next) => {
    const kind = req.query.kind ?? 'joined', page = Number(req.query.page ?? 1);
    if (!['joined', 'invitations'].includes(kind) || !Number.isSafeInteger(page) || page < 1 || page > 100000) {
      return res.status(400).json({ message: 'Pagination ou catégorie invalide.' });
    }
    const filter = { active: true, [kind === 'joined' ? 'participantIds' : 'invitedIds']: req.auth.sub };
    try {
      const [rows, total] = await Promise.all([
        Jam.find(filter).sort({ createdAt: -1, _id: -1 }).skip((page - 1) * 12).limit(12).lean(),
        Jam.countDocuments(filter),
      ]);
      res.json({ items: await publicJams(rows, req.auth.sub), page, limit: 12, total, pages: Math.max(1, Math.ceil(total / 12)) });
    } catch (error) { next(error); }
  });
  router.post('/', async (req, res, next) => {
    const name = req.body?.name;
    if (typeof name !== 'string' || !name.trim() || name.trim().length > 100) {
      return res.status(400).json({ message: 'Le nom doit contenir entre 1 et 100 caractères.' });
    }
    try {
      const jam = await Jam.create({ name: name.trim(), hostId: req.auth.sub, participantIds: [req.auth.sub] });
      res.status(201).json({ id: jam.id });
    } catch (error) {
      if (error.code === 11000) return res.status(409).json({ message: 'Vous animez déjà une jam. Retrouvez-la dans Mes jams ou fermez-la avant d’en créer une autre.' });
      next(error);
    }
  });
  router.param('id', (_req, res, next, id) => {
    if (!isObjectIdOrHexString(id)) return res.status(404).json({ message: 'Jam indisponible.' });
    next();
  });
  router.get('/:id', async (req, res, next) => {
    try {
      const row = await Jam.findOne({ _id: req.params.id, active: true, participantIds: req.auth.sub }).lean();
      if (!row) return res.status(404).json({ message: 'Cette jam est terminée ou vous n’y participez pas.' });
      res.json((await publicJams([row], req.auth.sub, true))[0]);
    } catch (error) { next(error); }
  });
  router.post('/:id/invitations', async (req, res, next) => {
    const raw = req.body?.userId;
    if (typeof raw !== 'string' || !isObjectIdOrHexString(raw)) {
      return res.status(400).json({ message: 'Choisissez un ami à inviter.' });
    }
    const userId = raw.toLowerCase();
    if (userId === req.auth.sub) return res.status(400).json({ message: 'Choisissez un ami à inviter.' });
    try {
      const row = await Jam.findOne({ _id: req.params.id, active: true, hostId: req.auth.sub }).lean();
      if (!row) return res.status(404).json({ message: 'Jam indisponible ou vous n’en êtes pas l’hôte.' });
      const friend = await Friendship.findOne({ pair: friendPair(req.auth.sub, userId), status: 'accepted' }).lean();
      const exists = friend && await User.exists({ _id: userId });
      if (!exists) return res.status(404).json({ message: 'Cet ami n’est plus disponible.' });
      if (includes(row.participantIds, userId) || includes(row.invitedIds, userId)) {
        return res.status(409).json({ message: 'Cet ami participe déjà ou a déjà été invité.' });
      }
      if (row.participantIds.length + row.invitedIds.length >= 20) {
        return res.status(409).json({ message: 'La jam est limitée à 20 participants, invitations comprises.' });
      }
      await save(row, { invitedIds: [...row.invitedIds, userId] }, res);
    } catch (error) { next(error); }
  });
  router.put('/:id/membership', async (req, res, next) => {
    try {
      const row = await Jam.findOne({ _id: req.params.id, active: true, invitedIds: req.auth.sub }).lean();
      if (!row) return res.status(404).json({ message: 'Invitation indisponible ou déjà traitée.' });
      const friend = await Friendship.findOne({ pair: friendPair(row.hostId, req.auth.sub), status: 'accepted' }).lean();
      if (!friend) return res.status(409).json({ message: 'Vous devez encore être amis avec l’hôte pour rejoindre cette jam.' });
      await save(row, { participantIds: [...row.participantIds, req.auth.sub],
        invitedIds: row.invitedIds.filter(id => String(id) !== req.auth.sub) }, res);
    } catch (error) { next(error); }
  });
  router.delete('/:id/invitations/me', async (req, res, next) => {
    try {
      const row = await Jam.findOne({ _id: req.params.id, active: true, invitedIds: req.auth.sub }).lean();
      if (!row) return res.status(404).json({ message: 'Invitation indisponible ou déjà traitée.' });
      await save(row, { invitedIds: row.invitedIds.filter(id => String(id) !== req.auth.sub) }, res);
    } catch (error) { next(error); }
  });
  router.delete('/:id/membership', async (req, res, next) => {
    try {
      const row = await Jam.findOne({ _id: req.params.id, active: true, participantIds: req.auth.sub }).lean();
      if (!row) return res.status(404).json({ message: 'Jam indisponible.' });
      await save(row, String(row.hostId) === req.auth.sub
        ? { active: false, invitedIds: [], participantIds: [] }
        : { participantIds: row.participantIds.filter(id => String(id) !== req.auth.sub) }, res);
    } catch (error) { next(error); }
  });
  return router;
}
