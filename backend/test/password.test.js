import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import { User } from '../src/models/User.js';

process.env.JWT_SECRET = crypto.randomBytes(32).toString('hex');
const { createApp } = await import('../src/app.js');

test('password HTTP flow with real hashing and simulated persistence', async (t) => {
  const user = new User({ name: 'Test User', email: 'test@example.com', password: 'InitialPassword1!' });
  await user.validate();
  const initialHash = user.passwordHash;
  t.mock.method(User, 'findOne', () => ({ select: async () => user }));
  t.mock.method(User, 'findById', () => ({
    select: async () => user,
    then: (resolve, reject) => Promise.resolve(user).then(resolve, reject),
  }));
  const write = t.mock.method(User, 'updateOne', async (filter, update) => {
    if (filter.passwordHash !== user.passwordHash) return { modifiedCount: 0 };
    assert.equal(update.$inc.sessionVersion, 1);
    user.passwordHash = update.$set.passwordHash;
    user.sessionVersion += 1;
    return { modifiedCount: 1 };
  });
  const server = createApp().listen(0);
  await new Promise(resolve => server.once('listening', resolve));
  t.after(() => { server.closeAllConnections(); server.close(); });
  const base = `http://127.0.0.1:${server.address().port}`;
  const login = async password => fetch(base + '/api/auth/login', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: user.email, password }),
  });
  const token = (await (await login('InitialPassword1!')).json()).token;
  const change = async (body, credential = token) => fetch(base + '/api/users/me/password', {
    method: 'PUT', headers: { 'Content-Type': 'application/json', ...(credential ? { Authorization: `Bearer ${credential}` } : {}) },
    body: JSON.stringify(body),
  });
  const body = { currentPassword: 'InitialPassword1!', newPassword: 'ReplacementPassword2!' };
  assert.equal((await change(body, '')).status, 401);
  for (const invalid of [null, {}, { ...body, currentPassword: {} }, { ...body, newPassword: 'short' }, { ...body, newPassword: 'é'.repeat(37) }]) {
    assert.equal((await change(invalid)).status, 400);
  }
  assert.equal((await change({ ...body, currentPassword: 'wrong' })).status, 403);
  assert.equal((await change({ ...body, newPassword: body.currentPassword })).status, 400);
  assert.equal(write.mock.callCount(), 0);
  assert.equal((await change(body)).status, 204);
  assert.notEqual(user.passwordHash, initialHash);
  assert.equal(await bcrypt.compare(body.newPassword, user.passwordHash), true);
  assert.equal(await bcrypt.compare(body.currentPassword, user.passwordHash), false);
  assert.equal(user.sessionVersion, 1);
  assert.equal((await fetch(base + '/api/users/me', { headers: { Authorization: `Bearer ${token}` } })).status, 401);
  assert.equal((await login(body.currentPassword)).status, 401);
  const result = await login(body.newPassword);
  assert.equal(result.status, 200);
  const session = await result.json();
  assert.equal(session.user.passwordHash, undefined);
  assert.equal(session.user.sessionVersion, undefined);
  assert.equal((await fetch(base + '/api/users/me', { headers: { Authorization: `Bearer ${session.token}` } })).status, 200);
  write.mock.mockImplementation(async () => ({ modifiedCount: 0 }));
  assert.equal((await change({ currentPassword: body.newPassword, newPassword: 'AnotherPassword3!' }, session.token)).status, 409);
});
