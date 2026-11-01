const { spawnSync } = require('node:child_process');
const path = require('node:path');
for (const args of [
  ['node_modules/typescript/bin/tsc', '--noEmit', '-p', 'tsconfig.server.json'],
  ['node_modules/vue-tsc/bin/vue-tsc.js', '--noEmit'],
  ['node_modules/vitest/vitest.mjs', 'run'],
]) {
  const result = spawnSync(process.execPath, args, { cwd: path.resolve(__dirname, '..'), stdio: 'inherit', windowsHide: true });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}
