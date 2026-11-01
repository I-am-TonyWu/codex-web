const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

function checkPackage(root, platform = process.platform, arch = process.arch, nodeVersion = process.versions.node) {
  if (platform !== 'win32' || arch !== 'x64' || Number(nodeVersion.split('.')[0]) < 24) throw new Error('Packaging requires Windows x64 Node.js >=24.');
  for (const name of ['dist/index.html', 'dist-cli/index.js', 'package.json', 'LICENSE', 'dist/third-party']) {
    if (!fs.existsSync(path.join(root, name))) throw new Error('Missing build artifact: ' + name);
  }
  const version = fs.readFileSync(path.join(root, '../tray/TrayApp.cs'), 'utf8').match(/internal const string Version = "([^"]+)";/)?.[1];
  const html = fs.readFileSync(path.join(root, 'dist/index.html'), 'utf8');
  const asset = html.match(/src="(\/assets\/[^"?]+\.js)"/)?.[1];
  if (!version || !asset || !fs.readFileSync(path.join(root, 'dist' + asset), 'utf8').includes('"' + version + '"')) throw new Error('Frontend version does not match Program.Version. Rebuild before packaging.');
  return version;
}

function checkPty(root) {
  const code = `const p = require('node-pty').spawn(process.execPath, ['-e', 'process.exit(0)'], { cols: 80, rows: 24 }); const t = setTimeout(() => { p.kill(); process.exit(1); }, 5000); p.onExit(e => { clearTimeout(t); process.exit(e.exitCode); });`;
  const result = spawnSync(process.execPath, ['-e', code], { cwd: root, encoding: 'utf8', windowsHide: true, timeout: 10_000 });
  if (result.error || result.status !== 0) throw new Error('Windows native PTY check failed: ' + (result.error?.message || result.stderr));
}

module.exports = { checkPackage, checkPty };
