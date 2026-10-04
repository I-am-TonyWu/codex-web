'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..', '..');
const home = fs.mkdtempSync(path.join(root, 'web/output/playwright/thread-project-http-'));
const globalPath = path.join(home, '.codex-global-state.json');
const base = 'http://127.0.0.1:4193';
const before = { 'local-projects': { alpha: { id: 'alpha', name: 'Alpha', rootPaths: [home] } },
  'thread-project-assignments': {}, 'projectless-thread-ids': ['fixture-thread'],
  'thread-workspace-root-hints': { 'fixture-thread': 'C:\\Unchanged\\History' }, other: { preserved: true } };
fs.writeFileSync(globalPath, JSON.stringify(before));
const payload = path.join(root, 'tray/payload');
let output = '';
const child = spawn(path.join(payload, 'node.exe'), [path.join(payload, 'app/dist-cli/index.js'), '--host', '127.0.0.1', '--port', '4193', '--no-password', '--no-open', '--no-tunnel', '--no-login'], {
  env: { ...process.env, CODEX_HOME: home }, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'],
});
child.stdout.on('data', data => { output += data; });
child.stderr.on('data', data => { output += data; });
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
(async () => {
  let ready = false;
  for (let i = 0; i < 60; i++) {
    if (child.exitCode !== null) throw Error('Packaged CLI exited: ' + output.slice(-1000));
    try { ready = (await fetch(base + '/codex-api/workspace-roots-state')).ok; } catch {}
    if (ready) break;
    await delay(250);
  }
  assert.ok(ready, 'isolated packaged service readiness');
  const post = async body => fetch(base + '/codex-api/thread-project', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  assert.equal((await post({ threadId: 'fixture-thread', projectId: 'alpha' })).status, 200);
  let state = JSON.parse(fs.readFileSync(globalPath));
  assert.equal(state['thread-project-assignments']['fixture-thread'].projectId, 'alpha');
  assert.deepEqual(state['projectless-thread-ids'], []);
  assert.deepEqual(state.other, before.other);
  assert.deepEqual(state['thread-workspace-root-hints'], before['thread-workspace-root-hints']);
  const saved = fs.readFileSync(globalPath, 'utf8');
  assert.equal((await post({ threadId: 'fixture-thread', projectId: 'deleted' })).status, 409);
  assert.equal(fs.readFileSync(globalPath, 'utf8'), saved);
  assert.equal((await post({ threadId: 'fixture-thread' })).status, 400);
  assert.equal((await post({ threadId: 'fixture-thread', projectId: null })).status, 200);
  state = (await (await fetch(base + '/codex-api/workspace-roots-state')).json()).data;
  assert.deepEqual(state.projectlessThreadIds, ['fixture-thread']);
  assert.equal(state.threadProjectAssignments['fixture-thread'], undefined);
  console.log(JSON.stringify({ passed: true, packagedCli: true, isolatedHome: true, port: 4193, modelRequests: 0, scenarios: ['assign', 'move back', 'preserve cwd/unrelated metadata', 'invalid body', 'deleted project does not write'] }));
})().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => child.kill());
