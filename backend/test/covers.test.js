import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import sharp from 'sharp';
import jwt from 'jsonwebtoken';
import mongoose from 'mongoose';

// All HTTP uploads use an isolated temporary disk; no Atlas or real uploads.
const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'gpc-covers-'));
const previousDirectory = process.cwd();
process.chdir(directory);
process.env.JWT_SECRET = crypto.randomBytes(32).toString('hex');
const { createApp } = await import('../src/app.js');
const { Track } = await import('../src/models/Track.js');
const { User } = await import('../src/models/User.js');
const { UPLOADS, COVERS } = await import('../src/middleware/track-upload.js');

test('authenticated cover lifecycle with real multipart, images and disk, simulated MongoDB', async t => {
  const ownerId = new mongoose.Types.ObjectId();
  const tracks = new Map();
  let failCreate = false, failUpdate = false, conflict = false;
  const snapshot = track => track ? new Track(track.toObject()) : null;
  const matches = (track, filter) => track && String(track.ownerId) === String(filter.ownerId)
    && (filter['cover.version'] === undefined || track.cover?.version === filter['cover.version'])
    && (!Object.hasOwn(filter, 'cover') || (track.cover ?? null) === filter.cover);
  t.mock.method(User, 'findById', () => ({ select: async () => ({ sessionVersion: 0 }) }));
  t.mock.method(Track, 'create', async fields => {
    if (failCreate) throw new Error('Simulated Mongo failure');
    const track = new Track(fields);
    await track.validate();
    tracks.set(track.id, track);
    return track;
  });
  t.mock.method(Track, 'findOne', filter => ({ select: async () => {
    if (!mongoose.isValidObjectId(filter._id)) throw new mongoose.Error.CastError('ObjectId', filter._id, '_id');
    const track = tracks.get(String(filter._id));
    return matches(track, filter) ? snapshot(track) : null;
  } }));
  t.mock.method(Track, 'findOneAndUpdate', async (filter, update) => {
    if (failUpdate) throw new Error('Simulated Mongo failure');
    const track = tracks.get(String(filter._id));
    if (conflict || !matches(track, filter)) return null;
    track.cover = update.$set.cover;
    return snapshot(track);
  });
  t.mock.method(Track, 'findOneAndDelete', filter => ({ select: async () => {
    const track = tracks.get(String(filter._id));
    if (!matches(track, filter)) return null;
    tracks.delete(track.id);
    return snapshot(track);
  } }));
  t.mock.method(Track, 'find', () => {
    const query = { sort: () => query, skip: () => query, limit: () => query, select: () => query,
      lean: async () => [...tracks.values()].map(track => track.toObject()) };
    return query;
  });
  t.mock.method(Track, 'countDocuments', async () => tracks.size);

  const server = createApp().listen(0);
  await new Promise(resolve => server.once('listening', resolve));
  t.after(async () => {
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
    process.chdir(previousDirectory);
    // The recursive cleanup is limited to the verified directory created above.
    assert.equal(path.dirname(path.resolve(directory)), path.resolve(os.tmpdir()));
    assert.ok(path.basename(directory).startsWith('gpc-covers-'));
    await fs.rm(directory, { recursive: true, force: true });
  });
  const base = `http://127.0.0.1:${server.address().port}/api/tracks`;
  const token = jwt.sign({ sub: String(ownerId), sessionVersion: 0 }, process.env.JWT_SECRET);
  const other = jwt.sign({ sub: String(new mongoose.Types.ObjectId()), sessionVersion: 0 }, process.env.JWT_SECRET);
  const request = (suffix = '', method = 'GET', body, credential = token) => fetch(base + suffix, {
    method, body, headers: credential ? { Authorization: `Bearer ${credential}` } : {},
  });
  const image = await sharp({ create: { width: 1600, height: 1200, channels: 3, background: '#123456' } }).png().toBuffer();
  const form = (cover = image, audio = true) => {
    const body = new FormData();
    if (audio) {
      body.append('audio', new Blob(['test audio'], { type: 'audio/mpeg' }), 'test.mp3');
      body.append('title', 'My track');
    }
    if (cover) body.append('cover', new Blob([cover], { type: 'image/png' }), 'cover.png');
    return body;
  };
  const files = async () => ({
    audio: (await fs.readdir(UPLOADS)).filter(name => !['covers', '.incoming'].includes(name)).sort(),
    covers: (await fs.readdir(COVERS)).sort(),
    incoming: (await fs.readdir(path.join(UPLOADS, '.incoming'))).sort(),
  });
  const expectFiles = async expected => {
    for (let attempt = 0; attempt < 100; attempt++) {
      if (JSON.stringify(await files()) === JSON.stringify(expected)) return;
      await new Promise(resolve => setTimeout(resolve, 10));
    }
    assert.deepEqual(await files(), expected);
  };
  let id;

  await t.test('old clients can import without a cover', async () => {
    const response = await request('', 'POST', form(null));
    assert.equal(response.status, 201);
    const track = await response.json();
    assert.equal(track.cover, null);
    assert.equal((await request(`/${track.id}/cover`)).status, 404);
    assert.equal((await request(`/${track.id}`, 'DELETE')).status, 204);
    await expectFiles({ audio: [], covers: [], incoming: [] });
  });
  await t.test('create, resize and privately serve the image, with safe public metadata', async () => {
    const response = await request('', 'POST', form());
    assert.equal(response.status, 201, await response.clone().text());
    const track = await response.json();
    id = track.id;
    assert.equal(track.cover.width, 800);
    assert.equal(track.cover.height, 600);
    assert.equal(track.cover.mimeType, 'image/webp');
    assert.equal(track.cover.storedName, undefined);
    assert.equal(track.storedName, undefined);
    const listed = await (await request()).json();
    assert.equal(listed.items[0].cover.storedName, undefined);
    const responseImage = await request(`/${id}/cover`);
    assert.equal(responseImage.status, 200);
    assert.match(responseImage.headers.get('content-type'), /image\/webp/);
    assert.equal(responseImage.headers.get('cache-control'), 'private, no-store');
    const metadata = await sharp(Buffer.from(await responseImage.arrayBuffer())).metadata();
    assert.equal(metadata.width, 800);
    assert.equal(metadata.exif, undefined);
  });
  await t.test('no token and other owners cannot read or change a cover', async () => {
    assert.equal((await request(`/${id}/cover`, 'GET', undefined, '')).status, 401);
    for (const method of ['GET', 'PUT', 'DELETE']) {
      assert.equal((await request(`/${id}/cover`, method, method === 'PUT' ? form(image, false) : undefined, other)).status, 404);
    }
    assert.equal((await request('/bad-id/cover')).status, 404);
  });
  await t.test('invalid, excessive and unexpected uploads leave no orphan files', async () => {
    const before = await files();
    for (const invalid of [Buffer.from('not an image'), Buffer.alloc(0), Buffer.alloc(5 * 1024 * 1024 + 1)]) {
      const response = await request('', 'POST', form(invalid));
      assert.ok([400, 413].includes(response.status));
      await expectFiles(before);
    }
    const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"></svg>');
    assert.equal((await request('', 'POST', form(svg))).status, 400);
    const largePixels = await sharp({ create: { width: 4001, height: 4000, channels: 3, background: 'red' } }).png().toBuffer();
    assert.equal((await request('', 'POST', form(largePixels))).status, 400);
    const unexpected = form(); unexpected.append('extra', new Blob(['no']), 'extra.bin');
    assert.equal((await request('', 'POST', unexpected)).status, 400);
    assert.equal((await request('', 'POST', form(image, false))).status, 400);
    await expectFiles(before);
  });
  await t.test('database creation failure removes both permanent files', async () => {
    const before = await files();
    failCreate = true;
    assert.equal((await request('', 'POST', form())).status, 500);
    failCreate = false;
    await expectFiles(before);
  });
  await t.test('failed and concurrent replacements preserve the old cover', async () => {
    const before = await files();
    const version = tracks.get(id).cover.version;
    failUpdate = true;
    assert.equal((await request(`/${id}/cover`, 'PUT', form(image, false))).status, 500);
    failUpdate = false;
    conflict = true;
    assert.equal((await request(`/${id}/cover`, 'PUT', form(image, false))).status, 409);
    conflict = false;
    assert.equal(tracks.get(id).cover.version, version);
    await expectFiles(before);
  });
  await t.test('replace and remove cover, then remove a track and both files', async () => {
    const before = tracks.get(id).cover.version;
    const replaced = await request(`/${id}/cover`, 'PUT', form(image, false));
    assert.equal(replaced.status, 200);
    assert.notEqual((await replaced.json()).cover.version, before);
    await expectFiles({ audio: (await files()).audio, covers: [tracks.get(id).cover.storedName], incoming: [] });
    assert.equal((await request(`/${id}/cover`, 'DELETE')).status, 204);
    await expectFiles({ audio: (await files()).audio, covers: [], incoming: [] });
    assert.equal((await request(`/${id}/cover`)).status, 404);
    assert.equal((await request(`/${id}/audio`)).status, 200);
    assert.equal((await request(`/${id}/cover`, 'PUT', form(image, false))).status, 200);
    assert.equal((await request(`/${id}`, 'DELETE')).status, 204);
    await expectFiles({ audio: [], covers: [], incoming: [] });
  });
});
