import { createRequire } from 'node:module'
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, it } from 'vitest'
const { checkPackage } = createRequire(import.meta.url)('../../../tray/package-check.cjs') as { checkPackage: (root: string, platform: string, arch: string, version: string) => string }
it('rejects a wrong platform, missing build and mismatched version before packaging writes', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'codex-package-')), root = join(dir, 'web')
  try {
    expect(() => checkPackage(root, 'linux', 'x64', '24.0.0')).toThrow('Windows')
    expect(() => checkPackage(root, 'win32', 'arm64', '24.0.0')).toThrow('x64')
    expect(() => checkPackage(root, 'win32', 'x64', '18.0.0')).toThrow('24')
    expect(() => checkPackage(root, 'win32', 'x64', '24.0.0')).toThrow('Missing')
    for (const path of ['dist/assets', 'dist/third-party', 'dist-cli', '../tray']) await mkdir(join(root, path), { recursive: true })
    for (const path of ['dist-cli/index.js', 'package.json', 'LICENSE']) await writeFile(join(root, path), '{}')
    await writeFile(join(root, '../tray/TrayApp.cs'), 'internal const string Version = "1.4.9";')
    await writeFile(join(root, 'dist/index.html'), '<script src="/assets/test.js"></script>')
    await writeFile(join(root, 'dist/assets/test.js'), '"1.4.8"')
    expect(() => checkPackage(root, 'win32', 'x64', '24.0.0')).toThrow('version')
    await writeFile(join(root, 'dist/assets/test.js'), '"1.4.9"')
    expect(checkPackage(root, 'win32', 'x64', '24.0.0')).toBe('1.4.9')
  } finally { await rm(dir, { recursive: true, force: true }) }
})
