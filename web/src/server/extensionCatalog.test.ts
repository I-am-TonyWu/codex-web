import { afterEach, describe, expect, it, vi } from 'vitest'
import { ExtensionCatalog } from './extensionCatalog'

afterEach(() => vi.useRealTimers())
describe('desktop extension synchronization', () => {
  it('serves local skills while remote sync is pending, coalesces reads, and reloads after sync', async () => {
    let finish!: () => void
    let installed = ['system']
    const rpc = vi.fn(async (method: string) => {
      if (method === 'plugin/list') await new Promise<void>(resolve => { finish = resolve })
      return method === 'skills/list' ? installed : { marketplaces: [] }
    })
    const catalog = new ExtensionCatalog({ rpc })
    const [first, same] = await Promise.all([catalog.read('C:/project'), catalog.read('C:/project')])
    expect(first.skills).toEqual(['system'])
    expect(same.syncing).toBe(true)
    expect(rpc.mock.calls.filter(([method]) => method === 'skills/list')).toHaveLength(1)
    installed = ['system', 'user-added']
    finish()
    await vi.waitFor(async () => expect((await catalog.read('C:/project')).skills).toEqual(installed))
    expect(rpc.mock.calls.filter(([method]) => method === 'plugin/list')).toHaveLength(1)
  })

  it('keeps remote failures visible and reloads local additions after five seconds', async () => {
    vi.useFakeTimers()
    let skills = ['old']
    const rpc = vi.fn(async (method: string) => {
      if (method === 'plugin/list') throw new Error('offline')
      return method === 'skills/list' ? skills : { marketplaces: [] }
    })
    const catalog = new ExtensionCatalog({ rpc })
    expect((await catalog.read()).syncError).toContain('本机')
    skills = ['new']
    vi.advanceTimersByTime(5001)
    expect((await catalog.read()).skills).toEqual(['new'])
    expect(rpc.mock.calls.filter(([method]) => method === 'plugin/list')).toHaveLength(1)
  })
})
