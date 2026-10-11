import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { refreshChatgptAuthTokensForExternalAuth } from './codexAppServerBridge'

const originalHome = process.env.CODEX_HOME
const homes: string[] = []
function jwt(claims: unknown) { return `e30.${Buffer.from(JSON.stringify(claims)).toString('base64url')}.fixture` }
async function fixture(tokens: Record<string, string>) {
  const home = await mkdtemp(join(tmpdir(), 'codex-web-auth-readonly-'))
  homes.push(home); process.env.CODEX_HOME = home
  const raw = JSON.stringify({ auth_mode: 'chatgpt', tokens })
  await writeFile(join(home, 'auth.json'), raw)
  return { path: join(home, 'auth.json'), raw }
}
afterEach(async () => {
  if (originalHome === undefined) delete process.env.CODEX_HOME
  else process.env.CODEX_HOME = originalHome
  vi.unstubAllGlobals()
  await Promise.all(homes.splice(0).map(home => rm(home, {recursive:true, force:true})))
})
describe('host-owned login credentials', () => {
  it('reuses only the current access token, without OAuth or credential writes', async () => {
    const accessToken = jwt({ exp: Date.now()/1000+3600, 'https://api.openai.com/auth': {chatgpt_account_id:'host', chatgpt_plan_type:'plus'} })
    const file = await fixture({access_token:accessToken, refresh_token:'never-use', account_id:'host'})
    const fetchMock = vi.fn(); vi.stubGlobal('fetch', fetchMock)
    expect(await refreshChatgptAuthTokensForExternalAuth({previousAccountId:'host'})).toEqual({accessToken, chatgptAccountId:'host', chatgptPlanType:'plus'})
    expect(fetchMock).not.toHaveBeenCalled()
    expect(await readFile(file.path, 'utf8')).toBe(file.raw)
  })
  it('does not require or rotate a refresh token', async () => {
    const file = await fixture({access_token:jwt({exp:Date.now()/1000+3600}), account_id:'host'})
    expect((await refreshChatgptAuthTokensForExternalAuth()).chatgptAccountId).toBe('host')
    expect(await readFile(file.path, 'utf8')).toBe(file.raw)
  })
  it('asks for desktop sign-in on expiry without touching the host credentials', async () => {
    const file = await fixture({access_token:jwt({exp:1}), refresh_token:'never-use', account_id:'host'})
    const fetchMock = vi.fn(); vi.stubGlobal('fetch', fetchMock)
    await expect(refreshChatgptAuthTokensForExternalAuth()).rejects.toThrow('Windows Codex')
    expect(fetchMock).not.toHaveBeenCalled()
    expect(await readFile(file.path, 'utf8')).toBe(file.raw)
  })
  it('rejects refresh into a different desktop account', async () => {
    const file = await fixture({access_token:jwt({exp:Date.now()/1000+3600}), account_id:'new-host'})
    await expect(refreshChatgptAuthTokensForExternalAuth({previousAccountId:'old-host'})).rejects.toThrow('主机 Codex 已切换账户')
    expect(await readFile(file.path, 'utf8')).toBe(file.raw)
  })
  it('reads a new access token when the desktop has renewed it', async () => {
    const file = await fixture({access_token:jwt({exp:1}), account_id:'host'})
    await expect(refreshChatgptAuthTokensForExternalAuth()).rejects.toThrow()
    const renewed = jwt({exp:Date.now()/1000+3600})
    const newRaw = JSON.stringify({tokens:{access_token:renewed, account_id:'host'}})
    await writeFile(file.path, newRaw)
    expect((await refreshChatgptAuthTokensForExternalAuth()).accessToken).toBe(renewed)
    expect(await readFile(file.path,'utf8')).toBe(newRaw)
  })
})
