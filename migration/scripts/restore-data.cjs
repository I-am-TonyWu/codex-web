'use strict';
// Restore into an empty target. Only copied metadata is changed; source backups remain intact.
const fs = require('node:fs');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');
const bundle = path.resolve(__dirname, '..');
const manifest = JSON.parse(fs.readFileSync(path.join(bundle, 'manifest.json'), 'utf8').replace(/^\uFEFF/, ''));
const target = process.argv[2];
if (!target || !path.isAbsolute(target)) throw Error('An absolute target profile is required.');
const profile = path.resolve(target);
const local = process.argv[3] ? path.resolve(process.argv[3]) : path.join(profile, 'AppData', 'Local');
const documents = process.argv[4] ? path.resolve(process.argv[4]) : path.join(profile, 'Documents', 'Codex');
const destinations = [path.join(profile, '.codex'), documents, path.join(local, 'CodexWebTray', 'workspace')];
const mappings = [
  [manifest.oldDocumentsCodex, documents],
  [manifest.oldTrayWorkspace, destinations[2]],
  [manifest.oldCodexHome, destinations[0]],
  [manifest.oldLocalAppData, local],
  [manifest.oldDocumentsRoot || path.dirname(manifest.oldDocumentsCodex), path.dirname(documents)],
  [manifest.oldProfile, profile],
];
function remap(value) {
  if (typeof value !== 'string') return value;
  const extended = value.startsWith('\\\\?\\');
  const clean = (extended ? value.slice(4) : value).replaceAll('/', '\\');
  for (const [oldRoot, newRoot] of mappings) {
    const old = oldRoot.replaceAll('/', '\\').replace(/\\$/, '');
    if (clean.toLowerCase() === old.toLowerCase() || clean.toLowerCase().startsWith(old.toLowerCase() + '\\')) {
      return (extended ? '\\\\?\\' : '') + newRoot + clean.slice(old.length);
    }
  }
  return value;
}
function remapObject(value) {
  if (Array.isArray(value)) return value.map(remapObject);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([k,v]) => [remap(k), remapObject(v)]));
  return remap(value);
}
function remapState(state) {
  // Restrict rewriting to known path metadata; prompt-history and message text stay byte-for-byte in value.
  const pathFields = [
    'thread-projectless-output-directories', 'thread-workspace-root-hints', 'thread-writable-roots',
    'electron-saved-workspace-roots', 'electron-workspace-root-labels', 'active-workspace-roots',
    'project-order', 'sidebar-project-thread-orders', 'selected-project',
  ];
  for (const field of pathFields) if (field in state) state[field] = remapObject(state[field]);
  const remapProject = project => {
    const copy = {...project};
    for (const key of ['root','path','cwd','workspaceRoot']) if (key in copy) copy[key] = remap(copy[key]);
    if (Array.isArray(copy.rootPaths)) copy.rootPaths = copy.rootPaths.map(remap);
    return copy;
  };
  if (Array.isArray(state['local-projects'])) state['local-projects'] = state['local-projects'].map(remapProject);
  else if (state['local-projects'] && typeof state['local-projects'] === 'object') state['local-projects'] = Object.fromEntries(Object.entries(state['local-projects']).map(([id, project]) => [id, remapProject(project)]));
  // Host IDs embed CODEX_HOME, while project/task UUIDs must remain unchanged.
  if (state['thread-project-membership-host-ids']) state['thread-project-membership-host-ids'] = Object.fromEntries(Object.entries(state['thread-project-membership-host-ids']).map(([id, host]) => [id, typeof host === 'string' && host.startsWith('local:') ? 'local:' + remap(host.slice(6)) : host]));
  if (state['app-server-project-migration-state-by-host']) state['app-server-project-migration-state-by-host'] = Object.fromEntries(Object.entries(state['app-server-project-migration-state-by-host']).map(([host, value]) => [host.startsWith('local:') ? 'local:' + remap(host.slice(6)) : host, value]));
  if (state['app-server-projects-migration-by-host']) state['app-server-projects-migration-by-host'] = Object.fromEntries(Object.entries(state['app-server-projects-migration-by-host']).map(([host, value]) => [host.startsWith('local:') ? 'local:' + remap(host.slice(6)) : host, value]));
  // Queued follow-ups must not replay on a second host.
  if ('queued-follow-ups' in state) state['queued-follow-ups'] = Array.isArray(state['queued-follow-ups']) ? [] : {};
  return state;
}
function* walk(root) {
  for (const item of fs.readdirSync(root, { withFileTypes: true })) {
    const p = path.join(root, item.name);
    if (item.isSymbolicLink()) throw Error('Symlinks are not allowed in the migration backup.');
    if (item.isDirectory()) yield* walk(p); else if (item.isFile()) yield p;
  }
}
for (const p of destinations) if (fs.existsSync(p) && fs.readdirSync(p).length) throw Error('Target must be empty: ' + p);
const pairs = [['codex', destinations[0]], ['Documents-Codex', destinations[1]], ['tray-workspace', destinations[2]]];
for (const extra of manifest.extraRoots || []) {
  const destination = remap(extra.source);
  if (destination === extra.source) throw Error('External project path requires manual restore: ' + extra.source);
  if (fs.existsSync(destination) && fs.readdirSync(destination).length) throw Error('Extra target must be empty: ' + destination);
  pairs.push([extra.backup, destination]);
}
for (const [sub, dest] of pairs) {
  const source = path.join(bundle, 'backup', sub);
  if (!fs.existsSync(source)) throw Error('Missing backup: ' + sub);
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.cpSync(source, dest, { recursive: true, errorOnExist: true, force: false });
}
const result = { databases: 0, databaseValuesRemapped: 0, sessionMetadataRemapped: 0, jsonFilesRemapped: 0, automationsPaused: 0 };
const codex = destinations[0];
for (const p of walk(codex)) {
  const rel = path.relative(codex, p).replaceAll('\\', '/');
  if (rel.startsWith('plugins/') || rel.startsWith('skills/') || rel.startsWith('vendor_imports/')) continue;
  if (p.endsWith('.jsonl') && /^(sessions|archived_sessions)\//.test(rel)) {
    const raw = fs.readFileSync(p, 'utf8');
    let changed = false;
    const lines = raw.split('\n').map(line => {
      if (!line.includes('session_meta')) return line;
      try {
        const entry = JSON.parse(line);
        if (entry.type !== 'session_meta' || !entry.payload) return line;
        for (const key of ['cwd', 'rollout_path']) {
          const old = entry.payload[key]; const updated = remap(old);
          if (old !== updated) { entry.payload[key] = updated; changed = true; }
        }
        return changed ? JSON.stringify(entry) : line;
      } catch { return line; }
    });
    if (changed) { fs.writeFileSync(p, lines.join('\n')); result.sessionMetadataRemapped++; }
  } else if (rel === '.codex-global-state.json') {
    try {
      const raw = fs.readFileSync(p, 'utf8').replace(/^\uFEFF/, '');
      const value = JSON.parse(raw); const before = JSON.stringify(value); const mapped = remapState(value);
      if (before !== JSON.stringify(mapped)) { fs.writeFileSync(p, JSON.stringify(mapped, null, 2)); result.jsonFilesRemapped++; }
    } catch (error) { throw Error('Cannot migrate desktop project metadata: ' + error.message); }
  } else if (p.endsWith('.sqlite') || p.endsWith('.db')) {
    const db = new DatabaseSync(p);
    try {
      if (db.prepare('PRAGMA integrity_check').get().integrity_check !== 'ok') throw Error('Invalid backup database: ' + rel);
      db.exec('BEGIN IMMEDIATE');
      const quote = s => '"' + s.replaceAll('"', '""') + '"';
      for (const {name} of db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").all()) {
        const cols = db.prepare('PRAGMA table_info(' + quote(name) + ')').all();
        const candidates = cols.filter(c => /^(cwd|source_cwd|rollout_path|workspace_path|project_path|root_path|repo_path|directory|local_environment_config_path)$/.test(c.name));
        for (const col of candidates) {
          const oldValues = db.prepare('SELECT DISTINCT ' + quote(col.name) + ' AS value FROM ' + quote(name)).all();
          const update = db.prepare('UPDATE ' + quote(name) + ' SET ' + quote(col.name) + '=? WHERE ' + quote(col.name) + '=?');
          for (const {value} of oldValues) {
            const mapped = remap(value);
            if (mapped !== value) result.databaseValuesRemapped += update.run(mapped, value).changes;
          }
        }
        if (cols.some(c => c.name === 'cwds')) {
          for (const {value} of db.prepare('SELECT DISTINCT cwds AS value FROM ' + quote(name)).all()) {
            if (typeof value !== 'string') continue;
            try { const mapped = JSON.stringify(remapObject(JSON.parse(value))); if (mapped !== value) db.prepare('UPDATE ' + quote(name) + ' SET cwds=? WHERE cwds=?').run(mapped,value); } catch {}
          }
        }
        if (name === 'automations' && cols.some(c => c.name === 'status')) result.automationsPaused += db.prepare("UPDATE automations SET status='PAUSED' WHERE status='ACTIVE'").run().changes;
      }
      db.exec('COMMIT');
      if (db.prepare('PRAGMA integrity_check').get().integrity_check !== 'ok') throw Error('Restore database check failed: ' + rel);
      result.databases++;
    } finally { db.close(); }
  }
}
// Config paths may appear in TOML table keys or quoted command/cwd values.
const config = path.join(codex, 'config.toml');
if (fs.existsSync(config)) {
  let raw = fs.readFileSync(config, 'utf8');
  for (const [oldRoot, newRoot] of mappings) {
    for (const slash of ['\\', '/', '\\\\']) {
      const old = oldRoot.replaceAll('\\', slash); const next = newRoot.replaceAll('\\', slash);
      raw = raw.split(old).join(next);
    }
  }
  fs.writeFileSync(config, raw);
}
const autoRoot = path.join(codex, 'automations');
if (fs.existsSync(autoRoot)) for (const p of walk(autoRoot)) if (p.endsWith('.toml')) {
  let raw = fs.readFileSync(p, 'utf8').replace(/^status\s*=\s*"ACTIVE"/gm, 'status = "PAUSED"');
  for (const [oldRoot, newRoot] of mappings) for (const slash of ['\\\\', '/', '\\']) raw = raw.split(oldRoot.replaceAll('\\', slash)).join(newRoot.replaceAll('\\', slash));
  fs.writeFileSync(p,raw);
}
const site = path.join(bundle, 'private', 'cloudflare-site.json');
const trayRoot = path.join(local, 'CodexWebTray');
fs.mkdirSync(trayRoot, { recursive: true });
fs.copyFileSync(site, path.join(trayRoot, 'cloudflare-site.json'));
fs.writeFileSync(path.join(profile, 'CodexWeb-restore-report.json'), JSON.stringify(result,null,2));
console.log(JSON.stringify(result));
