import { expect, it } from 'vitest'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { rememberForkedThread, forgetForkedThread, includeForkedThreads } from './forkedThreads'

it('keeps a readable fork visible across reloads without duplicating native results or reviving archived threads', async () => {
  const home = await mkdtemp(join(tmpdir(), 'codex-forks-'))
  try {
    const calls: string[] = []
    const client = { rpc: async (_: string, params: unknown) => {
      const { threadId } = params as { threadId: string }; calls.push(threadId)
      return { thread: { id: threadId, name: 'Fork', turns: [] } }
    } }
    await rememberForkedThread(home, 'fork')
    expect(await includeForkedThreads(home, client, { data: [{ id: 'original' }], nextCursor: null })).toMatchObject({ data: [{ id: 'fork' }, { id: 'original' }] })
    expect(await includeForkedThreads(home, client, { data: [{ id: 'fork' }] })).toEqual({ data: [{ id: 'fork' }] })
    expect(calls).toEqual(['fork'])
    await forgetForkedThread(home, 'fork')
    expect(await includeForkedThreads(home, client, { data: [] })).toEqual({ data: [] })
  } finally { await rm(home, { recursive: true, force: true }) }
})
