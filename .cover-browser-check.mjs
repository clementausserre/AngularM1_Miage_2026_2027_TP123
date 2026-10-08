import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { pathToFileURL } from 'node:url';
import { spawn } from 'node:child_process';
import crypto from 'node:crypto';
const root = process.cwd();
const temp = await fs.mkdtemp(path.join(os.tmpdir(), 'gpc-browser-'));
const fromBackend = file => import(pathToFileURL(path.join(root, 'backend', file)).href);
process.chdir(temp);
process.env.JWT_SECRET = crypto.randomBytes(32).toString('hex');
const { default: express } = await fromBackend('node_modules/express/index.js');
const { default: jwt } = await fromBackend('node_modules/jsonwebtoken/index.js');
const { createApp } = await fromBackend('src/app.js');
const { Track } = await fromBackend('src/models/Track.js');
const { User } = await fromBackend('src/models/User.js');
const ownerId = 'aaaaaaaaaaaaaaaaaaaaaaaa';
const tracks = new Map();
const user = { sessionVersion: 0, toPublic: () => ({ id: ownerId, name: 'Browser Test', email: 'browser@example.test' }) };
User.findById = id => {
  const selected = { ...user, toPublic: () => ({ ...user.toPublic(), id: String(id) }) };
  return { select: async () => selected, then: (resolve, reject) => Promise.resolve(selected).then(resolve, reject) };
};
Track.create = async fields => { const track = new Track({ ...fields, createdAt: new Date() }); await track.validate(); tracks.set(track.id, track); return track; };
const owned = filter => { const track = tracks.get(String(filter._id)); return track && String(track.ownerId) === filter.ownerId ? track : null; };
Track.findOne = filter => ({ select: async () => { const track = owned(filter); return track ? new Track(track.toObject()) : null; } });
Track.findOneAndUpdate = async (filter, update) => {
  const track = owned(filter);
  if (!track || (filter['cover.version'] && filter['cover.version'] !== track.cover?.version)) return null;
  track.cover = update.$set.cover; return track;
};
Track.findOneAndDelete = filter => ({ select: async () => { const track = owned(filter); if (track) tracks.delete(track.id); return track; } });
Track.find = filter => {
  const query = { sort: () => query, skip: () => query, limit: () => query, select: () => query,
    lean: async () => [...tracks.values()].filter(track => String(track.ownerId) === filter.ownerId).map(track => track.toObject()) };
  return query;
};
Track.countDocuments = async filter => [...tracks.values()].filter(track => String(track.ownerId) === filter.ownerId).length;
const app = createApp();
const dist = path.join(root, 'frontend-starter/dist/gpc/browser');
app.use(express.static(dist));
app.get(/^(?!\/api).*/, (_req, res) => res.sendFile(path.join(dist, 'index.html')));
const server = app.listen(0, '127.0.0.1');
await new Promise(resolve => server.once('listening', resolve));
const origin = `http://127.0.0.1:${server.address().port}`;
const token = jwt.sign({ sub: ownerId, sessionVersion: 0 }, process.env.JWT_SECRET);
const browser = spawn('C:/Program Files/Google/Chrome/Application/chrome.exe', [
  '--headless=new', '--remote-debugging-port=0', `--user-data-dir=${path.join(temp, 'chrome')}`,
  '--no-first-run', '--no-default-browser-check', 'about:blank',
], { windowsHide: true, stdio: 'ignore' });
let ws;
let secondSocket;
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
async function waitFor(fn, message) {
  for (let i = 0; i < 150; i++) { if (await fn()) return; await delay(100); }
  throw new Error(message);
}
try {
  let port;
  await waitFor(async () => {
    try { port = (await fs.readFile(path.join(temp, 'chrome/DevToolsActivePort'), 'utf8')).split('\n')[0]; return true; }
    catch (error) { if (error.code !== 'ENOENT') throw error; return false; }
  }, 'Chrome did not start');
  const pages = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
  ws = new WebSocket(pages.find(page => page.type === 'page').webSocketDebuggerUrl);
  await new Promise(resolve => ws.addEventListener('open', resolve, { once: true }));
  let sequence = 0;
  const pending = new Map();
  const network = [];
  const errors = [];
  ws.addEventListener('message', event => {
    const message = JSON.parse(event.data);
    if (message.id) {
      const callback = pending.get(message.id); pending.delete(message.id);
      if (message.error) callback.reject(new Error(message.error.message)); else callback.resolve(message.result);
    } else if (message.method === 'Network.requestWillBeSent') {
      const req = message.params.request;
      if (req.url.includes('/api/tracks')) network.push({ url: new URL(req.url).pathname, method: req.method,
        authorized: !!(req.headers.Authorization || req.headers.authorization),
        multipart: String(req.headers['Content-Type'] ?? req.headers['content-type'] ?? '').includes('multipart/form-data') });
    } else if (message.method === 'Runtime.exceptionThrown') errors.push(message.params.exceptionDetails.text);
  });
  const call = (method, params = {}) => new Promise((resolve, reject) => { const id = ++sequence; pending.set(id, { resolve, reject }); ws.send(JSON.stringify({ id, method, params })); });
  const evaluate = async expression => {
    const response = await call('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true, userGesture: true });
    if (response.exceptionDetails) throw new Error(response.exceptionDetails.exception?.description ?? response.exceptionDetails.text);
    return response.result?.value;
  };
  const clickText = text => evaluate(`(() => { const button = [...document.querySelectorAll('button')].find(b => b.textContent.trim() === ${JSON.stringify(text)}); if (!button || button.disabled) throw new Error('Button unavailable'); button.click(); })()`);
  await call('Network.enable'); await call('Runtime.enable'); await call('Page.enable');
  const initialSession = await call('Page.addScriptToEvaluateOnNewDocument', { source: `localStorage.setItem('gpc_token', ${JSON.stringify(token)});` });
  await call('Page.navigate', { url: origin + '/tracks' });
  await waitFor(() => evaluate(`!!document.querySelector('#track-file')`), 'Import form absent');
  await call('Page.removeScriptToEvaluateOnNewDocument', { identifier: initialSession.identifier });
  await evaluate(`(() => {
    window.selectCover = (selector, color) => {
      const canvas = document.createElement('canvas'); canvas.width = 1200; canvas.height = 900;
      const ctx = canvas.getContext('2d'); ctx.fillStyle = color; ctx.fillRect(0, 0, 1200, 900);
      const bytes = Uint8Array.from(atob(canvas.toDataURL('image/png').split(',')[1]), c => c.charCodeAt(0));
      const data = new DataTransfer(); data.items.add(new File([bytes], 'cover.png', { type: 'image/png' }));
      const input = document.querySelector(selector); input.files = data.files; input.dispatchEvent(new Event('change', { bubbles: true }));
    };
    const data = new DataTransfer(); data.items.add(new File(['audio'], 'browser-test.mp3', { type: 'audio/mpeg' }));
    const input = document.querySelector('#track-file'); input.files = data.files; input.dispatchEvent(new Event('change', { bubbles: true }));
    const title = document.querySelector('#track-title'); title.value = 'Browser cover test'; title.dispatchEvent(new Event('input', { bubbles: true }));
    window.selectCover('#import-cover', '#17654c');
  })()`);
  await waitFor(() => evaluate(`!!document.querySelector('app-cover-picker img')?.naturalWidth`), 'Preview absent');
  await clickText('Importer le morceau');
  await waitFor(() => evaluate(`document.querySelector('.track-card app-track-cover img')?.naturalWidth === 800`), 'Saved cover absent');
  assert.equal(await evaluate(`document.querySelector('#import-cover').files.length`), 0);
  // A second real browser tab observes BroadcastChannel and storage events.
  const secondTarget = await call('Target.createTarget', { url: origin + '/tracks' });
  const targets = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
  secondSocket = new WebSocket(targets.find(page => page.id === secondTarget.targetId).webSocketDebuggerUrl);
  await new Promise(resolve => secondSocket.addEventListener('open', resolve, { once: true }));
  let secondSequence = 0;
  const secondPending = new Map();
  secondSocket.addEventListener('message', event => {
    const message = JSON.parse(event.data);
    if (!message.id) return;
    const callback = secondPending.get(message.id); secondPending.delete(message.id);
    if (message.error) callback.reject(new Error(message.error.message)); else callback.resolve(message.result);
  });
  const secondCall = (method, params = {}) => new Promise((resolve, reject) => {
    const id = ++secondSequence; secondPending.set(id, { resolve, reject });
    secondSocket.send(JSON.stringify({ id, method, params }));
  });
  const secondEvaluate = async expression => {
    const response = await secondCall('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true, userGesture: true });
    if (response.exceptionDetails) throw new Error(response.exceptionDetails.exception?.description ?? response.exceptionDetails.text);
    return response.result?.value;
  };
  await waitFor(() => secondEvaluate(`!!document.querySelector('.track-card app-track-cover img')?.naturalWidth`), 'Second tab cover absent');
  await secondEvaluate(`[...document.querySelectorAll('button')].find(b => b.textContent.trim() === 'Lire le morceau').click()`);
  await waitFor(() => secondEvaluate(`!!document.querySelector('.player-identity app-track-cover img')?.naturalWidth && !!document.querySelector('audio')`), 'Second tab player absent');
  const initialPlayerCover = await secondEvaluate(`document.querySelector('.player-identity img').src`);
  const initialAudio = await secondEvaluate(`document.querySelector('audio').src`);
  await clickText('Modifier la couverture');
  await waitFor(() => evaluate(`!!document.querySelector('app-cover-editor input')`), 'Editor absent');
  await evaluate(`window.selectCover('app-cover-editor input', '#624b98')`);
  await clickText('Enregistrer');
  await waitFor(() => evaluate(`document.querySelector('app-cover-editor').textContent.includes('Couverture enregistrée.')`), 'Replacement failed');
  await waitFor(() => secondEvaluate(`document.querySelector('.player-identity img')?.src !== ${JSON.stringify(initialPlayerCover)} && !!document.querySelector('.player-identity img')?.naturalWidth`), 'Playing cover did not synchronize');
  assert.equal(await secondEvaluate(`document.querySelector('audio').src`), initialAudio, 'Cover refresh restarted audio');
  await clickText('Modifier la couverture');
  await clickText('Retirer la couverture');
  await waitFor(() => evaluate(`document.querySelector('.track-card app-track-cover').textContent.includes('Sans couverture')`), 'Removal failed');
  await clickText('Ajouter une couverture');
  await evaluate(`window.selectCover('app-cover-editor input', '#17654c')`);
  await clickText('Enregistrer');
  await waitFor(() => evaluate(`document.querySelector('.track-card app-track-cover img')?.naturalWidth === 800`), 'Re-add failed');
  await call('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  await delay(300);
  assert.equal(await evaluate(`document.documentElement.scrollWidth <= innerWidth`), true, 'Horizontal overflow on mobile');
  await evaluate(`document.querySelector('.delete-button').click()`);
  await waitFor(() => evaluate(`document.querySelector('dialog').open`), 'Delete dialog absent');
  await clickText('Supprimer');
  await waitFor(() => evaluate(`!document.querySelector('.track-card')`), 'Track deletion failed');
  assert.ok(network.some(req => req.method === 'POST' && req.multipart && req.authorized));
  assert.ok(network.some(req => req.method === 'GET' && req.url.endsWith('/cover') && req.authorized));
  assert.ok(network.some(req => req.method === 'PUT' && req.multipart && req.authorized));
  assert.ok(network.some(req => req.method === 'DELETE' && req.url.endsWith('/cover') && req.authorized));
  assert.deepEqual(errors, []);
  // Track data for the old account must disappear after a session switch.
  await Track.create({ ownerId, title: 'Old account private track', originalName: 'test.mp3', storedName: 'not-requested.mp3', mimeType: 'audio/mpeg', size: 1 });
  await clickText('Actualiser');
  await waitFor(() => evaluate(`!!document.querySelector('.track-card')`), 'Old account test data absent');
  const newToken = jwt.sign({ sub: 'bbbbbbbbbbbbbbbbbbbbbbbb', sessionVersion: 0 }, process.env.JWT_SECRET);
  await secondEvaluate(`localStorage.setItem('gpc_token', ${JSON.stringify(newToken)})`);
  await waitFor(() => evaluate(`!!document.querySelector('.empty') && !document.querySelector('.track-card') && !document.querySelector('audio')`), 'Old account data survived session switch');
  await secondEvaluate(`localStorage.removeItem('gpc_token')`);
  await waitFor(() => evaluate(`location.pathname === '/login' && !!document.querySelector('#login-email')`), 'Other-tab logout did not redirect');
  console.log('BROWSER PASS: uploads and private image requests, cover synchronization without audio reload, account switch clears private data, other-tab logout redirects.');
  await call('Browser.close');
} finally {
  ws?.close();
  secondSocket?.close();
  browser.kill();
  server.closeAllConnections();
  await new Promise(resolve => server.close(resolve));
  process.chdir(root);
  assert.equal(path.dirname(path.resolve(temp)), path.resolve(os.tmpdir()));
  assert.ok(path.basename(temp).startsWith('gpc-browser-'));
  await delay(1000);
  await fs.rm(temp, { recursive: true, force: true, maxRetries: 5, retryDelay: 500 });
}
