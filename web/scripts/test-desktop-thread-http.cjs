'use strict';
// A real isolated Codex writer, a local-only provider, and a desktop IPC protocol fixture.
// The installed desktop is never stopped and no account/model is called.
const fs = require('node:fs'), path = require('node:path'), os = require('node:os');
const { spawn, spawnSync } = require('node:child_process');
const net = require('node:net'), http = require('node:http'), assert = require('node:assert/strict'), crypto = require('node:crypto');
const home = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-desktop-bridge-test-'));
const pipe = '\\\\.\\pipe\\codex-web-test-' + crypto.randomUUID();
const children = [], sockets = new Set(), delay = ms => new Promise(r => setTimeout(r, ms));
let providerCalls = 0, sends = 0, thread, completed = false, pending = new Map(), nextId = 1;
const provider = http.createServer((req, res) => { providerCalls++; req.resume(); setTimeout(() => { res.writeHead(400, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: { message: 'Local-only fixture', type: 'invalid_request_error' } })); }, 2000); });
const write = (socket, event) => { const b = Buffer.from(JSON.stringify(event)), h = Buffer.alloc(4); h.writeUInt32LE(b.length); socket.write(Buffer.concat([h, b])); };
const nativeState = () => ({ id: thread.id, cwd: home, title: 'Desktop fixture', latestModel: 'gpt-6.1-sol', modelProvider: 'fixture', threadRuntimeStatus: thread.status,
  requests: [], turns: thread.turns.map(t => ({ ...t, turnId: t.id })) });
function broadcast(socket) { write(socket, { type: 'broadcast', method: 'thread-stream-state-changed', sourceClientId: 'owner', version: 11,
  params: { hostId: 'local', conversationId: thread.id, change: { type: 'snapshot', revision: ++socket.revision, conversationState: nativeState() } } }); }
