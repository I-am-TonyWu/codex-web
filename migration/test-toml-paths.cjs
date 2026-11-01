const assert = require('node:assert/strict');
const { remapTomlPaths } = require('./scripts/toml-paths.cjs');
const old = 'C:\\Users\\old', next = 'D:\\Profiles\\new';
const input = [
  '[projects."C:\\\\Users\\\\old\\\\work"]',
  'cwd = "C:/Users/old/project"',
  "path = 'C:\\Users\\old\\data' # Keep 'C:\\Users\\old'",
  'cwd = "C:/Users/old-other/project"',
  'prompt = "Explain C:/Users/old/project"',
  'prompt = "C:/Users/old/project"',
  'args = ["C:/Users/old/project", "--name=C:/Users/old/project"]',
  'cwds = [', ' "C:/Users/old/nested",', ']',
  '# cwd = "C:/Users/old/project"',
].join('\r\n');
const mapped = remapTomlPaths(input, [[old, next]]);
assert.match(mapped, /D:\\\\Profiles\\\\new\\\\work/);
assert.ok(mapped.includes('cwd = "D:/Profiles/new/project"'));
assert.ok(mapped.includes("path = 'D:\\Profiles\\new\\data' # Keep 'C:\\Users\\old'"));
for (const line of input.split('\r\n').filter(line => line.startsWith('prompt') || line.startsWith('#') || line.includes('old-other'))) assert.ok(mapped.includes(line));
assert.ok(mapped.includes('"--name=C:/Users/old/project"'));
assert.ok(mapped.includes('"D:/Profiles/new/nested"'));
assert.equal(mapped.split('\r\n').length, input.split('\r\n').length);
console.log('TOML path boundary checks passed');
const prose = 'prompt = """\n[projects."C:/Users/old/project"]\ncwd = "C:/Users/old/project"\n"""\n';
assert.equal(remapTomlPaths(prose, [[old, next]]), prose);
assert.equal(remapTomlPaths("# prompt = '''\ncwd = 'C:/Users/old/project'\n", [[old, next]]), "# prompt = '''\ncwd = 'D:/Profiles/new/project'\n");
