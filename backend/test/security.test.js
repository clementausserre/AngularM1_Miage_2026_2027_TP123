import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';
import mongoose from 'mongoose';
import { User } from '../src/models/User.js';
import { Track } from '../src/models/Track.js';

// Contrat HTTP et contrôles de sécurité des pistes, sans MongoDB :
// les accès Mongoose sont simulés, le serveur Express et le JWT sont réels.
process.env.JWT_SECRET = crypto.randomBytes(32).toString('hex');
const { createApp } = await import('../src/app.js');

const ownerId = new mongoose.Types.ObjectId().toString();
const token = jwt.sign({ sub: ownerId, email: 'owner@example.com', sessionVersion: 0 }, process.env.JWT_SECRET);
const bearer = { Authorization: `Bearer ${token}` };

async function startServer(t) {
  // Le middleware auth relit l'utilisateur pour comparer la version de session.
  t.mock.method(User, 'findById', () => ({ select: async () => ({ sessionVersion: 0 }) }));
  const server = createApp().listen(0);
  await new Promise(resolve => server.once('listening', resolve));
  t.after(() => { server.closeAllConnections(); server.close(); });
  return `http://127.0.0.1:${server.address().port}`;
}

test('401 sans JWT et avec un JWT invalide ou signé par un autre secret', async (t) => {
  const base = await startServer(t);
  const find = t.mock.method(Track, 'find');
  const forged = jwt.sign({ sub: ownerId, sessionVersion: 0 }, 'autre-secret');
  for (const headers of [{}, { Authorization: token }, { Authorization: 'Bearer invalide' }, { Authorization: `Bearer ${forged}` }]) {
    const response = await fetch(base + '/api/tracks', { headers });
    assert.equal(response.status, 401);
    assert.ok((await response.json()).message);
  }
  assert.equal(find.mock.callCount(), 0);
});

test('upload sans fichier : 400 et aucune métadonnée créée', async (t) => {
  const base = await startServer(t);
  const create = t.mock.method(Track, 'create');
  const body = new FormData();
  body.append('title', 'Sans fichier');
  const response = await fetch(base + '/api/tracks', { method: 'POST', headers: bearer, body });
  assert.equal(response.status, 400);
  assert.match((await response.json()).message, /^Fichier audio requis/);
  assert.equal(create.mock.callCount(), 0);
});

test('upload avec un type MIME refusé : 400 et aucune métadonnée créée', async (t) => {
  const base = await startServer(t);
  const create = t.mock.method(Track, 'create');
  const body = new FormData();
  body.append('title', 'Texte');
  body.append('audio', new Blob(['pas du son'], { type: 'text/plain' }), 'notes.txt');
  const response = await fetch(base + '/api/tracks', { method: 'POST', headers: bearer, body });
  assert.equal(response.status, 400);
  assert.match((await response.json()).message, /^Format audio non accepté/);
  assert.equal(create.mock.callCount(), 0);
});

test('pagination : page et limit transmis à MongoDB, limit plafonné à 20', async (t) => {
  const base = await startServer(t);
  const calls = [];
  const trackId = new mongoose.Types.ObjectId();
  t.mock.method(Track, 'find', (filter) => {
    const call = { filter };
    calls.push(call);
    const query = {
      sort: (value) => { call.sort = value; return query; },
      skip: (value) => { call.skip = value; return query; },
      limit: (value) => { call.limit = value; return query; },
      select: (value) => { call.select = value; return query; },
      lean: async () => [{ _id: trackId, ownerId, title: 'Blues', originalName: 'b.mp3', mimeType: 'audio/mpeg', size: 42 }],
    };
    return query;
  });
  t.mock.method(Track, 'countDocuments', async () => 7);

  const response = await fetch(base + '/api/tracks?page=2&limit=3', { headers: bearer });
  assert.equal(response.status, 200);
  const page = await response.json();
  assert.deepEqual({ page: page.page, limit: page.limit, total: page.total, pages: page.pages }, { page: 2, limit: 3, total: 7, pages: 3 });
  assert.equal(page.items[0].id, String(trackId));
  assert.equal(page.items[0]._id, undefined);
  assert.equal(page.items[0].storedName, undefined);
  assert.deepEqual(calls[0], { filter: { ownerId }, sort: { createdAt: -1 }, skip: 3, limit: 3, select: '-storedName' });

  const capped = await (await fetch(base + '/api/tracks?page=1&limit=999', { headers: bearer })).json();
  assert.equal(capped.limit, 20);
  assert.equal(calls[1].limit, 20);
  assert.equal(calls[1].skip, 0);
});

test("piste d'un autre utilisateur : 404 en lecture et en suppression, filtre sur le propriétaire", async (t) => {
  const base = await startServer(t);
  const foreignId = new mongoose.Types.ObjectId().toString();
  // MongoDB ne trouve rien car la requête impose ownerId = utilisateur du JWT.
  const findOne = t.mock.method(Track, 'findOne', () => ({ select: async () => null }));
  const findOneAndDelete = t.mock.method(Track, 'findOneAndDelete', () => ({ select: async () => null }));

  const audio = await fetch(`${base}/api/tracks/${foreignId}/audio`, { headers: bearer });
  assert.equal(audio.status, 404);
  assert.deepEqual(findOne.mock.calls[0].arguments[0], { _id: foreignId, ownerId });

  const removal = await fetch(`${base}/api/tracks/${foreignId}`, { method: 'DELETE', headers: bearer });
  assert.equal(removal.status, 404);
  assert.equal((await removal.json()).message, 'Piste inconnue');
  assert.deepEqual(findOneAndDelete.mock.calls[0].arguments[0], { _id: foreignId, ownerId });
});
