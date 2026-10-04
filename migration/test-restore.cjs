'use strict';
const fs = require('node:fs'), path = require('node:path'), os = require('node:os');
const { spawnSync } = require('node:child_process');
const assert = require('node:assert/strict');
const { DatabaseSync } = require('node:sqlite');
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-web-restore-test-'));
const bundle = path.join(temp, 'bundle'), old = path.join(temp, 'old-profile'), target = path.join(temp, 'new-profile');
const oldDocs = path.join(old, 'Documents'), newDocs = path.join(target, 'RedirectedDocuments');
const oldHome = path.join(old, '.codex'), newHome = path.join(target, '.codex');
const oldProject = path.join(oldDocs, 'ChatGPT', 'Project');
const newProject = path.join(newDocs, 'ChatGPT', 'Project');
const manifest = { oldProfile: old, oldDocumentsCodex: path.join(oldDocs, 'Codex'), oldDocumentsRoot: oldDocs,
  oldCodexHome: oldHome, oldTrayWorkspace: path.join(old, 'AppData/Local/CodexWebTray/workspace'), oldLocalAppData: path.join(old, 'AppData/Local'),
  extraRoots: [{ source: oldProject, backup: 'extra-projects/0' }] };
function json(file, value) { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, JSON.stringify(value)); }
json(path.join(bundle, 'manifest.json'), manifest);
for (const directory of ['codex/sessions', 'Documents-Codex', 'tray-workspace', 'extra-projects/0', 'scripts']) fs.mkdirSync(path.join(bundle, 'backup', directory), { recursive: true });
fs.mkdirSync(path.join(bundle, 'scripts'), { recursive: true });
fs.copyFileSync(path.join(__dirname, 'scripts/restore-data.cjs'), path.join(bundle, 'scripts/restore-data.cjs'));
const original = { 'local-projects': { projectId: { id: 'projectId', name: 'Project', rootPaths: [oldProject] } },
  'thread-project-assignments': { task: { projectKind: 'local', projectId: 'projectId' } },
  'thread-workspace-root-hints': { task: oldProject }, 'sidebar-project-thread-orders': { projectId: { threadIds: ['task'] } },
  'prompt-history': ['Keep this text ' + oldProject], 'thread-project-membership-host-ids': { task: 'local:' + oldHome },
  'app-server-projects-migration-by-host': { ['local:' + oldHome]: { projectsMigrated: true } } };
json(path.join(bundle, 'backup/codex/.codex-global-state.json'), original);
json(path.join(bundle, 'private/cloudflare-site.json'), { AccountId: 'fixture', ApplicationId: 'fixture', PolicyId: 'fixture', Hostname: 'example.invalid' });
const session = [{ type: 'session_meta', payload: { cwd: oldProject } }, { type: 'message', payload: { text: 'Keep ' + oldProject } }];
fs.writeFileSync(path.join(bundle, 'backup/codex/sessions/task.jsonl'), session.map(row => JSON.stringify(row)).join('\n'));
fs.writeFileSync(path.join(bundle, 'backup/extra-projects/0/project.txt'), 'project contents');
const db = new DatabaseSync(path.join(bundle, 'backup/codex/state.sqlite'));
db.exec('CREATE TABLE threads (id TEXT, cwd TEXT, message TEXT)');
db.prepare('INSERT INTO threads VALUES (?, ?, ?)').run('task', oldProject, 'Keep ' + oldProject); db.close();
const run = () => spawnSync(process.execPath, ['--disable-warning=ExperimentalWarning', path.join(bundle, 'scripts/restore-data.cjs'), target, path.join(target, 'AppData/Local'), path.join(newDocs, 'Codex')], { encoding: 'utf8', windowsHide: true });
const result = run();
assert.equal(result.status, 0, result.stderr);
const updated = JSON.parse(fs.readFileSync(path.join(newHome, '.codex-global-state.json')));
assert.deepEqual(updated['local-projects'].projectId.rootPaths, [newProject]);
assert.deepEqual(updated['thread-project-assignments'], original['thread-project-assignments']);
assert.deepEqual(updated['prompt-history'], original['prompt-history']);
assert.ok(updated['app-server-projects-migration-by-host']['local:' + newHome]);
assert.equal(updated['thread-project-membership-host-ids'].task, 'local:' + newHome);
assert.equal(fs.readFileSync(path.join(newProject, 'project.txt'), 'utf8'), 'project contents');
const restoredSession = fs.readFileSync(path.join(newHome, 'sessions/task.jsonl'), 'utf8').split('\n').map(JSON.parse);
assert.equal(restoredSession[0].payload.cwd, newProject); assert.deepEqual(restoredSession[1], session[1]);
const restoredDb = new DatabaseSync(path.join(newHome, 'state.sqlite'));
assert.deepEqual({ ...restoredDb.prepare('SELECT * FROM threads').get() }, { id: 'task', cwd: newProject, message: 'Keep ' + oldProject }); restoredDb.close();
assert.deepEqual(JSON.parse(fs.readFileSync(path.join(bundle, 'backup/codex/.codex-global-state.json'))), original);
assert.notEqual(run().status, 0, 'Never overwrite a non-empty target');
console.log(JSON.stringify({ passed: true, scenarios: ['modern rootPaths', 'redirected Documents', 'extra project files', 'stable memberships and IDs', 'host keys', 'SQLite integrity/path', 'session cwd', 'unchanged message text', 'untouched backup', 'non-empty target rejected'] }));
// Retain the tiny fixture for inspection; no real profile or data is involved.
