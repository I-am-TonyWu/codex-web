'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { spawn, spawnSync } = require('node:child_process');
const assert = require('node:assert/strict');
const home = fs.mkdtempSync(path.join(require('node:os').tmpdir(), 'codex-rpc-isolated-'));
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
async function rpc(base, method, params) {
  const response = await fetch(base + '/codex-api/rpc', { method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ method, params }), signal: AbortSignal.timeout(25000) });
  assert.equal(response.status, 200, `${method} must retain JSON through a gateway`);
  assert.match(response.headers.get('content-type'), /application\/json/);
  return response.json();
}
(async () => {
  const first = await start(4197), second = await start(4198);
  const rejected = await rpc(second, 'turn/start', { threadId: 'invalid-fixture-id', input: [{ type: 'text', text: 'never reaches a model' }] });
  assert.equal(rejected.error.code, 'rpc_error');
  assert.match(rejected.error.message, /invalid thread id/);
  const started = await rpc(first, 'thread/start', { cwd: home, model: 'gpt-6.1-sol', persistExtendedHistory: true });
  assert.ok(started.result?.thread?.id, JSON.stringify(started));
  const originalId = started.result.thread.id;
  const named = await rpc(first, 'thread/name/set', { threadId: originalId, name: 'Isolated writer fixture' });
  assert.ok(!named.error, JSON.stringify(named));
  const readOnly = await rpc(second, 'thread/resume', { threadId: originalId });
  assert.equal(readOnly.result?.webReadOnlyReason, 'thread_writer_conflict', JSON.stringify(readOnly));
  assert.equal(readOnly.result.thread.id, originalId);
  const forked = await rpc(second, 'thread/fork', { threadId: originalId, cwd: home, model: 'gpt-6.1-sol' });
  assert.ok(forked.result?.thread?.id, JSON.stringify(forked));
  assert.notEqual(forked.result.thread.id, originalId);
  const resumedFork = await rpc(second, 'thread/resume', { threadId: forked.result.thread.id });
  assert.ok(resumedFork.result && !resumedFork.result.webReadOnlyReason, JSON.stringify(resumedFork));
  console.log(JSON.stringify({ passed: true, isolatedHome: true, modelRequests: 0,
    scenarios: ['RPC rejection stays HTTP 200 JSON', 'desktop writer conflict stays readable', 'explicit fork acquires independent writer'] }));
})().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => {
  for (const child of children) {
    if (process.platform === 'win32' && child.pid) spawnSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' });
    else child.kill();
  }
});
