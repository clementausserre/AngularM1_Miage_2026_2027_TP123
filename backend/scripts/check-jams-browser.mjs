// Real Angular + Express in Chrome, two isolated accounts, simulated MongoDB only.
// Run from the repository after building Angular: node backend/scripts/check-jams-browser.mjs
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { mock } from 'node:test';
import crypto from 'node:crypto';
import express from 'express';
import jwt from 'jsonwebtoken';
import { User } from '../src/models/User.js';
import { Jam } from '../src/models/Jam.js';
import { Friendship } from '../src/models/Friendship.js';
import { installJamsStore } from '../test-support/jams-store.js';

const root = fileURLToPath(new URL('../../', import.meta.url));
const previousCwd = process.cwd();
const temp = await fs.mkdtemp(path.join(os.tmpdir(), 'gpc-jams-browser-'));
process.chdir(temp);
process.env.JWT_SECRET = crypto.randomBytes(32).toString('hex');
const { createApp } = await import('../src/app.js');
const host = 'a'.repeat(24), guest = 'b'.repeat(24);
const users = [{ _id: host, name: 'Hôte test' }, { _id: guest, name: 'Ami test' }];
mock.method(User, 'findById', () => ({ select: async () => ({ sessionVersion: 0 }) }));
mock.method(User, 'find', filter => ({ select: () => ({ lean: async () => users.filter(user => filter._id.$in.map(String).includes(user._id)) }) }));
mock.method(User, 'exists', async filter => users.some(user => user._id === String(filter._id)));
mock.method(Friendship, 'findOne', () => ({ lean: async () => ({ status: 'accepted' }) }));
mock.method(Friendship, 'countDocuments', async filter => filter.status === 'pending' ? 0 : 1);
mock.method(Friendship, 'find', () => {
  const query = { sort: () => query, skip: () => query, limit: () => query, populate: () => query,
    lean: async () => [{ _id: 'c'.repeat(24), status: 'accepted', requester: users[0], recipient: users[1], createdAt: new Date() }] };
  return query;
});
installJamsStore({ mock }, Jam);
const app = createApp(), dist = path.join(root, 'frontend-starter/dist/gpc/browser');
app.use(express.static(dist));
app.get(/^(?!\/api).*/, (_req, res) => res.sendFile(path.join(dist, 'index.html')));
const server = app.listen(0, '127.0.0.1');
await new Promise(resolve => server.once('listening', resolve));
const origin = `http://127.0.0.1:${server.address().port}`;
const processes = [], sockets = [], errors = [], network = [];
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
async function waitFor(condition, label) {
  for (let attempt = 0; attempt < 150; attempt++) {
    if (await condition()) return;
    await delay(100);
  }
  throw new Error(`Timed out: ${label}`);
}
async function openAccount(id, profile) {
  const browser = spawn(process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe', [
    '--headless=new', '--remote-debugging-port=0', `--user-data-dir=${path.join(temp, profile)}`,
    '--no-first-run', '--no-default-browser-check', 'about:blank',
  ], { windowsHide: true, stdio: 'ignore' });
  processes.push(browser);
  let launchError;
  browser.on('error', error => { launchError = error; });
  let port;
  await waitFor(async () => {
    if (launchError) throw launchError;
    try { port = (await fs.readFile(path.join(temp, profile, 'DevToolsActivePort'), 'utf8')).split('\n')[0]; return true; }
    catch (error) { if (error.code !== 'ENOENT') throw error; return false; }
  }, 'Chrome startup');
  const pages = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
  const ws = new WebSocket(pages.find(page => page.type === 'page').webSocketDebuggerUrl);
  sockets.push(ws);
  await new Promise(resolve => ws.addEventListener('open', resolve, { once: true }));
  let sequence = 0;
  const pending = new Map();
  ws.addEventListener('message', event => {
    const message = JSON.parse(event.data);
    if (message.id) {
      const callback = pending.get(message.id); pending.delete(message.id);
      if (message.error) callback.reject(new Error(message.error.message)); else callback.resolve(message.result);
    } else if (message.method === 'Runtime.exceptionThrown') errors.push(message.params.exceptionDetails.text);
    else if (message.method === 'Network.requestWillBeSent' && message.params.request.url.includes('/api/jams')) {
      const request = message.params.request;
      network.push({ method: request.method, url: new URL(request.url).pathname,
        authorized: !!(request.headers.Authorization || request.headers.authorization) });
    }
  });
  const call = (method, params = {}) => new Promise((resolve, reject) => {
    const id = ++sequence; pending.set(id, { resolve, reject }); ws.send(JSON.stringify({ id, method, params }));
  });
  const evaluate = async expression => {
    const response = await call('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true, userGesture: true });
    if (response.exceptionDetails) throw new Error(response.exceptionDetails.exception?.description ?? response.exceptionDetails.text);
    return response.result?.value;
  };
  const click = text => evaluate(`(() => { const button = [...document.querySelectorAll('button')].find(b => b.textContent.trim() === ${JSON.stringify(text)}); if (!button || button.disabled) throw new Error('Button unavailable: ' + ${JSON.stringify(text)}); button.click(); })()`);
  const has = text => evaluate(`document.body.textContent.includes(${JSON.stringify(text)})`);
  await call('Network.enable'); await call('Runtime.enable'); await call('Page.enable');
  const token = jwt.sign({ sub: id, sessionVersion: 0 }, process.env.JWT_SECRET);
  await call('Page.addScriptToEvaluateOnNewDocument', { source: `localStorage.setItem('gpc_token', ${JSON.stringify(token)});` });
  await call('Page.navigate', { url: origin + '/jams' });
  await waitFor(() => evaluate(`!!document.querySelector('#jam-name')`), 'Jam page');
  return { call, evaluate, click, has };
}