const ipc = net.createServer(socket => {
  sockets.add(socket); socket.revision = 0; socket.following = false; let buffer = Buffer.alloc(0);
  socket.on('close', () => sockets.delete(socket));
  socket.on('data', data => { buffer = Buffer.concat([buffer, data]); while (buffer.length >= 4 && buffer.length >= 4 + buffer.readUInt32LE(0)) {
    const size = buffer.readUInt32LE(0), request = JSON.parse(buffer.subarray(4, 4 + size)); buffer = buffer.subarray(4 + size);
    if (request.type === 'broadcast') { socket.following = request.params.following; if (socket.following) broadcast(socket); continue; }
    if (request.type !== 'request') continue;
    (async () => {
      let result;
      if (request.method === 'initialize') result = { clientId: 'web-' + crypto.randomUUID() };
      else if (request.method === 'thread-owner-discovery') { assert.equal(request.version, 1); result = { supportsUntrustedAppInput: true }; }
      else if (request.method === 'thread-follower-read-model-settings') result = { settings: { resumeState: 'resumed' } };
      else if (request.method === 'thread-follower-start-turn') {
        assert.equal(request.version, 2); assert.equal(request.targetClientId, 'owner'); const params = request.params.turnStart.request;
        assert.equal(params.sandboxPolicy.type, 'workspaceWrite'); assert.equal(params.approvalPolicy, 'on-request');
        sends++; result = { result: await ownerRpc('turn/start', params) };
      } else if (request.method === 'thread-follower-interrupt-turn') result = { ok: true, ...(await ownerRpc('turn/interrupt', { threadId: thread.id, turnId: request.params.expectedTurnId })) };
      else throw Error('unexpected method ' + request.method);
      write(socket, { type: 'response', requestId: request.requestId, resultType: 'success', method: request.method, handledByClientId: 'owner', result });
    })().catch(error => write(socket, { type: 'response', requestId: request.requestId, resultType: 'error', error: error.message }));
  } });
});
let owner;
function ownerRpc(method, params) { return new Promise((resolve, reject) => { const id = nextId++; pending.set(id, { resolve, reject }); owner.stdin.write(JSON.stringify({ id, method, params }) + '\n'); }); }
async function startOwner() {
  if (!process.env.RPC_TEST_CODEX) throw Error('Set RPC_TEST_CODEX to a real Codex executable');
  owner = spawn(process.env.RPC_TEST_CODEX, ['app-server'], { env: { ...process.env, CODEX_HOME: home }, windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] }); children.push(owner);
  let buffer = '';
  owner.stdout.on('data', data => { buffer += data; let newline; while ((newline = buffer.indexOf('\n')) >= 0) {
    const line = buffer.slice(0, newline); buffer = buffer.slice(newline + 1); let event; try { event = JSON.parse(line); } catch { continue; }
    const waiting = pending.get(event.id); if (waiting) { pending.delete(event.id); event.error ? waiting.reject(Error(event.error.message)) : waiting.resolve(event.result); continue; }
    if (!thread) continue;
    if (event.method === 'turn/started') { thread.status = { type: 'active', activeFlags: [] }; thread.turns.push(event.params.turn); }
    if (event.method === 'turn/completed') { thread.status = { type: 'idle' }; thread.turns = thread.turns.map(t => t.id === event.params.turn.id ? event.params.turn : t); completed = true; }
    if (['turn/started', 'turn/completed'].includes(event.method)) for (const socket of sockets) if (socket.following) broadcast(socket);
  } }); owner.stderr.resume();
  await ownerRpc('initialize', { clientInfo: { name: 'local-desktop-bridge-fixture', version: '1' }, capabilities: { experimentalApi: true } }); owner.stdin.write('{"method":"initialized"}\n');
  thread = (await ownerRpc('thread/start', { cwd: home, model: 'gpt-6.1-sol', modelProvider: 'fixture', persistExtendedHistory: true })).thread;
  await ownerRpc('thread/name/set', { threadId: thread.id, name: 'Isolated desktop fixture' });
}
async function startWeb() {
  const child = spawn(process.execPath, [path.resolve(__dirname, '../dist-cli/index.js'), '--host', '127.0.0.1', '--port', '4197', '--no-password', '--no-open', '--no-tunnel', '--no-login'], {
    env: { ...process.env, CODEX_HOME: home, CODEXUI_CODEX_COMMAND: process.env.RPC_TEST_CODEX, CODEXUI_DESKTOP_IPC_ENDPOINT: pipe }, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] }); children.push(child);
  let output = ''; child.stdout.on('data', d => output += d); child.stderr.on('data', d => output += d);
  for (let i = 0; i < 80; i++) { if (child.exitCode !== null) throw Error(output.slice(-1500)); try { if ((await fetch('http://127.0.0.1:4197')).ok) return; } catch {} await delay(200); }
  throw Error('Web readiness timeout');
}
const base = 'http://127.0.0.1:4197';
async function client(label) {
  const identity = (await (await fetch(base + '/codex-api/control/register', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ label }) })).json()).data;
  const headers = { 'Content-Type': 'application/json', 'x-codex-client': identity.id, 'x-codex-client-key': identity.key };
  return { proof: null, async state() { return (await (await fetch(base + '/codex-api/control/state?threadId=' + thread.id, { headers })).json()).data; },
    async claim(takeover) { const state = await this.state(); const data = (await (await fetch(base + '/codex-api/control/claim', { method: 'POST', headers, body: JSON.stringify({ threadId: thread.id, epoch: state.epoch, version: state.version, takeover }) })).json()).data; this.proof = data.proof; },
    async rpc(method, params, requestId = crypto.randomUUID()) { const response = await fetch(base + '/codex-api/rpc', { method: 'POST', headers: { ...headers, 'x-codex-control': JSON.stringify(this.proof) }, body: JSON.stringify({ method, params, requestId }) }); assert.equal(response.status, 200); return response.json(); } };
}
(async () => {
  await new Promise(resolve => provider.listen(4199, '127.0.0.1', resolve));
  fs.writeFileSync(path.join(home, 'config.toml'), `[model_providers.fixture]\nname = "Fixture"\nbase_url = "http://127.0.0.1:4199/v1"\nwire_api = "responses"\nrequires_openai_auth = false\nrequest_max_retries = 0\nstream_max_retries = 0\n`);
  await new Promise(resolve => ipc.listen(pipe, resolve)); await startOwner(); await startWeb();
  const a = await client('A'), b = await client('B'); await a.claim(false);
  const resumed = await a.rpc('thread/resume', { threadId: thread.id }); assert.ok(resumed.result, JSON.stringify(resumed)); assert.equal(resumed.result.webExecutionSource, 'desktop'); assert.equal(resumed.result.thread.id, thread.id);
  assert.equal((await a.state()).executionSource, 'desktop'); assert.equal(sends, 0, 'resume must not send the draft');
  const requestId = crypto.randomUUID(), params = { threadId: thread.id, input: [{ type: 'text', text: 'Local-only synthetic fixture' }] };
  const started = await a.rpc('turn/start', params, requestId); assert.ok(started.result.turn.id);
  assert.equal((await a.rpc('turn/start', params, requestId)).result.turn.id, started.result.turn.id); assert.equal(sends, 1);
  await b.claim(true); assert.equal((await a.rpc('turn/start', params)).error.code, 'control_conflict');
  for (let i = 0; i < 100 && !completed; i++) await delay(100); assert.equal(completed, true);
  const history = await b.rpc('thread/read', { threadId: thread.id, includeTurns: true }); assert.equal(history.result.thread.id, thread.id); assert.equal(history.result.thread.turns.length, 1);
  const nativeRead = await ownerRpc('thread/read', { threadId: thread.id, includeTurns: true }); assert.equal(nativeRead.thread.turns.length, 1);
  assert.equal(providerCalls, 1); assert.equal(sends, 1);
  console.log(JSON.stringify({ passed: true, realModelRequests: 0, providerCalls, sends, checks: ['real external writer retained', 'native IPC resume same ID', 'workspace sandbox preserved', 'one request one real turn', 'late controller rejected', 'native completion and original history readable'] }));
})().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => {
  for (const socket of sockets) socket.destroy(); ipc.close(); provider.close();
  for (const child of children) if (process.platform === 'win32' && child.pid) spawnSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' }); else child.kill();
});
