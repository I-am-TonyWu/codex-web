import { readFile, readdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, it } from 'vitest'
import { withTemporaryCodexAppServer } from './accountRoutes'

// Optional live, read-only verification. No model calls or credential changes.
const liveHome = process.env.ACCOUNT_LIVE_CODEX_HOME
it.skipIf(!liveHome || process.platform !== 'win32')('closes the installed Windows Codex SQLite handles before cleanup', async () => {
  const before = new Set((await readdir(tmpdir())).filter(name => name.startsWith('codexui-account-')))
  const auth = await readFile(join(liveHome!, 'auth.json'), 'utf8')
  const result: any = await withTemporaryCodexAppServer(auth, rpc => rpc('account/read', { refreshToken: false }))
  expect(result.account?.type).toBe('chatgpt')
  const created = (await readdir(tmpdir())).filter(name => name.startsWith('codexui-account-') && !before.has(name))
  expect(created).toEqual([])
}, 35_000)