try {
  const owner = await openAccount(host, 'host'), friend = await openAccount(guest, 'guest');
  await owner.evaluate(`(() => { const input = document.querySelector('#jam-name'); input.value = 'Jam navigateur'; input.dispatchEvent(new Event('input', { bubbles: true })); })()`);
  await owner.click('Créer une jam');
  await waitFor(() => owner.has('Inviter mes amis'), 'Created room');
  await waitFor(() => owner.has('Ami test'), 'Friend picker');
  await owner.click('Inviter');
  await waitFor(() => owner.has('Invitation envoyée'), 'Invitation confirmation');
  await friend.click('Invitations reçues');
  await waitFor(() => friend.has('Jam navigateur'), 'Incoming invitation');
  await friend.click('Accepter et rejoindre');
  await waitFor(() => friend.has('Participants · 2'), 'Guest joins');
  assert.equal(await friend.has('Inviter mes amis'), false);
  await owner.click('Actualiser');
  await waitFor(() => owner.has('Participants · 2'), 'Host sees membership');
  await friend.call('Page.reload');
  await waitFor(() => friend.has('Participants · 2'), 'Membership survives reload');
  for (const width of [390, 900]) {
    await owner.call('Emulation.setDeviceMetricsOverride', { width, height: 844, deviceScaleFactor: 1, mobile: width < 500 });
    assert.equal(await owner.evaluate('document.documentElement.scrollWidth <= innerWidth'), true, `Overflow at width ${width}`);
  }
  await friend.click('Quitter la jam');
  await friend.click('Annuler');
  assert.equal(await friend.has('Participants · 2'), true);
  await friend.click('Quitter la jam'); await friend.click('Confirmer');
  await waitFor(() => friend.has('Vous ne participez à aucune jam'), 'Guest leaves');
  await owner.click('Actualiser');
  await waitFor(() => owner.has('Participants · 1'), 'Departure visible');
  await owner.click('Inviter');
  await waitFor(() => owner.has('Invitation envoyée'), 'Second invitation');
  await friend.click('Invitations reçues');
  await waitFor(() => friend.has('Accepter et rejoindre'), 'Second invitation arrives');
  await friend.click('Refuser');
  await waitFor(() => friend.has('Aucune invitation en attente'), 'Refusal');
  await owner.click('Actualiser');
  await waitFor(() => owner.evaluate(`[...document.querySelectorAll('button')].some(b => b.textContent.trim() === 'Inviter' && !b.disabled)`), 'Refusal visible to host');
  await owner.click('Inviter');
  await waitFor(() => owner.has('Invitation envoyée'), 'Third invitation');
  await owner.click('Fermer la jam pour tous'); await owner.click('Confirmer');
  await waitFor(() => owner.has('Vous ne participez à aucune jam'), 'Room closed');
  await friend.click('Actualiser');
  await waitFor(() => friend.has('Aucune invitation en attente'), 'Closure cancels pending invite');
  assert.ok(network.every(request => request.authorized));
  assert.ok(network.some(request => request.method === 'POST' && request.url.endsWith('/invitations')));
  assert.ok(network.some(request => request.method === 'PUT' && request.url.endsWith('/membership')));
  assert.ok(network.some(request => request.method === 'DELETE' && request.url.endsWith('/membership')));
  assert.deepEqual(errors, []);
  console.log('JAMS BROWSER PASS: two isolated accounts, create/invite/accept, participants, reload, departure/cancel/refusal, host closure, authenticated Network requests, mobile/tablet layout; simulated MongoDB.');
  await owner.call('Browser.close'); await friend.call('Browser.close');
} finally {
  sockets.forEach(socket => socket.close());
  processes.forEach(browser => browser.kill());
  server.closeAllConnections(); await new Promise(resolve => server.close(resolve));
  mock.restoreAll(); process.chdir(previousCwd);
  assert.equal(path.dirname(path.resolve(temp)), path.resolve(os.tmpdir()));
  assert.ok(path.basename(temp).startsWith('gpc-jams-browser-'));
  await delay(1000);
  await fs.rm(temp, { recursive: true, force: true, maxRetries: 5, retryDelay: 500 });
}
