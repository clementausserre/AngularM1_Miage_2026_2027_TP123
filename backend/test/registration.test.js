import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';
import { User } from '../src/models/User.js';
import { readJwtSecret } from '../src/config/jwt-secret.js';

process.env.JWT_SECRET = crypto.randomBytes(32).toString('hex');
const { createApp } = await import('../src/app.js');

test('JWT configuration requires an explicit private secret, even in tests', () => {
  for (const secret of [undefined, '', '   ', 'tp1-development-secret']) {
    for (const NODE_ENV of ['production', 'development', 'test']) {
      assert.throws(() => readJwtSecret({ JWT_SECRET: secret, NODE_ENV }), /JWT_SECRET/);
    }
  }
  assert.equal(readJwtSecret({ JWT_SECRET: process.env.JWT_SECRET }), process.env.JWT_SECRET);
});

test('registration validates types and UTF-8 byte limits before persistence or hashing', async t => {
  const exists = t.mock.method(User, 'exists', async () => false);
  const create = t.mock.method(User, 'create', async body => {
    const user = new User(body);
    await user.validate();
    return user;
  });
  const server = createApp().listen(0);
  await new Promise(resolve => server.once('listening', resolve));
  t.after(() => { server.closeAllConnections(); server.close(); });
  const base = `http://127.0.0.1:${server.address().port}/api/auth/register`;
  const register = body => fetch(base, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const valid = { name: '  Test User  ', email: 'TEST@example.com', password: 'ValidPassword1!' };
  for (const invalid of [
    {}, { ...valid, name: ' A ' }, { ...valid, name: {} }, { ...valid, email: [] },
    { ...valid, email: 'invalid' }, { ...valid, email: 'a@b@c' }, { ...valid, email: 'a..b@example.com' },
    { ...valid, email: 'a@-example.com' }, { ...valid, password: 12345678 },
    { ...valid, password: ['12345678'] }, { ...valid, password: null }, { ...valid, password: 'short' },
    { ...valid, password: 'x'.repeat(73) }, { ...valid, password: 'é'.repeat(37) },
    { ...valid, password: '😀'.repeat(19) },
  ]) {
    const response = await register(invalid);
    assert.equal(response.status, 400);
    assert.equal(typeof (await response.json()).message, 'string');
  }
  assert.equal(exists.mock.callCount(), 0);
  assert.equal(create.mock.callCount(), 0);

  for (const password of ['x'.repeat(72), 'é'.repeat(36), '😀'.repeat(18), '  valid password  ']) {
    const response = await register({ ...valid, password });
    assert.equal(response.status, 201);
    const body = await response.json();
    assert.equal(body.user.name, 'Test User');
    assert.equal(body.user.email, 'test@example.com');
    assert.equal(body.user.passwordHash, undefined);
    assert.equal(jwt.verify(body.token, process.env.JWT_SECRET).sub, body.user.id);
    const call = create.mock.calls.at(-1);
    assert.equal(call.arguments[0].password, password);
    const user = await call.result;
    assert.equal(await user.verifyPassword(password), true);
  }
  exists.mock.mockImplementation(async () => true);
  assert.equal((await register(valid)).status, 409);
  exists.mock.mockImplementation(async () => false);
  create.mock.mockImplementation(async () => { throw Object.assign(new Error('duplicate'), { code: 11000 }); });
  assert.equal((await register(valid)).status, 409);
});
