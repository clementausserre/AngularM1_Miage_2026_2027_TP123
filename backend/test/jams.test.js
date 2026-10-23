import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';
import { User } from '../src/models/User.js';
import { Jam } from '../src/models/Jam.js';
import { Friendship, friendPair } from '../src/models/Friendship.js';
import { installJamsStore } from '../test-support/jams-store.js';

process.env.JWT_SECRET = crypto.randomBytes(32).toString('hex');
const { createApp } = await import('../src/app.js');
const host = 'a'.repeat(24), guest = 'b'.repeat(24), outsider = 'c'.repeat(24);

async function setup(t) {
  const users = new Map([host, guest, outsider].map((id, i) => [id, { _id: id, name: `Person ${i}` }]));
  const friendships = new Set([friendPair(host, guest)]);
  t.mock.method(User, 'findById', () => ({ select: async () => ({ sessionVersion: 0 }) }));
  t.mock.method(User, 'find', filter => ({ select: () => ({ lean: async () =>
    [...users.values()].filter(user => filter._id.$in.map(String).includes(user._id)) }) }));
  t.mock.method(User, 'exists', async filter => users.has(String(filter._id)));
  t.mock.method(Friendship, 'findOne', filter => ({ lean: async () =>
    filter.status === 'accepted' && friendships.has(filter.pair) ? { status: 'accepted' } : null }));
  const stored = installJamsStore(t, Jam);
  const server = createApp().listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  t.after(() => { server.closeAllConnections(); server.close(); });
  const base = `http://127.0.0.1:${server.address().port}/api/jams`;
  const request = (route = '', method = 'GET', body, who = host) => fetch(base + route, {
    method, headers: { 'Content-Type': 'application/json', ...(who ? { Authorization: `Bearer ${jwt.sign({ sub: who }, process.env.JWT_SECRET)}` } : {}) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const create = async () => {
    const response = await request('', 'POST', { name: ' Friday ', hostId: outsider, participantIds: [outsider] });
    assert.equal(response.status, 201);
    return `/${(await response.json()).id}`;
  };
  return { request, create, stored, friendships, users };
}

test('jam schema requires a host in the participants, bounded disjoint lists and one active jam per host', async () => {
  await assert.rejects(new Jam({ name: 'x', hostId: host }).validate());
  await assert.rejects(new Jam({ name: ' ', hostId: host, participantIds: [host] }).validate());
  await assert.rejects(new Jam({ name: 'x', hostId: host, participantIds: [host], invitedIds: [host] }).validate());
  await assert.rejects(new Jam({ name: 'x', hostId: host, participantIds: [host, host] }).validate());
  await assert.rejects(new Jam({ name: 'x', hostId: host, participantIds: [host], version: 0.5 }).validate());
  assert.ok(Jam.schema.indexes().some(([keys, options]) => keys.hostId === 1 && options.unique && options.partialFilterExpression.active));
});

test('private jam lifecycle: invitation, acceptance, departure and closure (simulated persistence)', async t => {
  const { request, create, stored } = await setup(t);
  const route = await create();
  assert.deepEqual(stored.get(route.slice(1)).participantIds, [host]);
  assert.equal(stored.get(route.slice(1)).hostId, host);
  const detailResponse = await request(route);
  assert.equal(detailResponse.headers.get('cache-control'), 'private, no-store');
  const detail = await detailResponse.json();
  assert.equal(detail.role, 'host'); assert.equal(detail.name, 'Friday');
  assert.deepEqual(detail.participants, [{ id: host, name: 'Person 0' }]);
  assert.equal((await request(route, 'GET', undefined, outsider)).status, 404);
  assert.equal((await request(route + '/membership', 'PUT', {}, outsider)).status, 404);
  assert.equal((await request(route + '/invitations', 'POST', { userId: guest }, outsider)).status, 404);
  assert.equal((await request(route + '/invitations', 'POST', { userId: outsider })).status, 404);
  assert.equal((await request(route + '/invitations', 'POST', { userId: guest.toUpperCase() })).status, 204);
  assert.equal((await request(route + '/invitations', 'POST', { userId: guest })).status, 409);
  assert.equal((await request(route, 'GET', undefined, guest)).status, 404); // An invitation is not membership.
  const invitation = await (await request('?kind=invitations', 'GET', undefined, guest)).json();
  assert.equal(invitation.total, 1); assert.equal(invitation.items[0].role, 'invited');
  assert.equal(invitation.items[0].participants, undefined);
  assert.equal((await request(route + '/membership', 'PUT', {}, guest)).status, 204);
  assert.equal((await request(route + '/membership', 'PUT', {}, guest)).status, 404);
  const joined = await (await request(route, 'GET', undefined, guest)).json();
  assert.equal(joined.role, 'participant'); assert.equal(joined.participants.length, 2);
  assert.deepEqual(joined.invitations, []);
  assert.equal((await (await request('?kind=invitations', 'GET', undefined, guest)).json()).total, 0);
  assert.equal((await request(route + '/invitations', 'POST', { userId: outsider }, guest)).status, 404);
  assert.equal((await request(route + '/membership', 'DELETE', undefined, outsider)).status, 404);
  assert.equal((await request(route + '/membership', 'DELETE', undefined, guest)).status, 204);
  assert.equal((await request(route, 'GET', undefined, guest)).status, 404);
  assert.equal((await request(route)).status, 200);
  assert.equal((await request(route + '/invitations', 'POST', { userId: guest })).status, 204);
  assert.equal((await request(route + '/membership', 'DELETE')).status, 204);
  assert.equal((await request(route)).status, 404);
  assert.equal((await request(route + '/membership', 'PUT', {}, guest)).status, 404);
  assert.equal((await (await request('?kind=invitations', 'GET', undefined, guest)).json()).total, 0);
  assert.equal((await (await request()).json()).total, 0);
  await create(); // Closing releases the unique active-host slot.
});

test('jam input validation, authentication, duplicate creation, refusal and removed friendship', async t => {
  const { request, create, friendships } = await setup(t);
  for (const method of ['GET', 'POST']) assert.equal((await request('', method, method === 'POST' ? {} : undefined, null)).status, 401);
  for (const name of ['', ' ', {}, 'x'.repeat(101)]) assert.equal((await request('', 'POST', { name })).status, 400);
  for (const query of ['?kind=all', '?page=0', '?page=1.5', '?page=100001', '?kind[$ne]=x']) {
    // Unknown query fields are ignored, including bracket-shaped names under Express's simple parser.
    assert.equal((await request(query)).status, query.includes('[') ? 200 : 400);
  }
  assert.equal((await request('/invalid')).status, 404);
  const route = await create();
  assert.equal((await request('', 'POST', { name: 'Another' })).status, 409);
  for (const userId of [host, {}, 'invalid']) assert.equal((await request(route + '/invitations', 'POST', { userId })).status, 400);
  await request(route + '/invitations', 'POST', { userId: guest });
  assert.equal((await request(route + '/invitations/me', 'DELETE', undefined, outsider)).status, 404);
  assert.equal((await request(route + '/invitations/me', 'DELETE', undefined, guest)).status, 204);
  assert.equal((await request(route + '/membership', 'PUT', {}, guest)).status, 404);
  await request(route + '/invitations', 'POST', { userId: guest });
  friendships.clear();
  assert.equal((await request(route + '/membership', 'PUT', {}, guest)).status, 409);
  assert.equal((await request(route + '/invitations/me', 'DELETE', undefined, guest)).status, 204);
});

test('competing requests never duplicate membership or reopen a closed jam', async t => {
  const { request, create, stored } = await setup(t);
  const route = await create();
  const invites = await Promise.all([1, 2].map(() => request(route + '/invitations', 'POST', { userId: guest })));
  assert.deepEqual(invites.map(response => response.status).sort(), [204, 409]);
  const accepts = await Promise.all([1, 2].map(() => request(route + '/membership', 'PUT', {}, guest)));
  assert.equal(accepts.filter(response => response.status === 204).length, 1);
  assert.ok(accepts.every(response => [204, 404, 409].includes(response.status)));
  assert.deepEqual(stored.get(route.slice(1)).participantIds, [host, guest]);
  await request(route + '/membership', 'DELETE', undefined, guest);
  await request(route + '/invitations', 'POST', { userId: guest });
  const race = await Promise.all([request(route + '/membership', 'PUT', {}, guest), request(route + '/membership', 'DELETE')]);
  if (race[1].status === 409) assert.equal((await request(route + '/membership', 'DELETE')).status, 204);
  assert.equal(stored.get(route.slice(1)).active, false);
  assert.equal((await request(route + '/membership', 'PUT', {}, guest)).status, 404);
});

test('jam lists paginate and invitations reserve the twenty available places', async t => {
  const { request, create, stored, friendships, users } = await setup(t);
  const route = await create();
  for (let i = 1; i <= 20; i++) {
    const id = i.toString(16).padStart(24, '0');
    users.set(id, { _id: id, name: 'Friend' }); friendships.add(friendPair(host, id));
    assert.equal((await request(route + '/invitations', 'POST', { userId: id })).status, i < 20 ? 204 : 409);
  }
  assert.equal(stored.get(route.slice(1)).invitedIds.length, 19);
  for (let i = 1; i <= 13; i++) await Jam.create({ name: 'Other jam', hostId: i.toString(16).padStart(24, '0'), participantIds: [i.toString(16).padStart(24, '0'), guest] });
  const result = await (await request('?page=2', 'GET', undefined, guest)).json();
  assert.equal(result.total, 13); assert.equal(result.pages, 2); assert.equal(result.items.length, 1);
});
