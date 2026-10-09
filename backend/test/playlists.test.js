import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';
import { User } from '../src/models/User.js';
import { Track } from '../src/models/Track.js';
import { Playlist } from '../src/models/Playlist.js';
import { installPlaylistsStore } from '../test-support/playlists-store.js';

process.env.JWT_SECRET = crypto.randomBytes(32).toString('hex');
const { createApp } = await import('../src/app.js');

test('playlist schema bounds and duplicate validation', async () => {
  const owner = 'a'.repeat(24), id = 'b'.repeat(24);
  await assert.rejects(new Playlist({ ownerId: owner, name: ' ', trackIds: [] }).validate());
  await assert.rejects(new Playlist({ ownerId: owner, name: 'x', trackIds: [id, id] }).validate());
  await assert.rejects(new Playlist({ ownerId: owner, name: 'x', trackIds: Array(201).fill(id) }).validate());
  assert.ok(Playlist.schema.indexes().some(([index]) => index.ownerId === 1));
});

test('private playlists HTTP lifecycle, order, concurrent edits and missing tracks (simulated persistence)', async t => {
  const owner = 'a'.repeat(24), other = 'b'.repeat(24);
  const tracks = new Map(['1', '2', '3'].map(n => {
    const row = new Track({ _id: n.repeat(24), ownerId: n === '3' ? other : owner,
      title: `Track ${n}`, originalName: `${n}.mp3`, storedName: 'private.mp3', mimeType: 'audio/mpeg', size: 5 });
    return [row.id, row.toObject()];
  }));
  const match = (row, filter) => String(row.ownerId) === String(filter.ownerId) &&
    (!filter._id || (filter._id.$in ? filter._id.$in.map(String).includes(String(row._id)) : String(row._id) === String(filter._id)));
  t.mock.method(User, 'findById', () => ({ select: async () => ({ sessionVersion: 0 }) }));
  t.mock.method(Track, 'find', filter => ({ select: () => ({ lean: async () => [...tracks.values()].filter(row => match(row, filter)) }) }));
  t.mock.method(Track, 'findOne', filter => ({ lean: async () => [...tracks.values()].find(row => match(row, filter)) ?? null }));
  t.mock.method(Track, 'countDocuments', async filter => [...tracks.values()].filter(row => match(row, filter)).length);
  const stored = installPlaylistsStore(Playlist);
  const server = createApp().listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  t.after(() => { server.closeAllConnections(); server.close(); });
  const base = `http://127.0.0.1:${server.address().port}/api/playlists`;
  const request = (route = '', method = 'GET', body, who = owner) => fetch(base + route, {
    method, headers: { 'Content-Type': 'application/json', ...(who ? { Authorization: `Bearer ${jwt.sign({ sub: who }, process.env.JWT_SECRET)}` } : {}) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  assert.equal((await request('', 'GET', undefined, null)).status, 401);
  for (const name of ['', ' ', {}, 'x'.repeat(101)]) assert.equal((await request('', 'POST', { name })).status, 400);
  const response = await request('', 'POST', { name: '  My list  ', ownerId: other });
  assert.equal(response.status, 201);
  const playlist = await response.json(), route = `/${playlist.id}`;
  assert.equal(playlist.name, 'My list'); assert.equal(playlist.trackCount, 0);
  assert.equal(String(stored.get(playlist.id).ownerId), owner);
  assert.equal((await request(route, 'GET', undefined, other)).status, 404);
  assert.equal((await request(route, 'PUT', { name: 'stolen', version: 0 }, other)).status, 404);
  assert.equal((await request(route, 'DELETE', undefined, other)).status, 404);
  assert.equal((await request(route + '/tracks', 'POST', { trackId: '1'.repeat(24) }, other)).status, 404);
  assert.equal((await (await request('', 'GET', undefined, other)).json()).total, 0);
  assert.equal((await request(route + '/tracks', 'POST', { trackId: '3'.repeat(24) })).status, 404);
  assert.equal((await request(route + '/tracks', 'POST', { trackId: { $ne: null } })).status, 400);
  const first = await (await request(route + '/tracks', 'POST', { trackId: '1'.repeat(24) })).json();
  const duplicate = await (await request(route + '/tracks', 'POST', { trackId: '1'.repeat(24) })).json();
  assert.equal(duplicate.trackCount, 1); assert.equal(duplicate.version, first.version);
  assert.equal(duplicate.tracks[0].storedName, undefined);
  const both = await (await request(route + '/tracks', 'POST', { trackId: '2'.repeat(24) })).json();
  const reordered = await (await request(route, 'PUT', { version: both.version, trackIds: ['2'.repeat(24), '1'.repeat(24)] })).json();
  assert.deepEqual(reordered.tracks.map(track => track.id), ['2'.repeat(24), '1'.repeat(24)]);
  assert.equal((await request(route, 'PUT', { version: both.version, name: 'stale' })).status, 409);
  assert.equal((await request(route, 'PUT', { version: reordered.version, trackIds: ['3'.repeat(24)] })).status, 404);
  assert.equal((await request(route, 'PUT', { version: reordered.version, trackIds: ['1'.repeat(24), '1'.repeat(24)] })).status, 400);
  const competing = await Promise.all(['A', 'B'].map(name => request(route, 'PUT', { version: reordered.version, name })));
  assert.deepEqual(competing.map(result => result.status).sort(), [200, 409]);
  // Removing a track from the library must not leak stale metadata or break playlist reads.
  tracks.delete('2'.repeat(24));
  const fresh = await (await request(route)).json();
  assert.equal(fresh.trackCount, 1); assert.equal(fresh.tracks[0].id, '1'.repeat(24));
  const summary = await (await request()).json();
  assert.equal(summary.items[0].trackCount, 1); assert.equal(summary.items[0].tracks, undefined);
  assert.equal((await request(route, 'PUT', { version: fresh.version, trackIds: [] })).status, 200);
  assert.ok(tracks.has('1'.repeat(24)));
  assert.equal((await request(route, 'DELETE')).status, 204);
  assert.equal((await request(route)).status, 404); assert.ok(tracks.has('1'.repeat(24)));
  assert.equal((await request('/bad-id')).status, 404);
  assert.equal((await request('?page=1.5')).status, 400);
  for (let i = 0; i < 13; i++) await Playlist.create({ ownerId: owner, name: `List ${i}` });
  const secondPage = await (await request('?page=2')).json();
  assert.equal(secondPage.items.length, 1); assert.equal(secondPage.total, 13); assert.equal(secondPage.pages, 2);
});
