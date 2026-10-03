const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const dest = path.join(root, 'dist', 'third-party');
fs.mkdirSync(dest, { recursive: true });
const seen = new Set(), entries = [];
function collect(name, parent) {
  let search = parent, source;
  while (true) {
    const candidate = path.join(search, 'node_modules', name);
    if (fs.existsSync(path.join(candidate, 'package.json'))) { source = candidate; break; }
    const next = path.dirname(search);
    if (next === search) throw new Error('Missing Mermaid dependency license: ' + name);
    search = next;
  }
  if (seen.has(source)) return;
  seen.add(source);
  const pkg = JSON.parse(fs.readFileSync(path.join(source, 'package.json'), 'utf8'));
  const folder = path.join(dest, name.replaceAll('/', '__') + '-' + pkg.version);
  fs.mkdirSync(folder, { recursive: true });
  const licenses = fs.readdirSync(source).filter(file => /^(license|licence|copying|notice)(\.|-|$)/i.test(file) && fs.statSync(path.join(source, file)).isFile());
  for (const file of licenses) fs.copyFileSync(path.join(source, file), path.join(folder, file));
  entries.push({ name: pkg.name, version: pkg.version, license: pkg.license, repository: pkg.repository, files: licenses });
  for (const child of Object.keys(pkg.dependencies || {})) collect(child, source);
}
collect('mermaid', root);
fs.writeFileSync(path.join(dest, 'mermaid-dependencies.json'), JSON.stringify(entries, null, 2) + '\n');
console.log('Frontend license notices collected for ' + entries.length + ' Mermaid packages.');
