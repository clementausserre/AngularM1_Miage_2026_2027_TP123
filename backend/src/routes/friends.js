import { Router } from 'express';
import { isObjectIdOrHexString } from 'mongoose';
import { User } from '../models/User.js';
import { FriendCode, ensureFriendCode } from '../models/FriendCode.js';
import { Friendship, friendPair } from '../models/Friendship.js';

function validateCode(req, res, next) {
  const raw = req.body?.code;
  if (typeof raw !== 'string' || raw.length > 32) return res.status(400).json({ message: 'Code ami invalide.' });
  const code = raw.trim().toUpperCase().replace(/[\s-]/g, '');
  if (!/^GPC[A-HJ-NP-Z2-9]{8}$/.test(code)) return res.status(400).json({ message: 'Format attendu : GPC-XXXX-XXXX.' });
  req.friendCode = `GPC-${code.slice(3, 7)}-${code.slice(7)}`;
  next();
}

async function findTarget(req, res) {
  const entry = await FriendCode.findOne({ code: req.friendCode }).lean();
  const user = entry ? await User.findById(entry.userId).select('name').lean() : null;
  if (!user) { res.status(404).json({ message: 'Aucun utilisateur ne correspond à ce code.' }); return null; }
  if (String(user._id) === req.auth.sub) { res.status(400).json({ message: 'C’est votre propre code ami.' }); return null; }
  return user;
}

export function friendsRouter(auth) {
  const router = Router();
  router.use(auth);
  router.use((_req, res, next) => { res.set('Cache-Control', 'private, no-store'); next(); });

  router.get('/code', async (req, res, next) => {
    try { res.json({ code: await ensureFriendCode(req.auth.sub) }); }
    catch (error) { next(error); }
  });
  router.get('/summary', async (req, res, next) => {
    try { res.json({ incoming: await Friendship.countDocuments({ recipient: req.auth.sub, status: 'pending' }) }); }
    catch (error) { next(error); }
  });
  router.get('/', async (req, res, next) => {
    const kind = req.query.kind ?? 'accepted';
    const page = Number(req.query.page ?? 1);
    if (!['accepted', 'incoming', 'outgoing'].includes(kind) || !Number.isSafeInteger(page) || page < 1 || page > 100000) {
      return res.status(400).json({ message: 'Pagination ou catégorie invalide.' });
    }
    const me = req.auth.sub;
    const filter = kind === 'accepted' ? { status: 'accepted', $or: [{ requester: me }, { recipient: me }] }
      : { status: 'pending', [kind === 'incoming' ? 'recipient' : 'requester']: me };
    try {
      const [rows, total] = await Promise.all([
        Friendship.find(filter).sort({ createdAt: -1, _id: -1 }).skip((page - 1) * 12).limit(12)
          .populate('requester recipient', 'name').lean(),
        Friendship.countDocuments(filter),
      ]);
      const items = rows.map(row => {
        const other = String(row.requester?._id) === me ? row.recipient : row.requester;
        return { id: String(row._id), status: row.status, createdAt: row.createdAt,
          user: { id: other ? String(other._id) : '', name: other?.name ?? 'Compte supprimé' } };
      });
      res.json({ items, page, limit: 12, total, pages: Math.max(1, Math.ceil(total / 12)) });
    } catch (error) { next(error); }
  });
  router.post('/lookup', validateCode, async (req, res, next) => {
    try {
      const target = await findTarget(req, res);
      if (!target) return;
      const relation = await Friendship.findOne({ pair: friendPair(req.auth.sub, target._id) }).lean();
      res.json({ user: { id: String(target._id), name: target.name }, relation: relation ? {
        id: String(relation._id), status: relation.status,
        direction: String(relation.requester) === req.auth.sub ? 'outgoing' : 'incoming',
      } : null });
    } catch (error) { next(error); }
  });
  router.post('/requests', validateCode, async (req, res, next) => {
    try {
      const target = await findTarget(req, res);
      if (!target) return;
      const relation = await Friendship.create({ pair: friendPair(req.auth.sub, target._id), requester: req.auth.sub, recipient: target._id });
      res.status(201).json({ id: relation.id, status: relation.status });
    } catch (error) {
      if (error.code === 11000) return res.status(409).json({ message: 'Une relation existe déjà. Actualisez vos demandes reçues et envoyées.' });
      next(error);
    }
  });
  router.param('id', (req, res, next, id) => {
    if (!isObjectIdOrHexString(id)) return res.status(404).json({ message: 'Relation introuvable.' });
    next();
  });
  router.put('/:id/accept', async (req, res, next) => {
    try {
      const result = await Friendship.findOneAndUpdate({ _id: req.params.id, recipient: req.auth.sub, status: 'pending' },
        { $set: { status: 'accepted' } }, { new: true, runValidators: true });
      if (!result) return res.status(404).json({ message: 'Demande indisponible. Actualisez la liste.' });
      res.sendStatus(204);
    } catch (error) { next(error); }
  });
  router.delete('/:id', async (req, res, next) => {
    try {
      const result = await Friendship.findOneAndDelete({ _id: req.params.id, $or: [{ requester: req.auth.sub }, { recipient: req.auth.sub }] });
      if (!result) return res.status(404).json({ message: 'Relation introuvable. Actualisez la liste.' });
      res.sendStatus(204);
    } catch (error) { next(error); }
  });
  return router;
}
