import { afterEach, expect, it, vi } from 'vitest'
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
vi.mock('node:child_process', () => ({ spawnSync: vi.fn(command => ({ status: String(command).endsWith('current/codex.exe') || String(command).endsWith('current\\codex.exe') ? 0 : 1 })) }))
import { resolveCodexCommand } from './commandResolution'
const dirs: string[] = []
afterEach(() => { vi.unstubAllEnvs(); for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true }) })
it.skipIf(process.platform !== 'win32')('finds the updated desktop CLI when the tray still points at a deleted version', () => {
  const root = mkdtempSync(join(tmpdir(), 'codex-cli-discovery-')); dirs.push(root)
  const bin = join(root, 'OpenAI', 'Codex', 'bin', 'current')
  mkdirSync(bin, { recursive: true }); writeFileSync(join(bin, 'codex.exe'), '')
  vi.stubEnv('LOCALAPPDATA', root); vi.stubEnv('CODEXUI_CODEX_COMMAND', join(root, 'deleted', 'codex.exe'))
  expect(resolveCodexCommand()).toBe(join(bin, 'codex.exe'))
})
