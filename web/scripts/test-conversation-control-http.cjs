'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { spawn, spawnSync } = require('node:child_process');
const assert = require('node:assert/strict');
const http = require('node:http');
let syntheticProviderRequests = 0;
const provider = http.createServer((req, res) => { syntheticProviderRequests++; req.resume(); setTimeout(() => { res.writeHead(400, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: { message: 'Synthetic provider fixture; no real model request', type: 'invalid_request_error' } })); }, 5000); });
const home = fs.mkdtempSync(path.join(require('node:os').tmpdir(), 'codex-rpc-isolated-'));
fs.writeFileSync(path.join(home, 'config.toml'), `[model_providers.fixture]
name = "Local fixture"
base_url = "http://127.0.0.1:4199/v1"
wire_api = "responses"
requires_openai_auth = false
request_max_retries = 0
stream_max_retries = 0
`);
const children = [];
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
async function start(port) {
  let output = '';
  const child = spawn(process.execPath, [path.resolve(__dirname, '../dist-cli/index.js'), '--host', '127.0.0.1', '--port', String(port), '--no-password', '--no-open', '--no-tunnel', '--no-login'], {
    env: { ...process.env, CODEX_HOME: home, CODEXUI_CODEX_COMMAND: process.env.RPC_TEST_CODEX || '' },
    windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'],
  });
  children.push(child);
  child.stdout.on('data', data => { output += data; });
  child.stderr.on('data', data => { output += data; });
  const base = `http://127.0.0.1:${port}`;
  for (let i = 0; i < 60; i++) {
    if (child.exitCode !== null) throw Error(output.slice(-1000));
    try { if ((await fetch(base)).ok) return base; } catch {}
    await delay(250);
  }
  throw Error('Readiness timed out');
}

async function client(base, label, cookie = '') {
  const response = await fetch(base + '/codex-api/control/register', { method: 'POST', headers: { 'Content-Type': 'application/json', cookie }, body: JSON.stringify({ label }) });
  const identity = (await response.json()).data;
  const headers = { 'Content-Type': 'application/json', 'x-codex-client': identity.id, 'x-codex-client-key': identity.key, cookie };
  return {
    identity, proof: null, headers,
    async state(threadId) { return (await (await fetch(base + '/codex-api/control/state?threadId=' + threadId, { headers })).json()).data; },
    async op(route, data) {
      const r = await fetch(base + '/codex-api/control/' + route, { method: 'POST', headers: { ...headers, 'x-codex-control': JSON.stringify(this.proof) }, body: JSON.stringify(data) });
      const body = await r.json(); return { status: r.status, ...body };
    },
    async claim(threadId, takeover = false, stop = false) {
      const state = await this.state(threadId);
      const reply = await this.op('claim', { threadId, epoch: state.epoch, version: state.version, takeover, stop });
      assert.equal(reply.status, 200, JSON.stringify(reply)); this.proof = reply.data.proof; return reply.data;
    },
    async rpc(method, params, requestId = require('node:crypto').randomUUID()) {
      const r = await fetch(base + '/codex-api/rpc', { method: 'POST', headers: { ...headers, 'x-codex-control': JSON.stringify(this.proof) }, body: JSON.stringify({ method, params, requestId }) });
      assert.equal(r.status, 200); return r.json();
    },
  };
}
(async () => {
  await new Promise(resolve => provider.listen(4199, '127.0.0.1', resolve));
  const base = await start(4197);
  const a = await client(base, 'A'), b = await client(base, 'B');
  const started = await a.rpc('thread/start', { cwd: home, model: 'gpt-6.1-sol', modelProvider: 'fixture', persistExtendedHistory: true });
  const id = started.result?.thread?.id; assert.ok(id, JSON.stringify(started));
  a.proof = (await a.state(id)).proof;
  const observed = await b.state(id); assert.equal(observed.proof, null); assert.equal(observed.owner.id, a.identity.id);
  assert.equal((await b.rpc('turn/start', { threadId: id, input: [] })).error.code, 'control_conflict');
  const params = { threadId: id, input: [{ type: 'text', text: 'Isolated synthetic control test' }] };
  const requestId = require('node:crypto').randomUUID();
  const accepted = await a.rpc('turn/start', params, requestId); assert.ok(accepted.result?.turn?.id, JSON.stringify(accepted));
  const duplicated = await a.rpc('turn/start', params, requestId); assert.equal(duplicated.result.turn.id, accepted.result.turn.id);
  const queued = { id: 'queue-paused-1', text: 'Must not run after takeover', imageUrls: [], skills: [], fileAttachments: [], collaborationMode: 'default' };
  const queueResponse = await fetch(base + '/codex-api/thread-queue-state', { method: 'PUT', headers: a.headers,
    body: JSON.stringify({ patch: { [id]: [queued] }, proofs: { [id]: a.proof } }) });
  assert.equal(queueResponse.status, 200, await queueResponse.text());
  assert.equal((await b.state(id)).activity, 'running');
  const transferred = await b.claim(id, true); assert.equal(transferred.turnId, accepted.result.turn.id);
  assert.equal(transferred.activity, 'running', 'takeover alone must not interrupt executor');
  for (const method of ['turn/start', 'turn/interrupt', 'thread/name/set', 'thread/rollback', 'codexui/thread/release']) {
    const reply = await a.rpc(method, { ...params, turnId: accepted.result.turn.id, name: 'late', numTurns: 1 });
    assert.equal(reply.error?.code, 'control_conflict', method);
  }
  assert.equal((await a.op('recheck', { threadId: id })).status, 409, 'an old controller cannot probe/reacquire a native writer');
  assert.equal((await a.op('heartbeat', { threadId: id })).status, 409);
  assert.equal((await a.op('release', { threadId: id })).status, 409);
  const oldQueue = await fetch(base + '/codex-api/thread-queue-state', { method: 'PUT', headers: a.headers, body: JSON.stringify({ patch: { [id]: [] }, proofs: { [id]: a.proof } }) });
  assert.equal(oldQueue.status, 409);
  const wrongSession = await fetch(base + '/codex-api/control/state?threadId=' + id, { headers: { ...b.headers, cookie: 'portal_session=different' } });
  assert.equal(wrongSession.status, 409);
  const stopped = await a.claim(id, true, true); assert.equal(stopped.activity, 'idle');
  const received = await fetch(base + '/codex-api/control/receipt?id=' + requestId, { headers: a.headers });
  assert.equal((await received.json()).data.state, 'completed');
  await delay(5500);
  const queueState = (await (await fetch(base + '/codex-api/thread-queue-state')).json()).data;
  assert.equal(queueState[id]?.[0]?.id, queued.id, 'old queue survives but cannot run after handoff');
  const read = await a.rpc('thread/read', { threadId: id, includeTurns: true });
  assert.equal(read.result.thread.id, id); assert.equal(read.result.thread.turns.length, 1, 'dedupe and paused queue must create only one turn');
  assert.equal((await a.state(id)).desktopReleaseAvailable, false);
  console.log(JSON.stringify({ passed: true, realModelRequests: 0, syntheticProviderRequests,
    checks: ['same ID shared read', 'single active controller', 'active task survives takeover', 'stale send stop rename rollback release heartbeat blocked', 'queue origin fenced and retained', 'same request accepted once', 'auth-session binding', 'stop waits for completion', 'desktop release capability honest'] }));
})().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => {
  provider.close();
  for (const child of children) {
    if (process.platform === 'win32' && child.pid) spawnSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' });
    else child.kill();
  }
});
