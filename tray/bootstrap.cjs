// Wait until the launcher has assigned this process to its Windows job.
// All later children belong to the job, so exit never targets desktop Codex.
const path = require('node:path');
const {pathToFileURL} = require('node:url');
const gateTimeout = setTimeout(() => process.exit(2), 15000);
let startupInput = '';
process.stdin.setEncoding('utf8');
const receive = async data => {
  startupInput += data;
  if (startupInput.length > 16384) process.exit(1);
  if (!startupInput.includes('\n')) return;
  process.stdin.removeListener('data', receive);
  const line = startupInput.trim(); startupInput = '';
  if (line !== 'GO') {
    let settings;
    try { settings = JSON.parse(line); } catch { process.exit(1); }
    if (typeof settings.password !== 'string' || !settings.password.length) process.exit(1);
    // Kept inside this process, never in OS command-line arguments or environment.
    process.argv.push('--password', settings.password);
    settings.password = '';
  }
  clearTimeout(gateTimeout);
  process.stdin.pause();
  process.argv[1] = path.join(process.env.CODEX_TRAY_APP_ROOT || path.join(__dirname, 'app'), 'dist-cli', 'index.js');
  try { await import(pathToFileURL(process.argv[1]).href); }
  catch (error) { console.error(error); process.exit(1); }
};
process.stdin.on('data', receive);
