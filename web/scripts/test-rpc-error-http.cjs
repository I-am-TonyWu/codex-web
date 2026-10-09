'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { spawn, spawnSync } = require('node:child_process');
const assert = require('node:assert/strict');
const http = require('node:http');
let syntheticProviderRequests = 0;
const provider = http.createServer((req, res) => { syntheticProviderRequests++; req.resume(); res.writeHead(400, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: { message: 'Synthetic provider fixture; no real model request', type: 'invalid_request_error' } })); });
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
const identities = new Map();
async function controlPost(base, route, data, proof) {
  let identity = identities.get(base);
  if (!identity) {
    const r = await fetch(base + '/codex-api/control/register', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ label: 'Fixture' }) });
    identity = (await r.json()).data; identities.set(base, identity);
  }
  if (route === '__identity') return identity;
  const headers = { 'Content-Type': 'application/json', 'x-codex-client': identity.id, 'x-codex-client-key': identity.key, 'x-codex-control': JSON.stringify(proof || null) };
  const response = await fetch(base + '/codex-api/control/' + route, { method: 'POST', headers, body: JSON.stringify(data) });
  return (await response.json()).data;
}
async function rpc(base, method, params) {
  await controlPost(base, '__identity', {});
  const identity = identities.get(base);
  const headers = { 'Content-Type': 'application/json', 'x-codex-client': identity.id, 'x-codex-client-key': identity.key };
  const mutates = method.startsWith('turn/') || (method.startsWith('thread/') && !['thread/read', 'thread/list', 'thread/loaded/list'].includes(method)) || method === 'codexui/thread/release';
  if (mutates && params?.threadId) {
    const state = (await (await fetch(base + '/codex-api/control/state?threadId=' + params.threadId, { headers })).json()).data;
    const owned = state.proof ? state : await controlPost(base, 'claim', { threadId: params.threadId, epoch: state.epoch, version: state.version, takeover: true });
    headers['x-codex-control'] = JSON.stringify(owned.proof);
  }
  const response = await fetch(base + '/codex-api/rpc', { method: 'POST', headers,
    body: JSON.stringify({ method, params, requestId: require('node:crypto').randomUUID() }), signal: AbortSignal.timeout(25000) });
  assert.equal(response.status, 200, `${method} must retain JSON through a gateway`);
  assert.match(response.headers.get('content-type'), /application\/json/);
  return response.json();
}

(async () => {
  await new Promise(resolve => provider.listen(4199, '127.0.0.1', resolve));
  const first = await start(4197), second = await start(4198);
  const rejected = await rpc(second, 'turn/start', { threadId: 'invalid-fixture-id', input: [{ type: 'text', text: 'never reaches a model' }] });
  assert.equal(rejected.error.code, 'rpc_error');
  assert.match(rejected.error.message, /invalid thread id/);
  const started = await rpc(first, 'thread/start', { cwd: home, model: 'gpt-6.1-sol', modelProvider: 'fixture', persistExtendedHistory: true });
  assert.ok(started.result?.thread?.id, JSON.stringify(started));
  const originalId = started.result.thread.id;
  const named = await rpc(first, 'thread/name/set', { threadId: originalId, name: 'Isolated writer fixture' });
  assert.ok(!named.error, JSON.stringify(named));
  const readOnly = await rpc(second, 'thread/resume', { threadId: originalId });
  assert.equal(readOnly.result?.webReadOnlyReason, 'thread_writer_conflict', JSON.stringify(readOnly));
  assert.equal(readOnly.result.thread.id, originalId);
  const identity2 = identities.get(second);
  const h2 = { 'x-codex-client': identity2.id, 'x-codex-client-key': identity2.key };
  const state2 = async () => (await (await fetch(second + '/codex-api/control/state?threadId=' + originalId, { headers: h2 })).json()).data;
  const blockedCheck = await controlPost(second, 'recheck', { threadId: originalId }, (await state2()).proof);
  assert.equal(blockedCheck.activity, 'external', 'real writer recheck remains blocked while the external process holds its idle writer');
  assert.ok(Buffer.byteLength(JSON.stringify(blockedCheck)) < 1500, 'recheck returns only compact control metadata');
  const cannotReleaseOtherOwner = await rpc(second, 'codexui/thread/release', { threadId: originalId });
  assert.equal(cannotReleaseOtherOwner.result?.released, false);
  const handoffStartedAt = Date.now();
  const releasedOriginal = await rpc(first, 'codexui/thread/release', { threadId: originalId });
  assert.equal(releasedOriginal.result?.released, true, JSON.stringify(releasedOriginal));
  const recoveredCheck = await controlPost(second, 'recheck', { threadId: originalId }, (await state2()).proof);
  assert.equal(recoveredCheck.activity, 'idle', 'fresh check clears the sticky external conflict');
  const afterCheck = await rpc(second, 'thread/read', { threadId: originalId, includeTurns: false });
  assert.equal(afterCheck.result.thread.status.type, 'notLoaded', 'explicit check does not retain a new idle writer');
  const sameOriginal = await rpc(second, 'thread/resume', { threadId: originalId });
  assert.equal(sameOriginal.result?.thread?.id, originalId);
  assert.ok(!sameOriginal.result.webReadOnlyReason, JSON.stringify(sameOriginal));
  const originalHandoffMs = Date.now() - handoffStartedAt;
  await rpc(second, 'codexui/thread/release', { threadId: originalId });
  await rpc(first, 'thread/resume', { threadId: originalId });
  const forked = await rpc(second, 'thread/fork', { threadId: originalId, cwd: home, model: 'gpt-6.1-sol' });
  assert.ok(forked.result?.thread?.id, JSON.stringify(forked));
  assert.notEqual(forked.result.thread.id, originalId);
  const resumedFork = await rpc(second, 'thread/resume', { threadId: forked.result.thread.id });
  assert.ok(resumedFork.result && !resumedFork.result.webReadOnlyReason, JSON.stringify(resumedFork));
  // A real app-server completes a failed turn against a localhost-only provider.
  // This validates the automatic notification hook without using an account/model.
  const simulatedTurn = await rpc(first, 'turn/start', { threadId: originalId,
    input: [{ type: 'text', text: 'Local lifecycle fixture only' }] });
  assert.ok(simulatedTurn.result?.turn?.id, JSON.stringify(simulatedTurn));
  let unloaded = false;
  for (let i = 0; i < 80; i++) {
    const metadata = await rpc(first, 'thread/read', { threadId: originalId, includeTurns: false });
    if (metadata.result?.thread?.status?.type === 'notLoaded') { unloaded = true; break; }
    await delay(100);
  }
  assert.equal(unloaded, true, 'completion must gracefully unload its own idle writer');
  assert.ok(syntheticProviderRequests > 0);
  const reclaimed = await rpc(second, 'thread/resume', { threadId: originalId });
  assert.equal(reclaimed.result?.thread?.id, originalId);
  assert.ok(!reclaimed.result?.webReadOnlyReason, JSON.stringify(reclaimed));
  console.log(JSON.stringify({ passed: true, isolatedHome: true, realModelRequests: 0, syntheticProviderRequests, originalHandoffMs,
    scenarios: ['RPC rejection stays HTTP 200 JSON', 'desktop writer conflict stays readable', 'explicit fork acquires independent writer', 'other owner is never released', 'real external lock recheck', 'blocked cache cleared after release', 'compact probe releases its own idle writer', 'original ID survives handoff', 'completed turn automatically releases idle writer'] }));
})().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => {
  provider.close();
  for (const child of children) {
    if (process.platform === 'win32' && child.pid) spawnSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' });
    else child.kill();
  }
});
