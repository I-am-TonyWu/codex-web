import { afterEach, beforeEach, expect, it } from 'vitest'
import { chmod, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { updateJsonState, replaceFileSnapshot } from './jsonState'
let dir: string, file: string
beforeEach(async () => { dir = await mkdtemp(join(tmpdir(), 'codex-json-')); file = join(dir, 'state.json') })
afterEach(async () => { await rm(dir, { recursive: true, force: true }) })
it('serializes the complete read-modify-write and preserves all concurrent fields', async () => {
  await writeFile(file, '{"desktop":"keep"}')
  await Promise.all(Array.from({ length: 30 }, (_, i) => updateJsonState(file, async state => { await Promise.resolve(); state['field' + i] = i })))
  const state = JSON.parse(await readFile(file, 'utf8'))
  expect(Object.keys(state)).toHaveLength(31); expect(state.desktop).toBe('keep')
  expect(await readdir(dir)).toEqual(['state.json'])
})
it.each(['{broken', '[]', 'null'])('preserves invalid state %s instead of rebuilding it', async raw => {
  await writeFile(file, raw)
  await expect(updateJsonState(file, state => { state.pin = true })).rejects.toThrow()
  expect(await readFile(file, 'utf8')).toBe(raw)
})
it('does not bypass a read-only file by renaming a writable replacement over it', async () => {
  await writeFile(file, '{"keep":true}')
  await chmod(file, 0o444)
  try {
    await expect(updateJsonState(file, state => { state.lost = true })).rejects.toThrow('read-only')
    expect(await readFile(file, 'utf8')).toBe('{"keep":true}')
  } finally { await chmod(file, 0o600) }
})
it('rejects an observed external update and removes the temporary replacement', async () => {
  await writeFile(file, 'new desktop value')
  await expect(replaceFileSnapshot(file, 'old snapshot', 'web update')).rejects.toThrow('changed')
  expect(await readFile(file, 'utf8')).toBe('new desktop value')
  expect(await readdir(dir)).toEqual(['state.json'])
})
