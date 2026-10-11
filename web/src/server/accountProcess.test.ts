import { EventEmitter } from 'node:events'
import type { ChildProcess } from 'node:child_process'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanupAccountHome, trackAccountProcess } from './accountProcess'

afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks() })
describe('Windows account process cleanup', () => {
  it('waits for close rather than exit before removing SQLite files', async () => {
    const proc = new EventEmitter() as ChildProcess
    proc.kill = vi.fn(() => { proc.emit('exit', 0); setTimeout(() => proc.emit('close', 0), 30); return true })
    const tracked = trackAccountProcess(proc)
    const stopped = tracked.stop(); let done = false; void stopped.then(() => { done = true })
    await new Promise(r => setTimeout(r, 10)); expect(done).toBe(false)
    expect(await stopped).toBe(true)
  })
  it('forces an unresponsive temporary child and reports whether it closed', async () => {
    vi.useFakeTimers()
    const proc = new EventEmitter() as ChildProcess
    proc.kill = vi.fn(signal => { if (signal === 'SIGKILL') proc.emit('close'); return true })
    const stopped = trackAccountProcess(proc).stop()
    await vi.advanceTimersByTimeAsync(3000)
    expect(await stopped).toBe(true)
    expect(proc.kill).toHaveBeenLastCalledWith('SIGKILL')
  })
  it('preserves the directory if the child did not close', async () => {
    const home = await mkdtemp(join(tmpdir(), 'codexui-account-'))
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    try {
      await writeFile(join(home, 'logs_2.sqlite'), 'still in use')
      await cleanupAccountHome(home, false)
      expect(await readFile(join(home, 'logs_2.sqlite'), 'utf8')).toBe('still in use')
      expect(warn).toHaveBeenCalled()
      await cleanupAccountHome(home, true)
      await expect(readFile(join(home, 'logs_2.sqlite'))).rejects.toMatchObject({ code: 'ENOENT' })
    } finally { await rm(home, { recursive: true, force: true }) }
  })
  it('rejects cleanup outside the narrowly defined temporary account directories', async () => {
    await expect(cleanupAccountHome(join(tmpdir(), 'unrelated'), true)).rejects.toThrow('Invalid temporary')
    await expect(cleanupAccountHome(tmpdir(), true)).rejects.toThrow('Invalid temporary')
  })
})
