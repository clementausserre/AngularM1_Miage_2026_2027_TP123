import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';
import { User } from '../src/models/User.js';
import { FriendCode, ensureFriendCode, generateFriendCode } from '../src/models/FriendCode.js';
import { Friendship, friendPair } from '../src/models/Friendship.js';
import { installFriendsStore } from '../test-support/friends-store.js';

process.env.JWT_SECRET = crypto.randomBytes(32).toString('hex');
const { createApp } = await import('../src/app.js');

test('friend codes and unordered pairs have unique indexes', () => {
  assert.ok(FriendCode.schema.indexes().some(([keys, options]) => keys.code === 1 && options.unique));
  assert.ok(FriendCode.schema.indexes().some(([keys, options]) => keys.userId === 1 && options.unique));
  assert.ok(Friendship.schema.indexes().some(([keys, options]) => keys.pair === 1 && options.unique));
  assert.equal(friendPair('a', 'b'), friendPair('b', 'a'));
  for (let i = 0; i < 50; i++) assert.match(generateFriendCode(), /^GPC-[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}$/);
});

test('friends HTTP lifecycle, privacy, validation and concurrent requests (simulated persistence)', async t => {
  const users = new Map(['a', 'b', 'c'].map(letter => {
    const id = letter.repeat(24);
    return [id, { _id: id, name: 'Same name', email: `${letter}@private.test`, sessionVersion: 0 }];
  }));
  const { query, codes } = installFriendsStore({ FriendCode, Friendship, users });
  t.mock.method(User, 'findById', id => query(() => users.get(String(id)) ?? null));
  const server = createApp().listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  t.after(() => { server.closeAllConnections(); server.close(); });
  const base = `http://127.0.0.1:${server.address().port}/api/friends`;
  const request = (who, route = '', method = 'GET', body) => fetch(base + route, {
    method, headers: { 'Content-Type': 'application/json', ...(who ? { Authorization: `Bearer ${jwt.sign({ sub: who.repeat(24) }, process.env.JWT_SECRET)}` } : {}) },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
  assert.equal((await request(null, '/code')).status, 401);
  const [codeA, codeB] = await Promise.all(['a', 'b'].map(async who => (await (await request(who, '/code')).json()).code));
  assert.notEqual(codeA, codeB);
  assert.equal((await (await request('a', '/code')).json()).code, codeA);
  assert.equal(codes.size, 2);
  assert.equal((await request('a', '/lookup', 'POST', { code: codeA })).status, 400);
  for (const code of [null, {}, { $ne: null }, 'bad', 'x'.repeat(100)]) {
    assert.equal((await request('a', '/lookup', 'POST', { code })).status, 400);
  }
  assert.equal((await request('a', '/lookup', 'POST', { code: 'GPC-2222-2222' })).status, 404);
  const found = await (await request('a', '/lookup', 'POST', { code: codeB.toLowerCase().replaceAll('-', ' ') })).json();
  assert.deepEqual(found, { user: { id: 'b'.repeat(24), name: 'Same name' }, relation: null });
  const results = await Promise.all([request('a', '/requests', 'POST', { code: codeB }), request('b', '/requests', 'POST', { code: codeA })]);
  assert.deepEqual(results.map(response => response.status).sort(), [201, 409]);
  const sender = results[0].status === 201 ? 'a' : 'b', receiver = sender === 'a' ? 'b' : 'a';
  const created = await results.find(response => response.status === 201).json();
  assert.equal((await (await request(receiver, '/summary')).json()).incoming, 1);
  const incoming = await (await request(receiver, '?kind=incoming')).json();
  assert.equal(incoming.items.length, 1);
  assert.deepEqual(Object.keys(incoming.items[0].user).sort(), ['id', 'name']);
  assert.equal((await (await request('c', '?kind=incoming')).json()).total, 0);
  assert.equal((await request(sender, `/${created.id}/accept`, 'PUT')).status, 404);
  assert.equal((await request('c', `/${created.id}/accept`, 'PUT')).status, 404);
  assert.equal((await request('c', `/${created.id}`, 'DELETE')).status, 404);
  assert.equal((await request(receiver, `/${created.id}/accept`, 'PUT')).status, 204);
  assert.equal((await request(receiver, `/${created.id}/accept`, 'PUT')).status, 404);
  for (const who of ['a', 'b']) assert.equal((await (await request(who)).json()).total, 1);
  assert.equal((await (await request(receiver, '/summary')).json()).incoming, 0);
  assert.equal((await request(sender, `/${created.id}`, 'DELETE')).status, 204);
  for (const who of ['a', 'b']) assert.equal((await (await request(who)).json()).total, 0);
  for (const route of ['?kind=wrong', '?page=-1', '?page=1.5', '?page[$gt]=1']) {
    const response = await request('a', route);
    assert.ok([200, 400].includes(response.status)); // Unknown query keys are ignored, never forwarded to MongoDB.
  }
  assert.equal((await request('a', '/invalid/accept', 'PUT')).status, 404);
  // Requests can be cancelled by their sender or refused by their recipient.
  for (const who of ['a', 'b']) {
    const relation = await (await request('a', '/requests', 'POST', { code: codeB })).json();
    assert.equal((await request(who, `/${relation.id}`, 'DELETE')).status, 204);
  }
  // Account A remains distinct despite identical display names.
  assert.equal((await (await request('a', '/code')).json()).code, codeA);
  // A unique-code collision is retried, while simultaneous tabs reuse the winner.
  const original = FriendCode.findOneAndUpdate;
  let attempts = 0;
  t.mock.method(FriendCode, 'findOneAndUpdate', (...args) => {
    if (++attempts === 1) return { lean: async () => { throw Object.assign(new Error('collision'), { code: 11000 }); } };
    return original(...args);
  });
  const allocated = await ensureFriendCode('c'.repeat(24));
  assert.equal(attempts, 2); assert.notEqual(allocated, codeA);
});
