import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const state = (name = 'Alpha') => ({ order: ['C:\\Projects\\alpha'], labels: {}, active: [], projectOrder: ['alpha'],
  localProjects: [{ id: 'alpha', name, rootPaths: ['C:\\Projects\\alpha'] }], threadProjectAssignments: { one: 'alpha' }, projectlessThreadIds: [], projectThreadOrders: {} })
const response = (name = 'Alpha') => new Response(JSON.stringify({ data: state(name) }), { headers: { 'Content-Type': 'application/json' } })
beforeEach(() => { vi.resetModules(); vi.useFakeTimers(); vi.setSystemTime(10000) })
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals() })

describe('live desktop project cache', () => {
  it('shares in-flight requests, expires the cache, and never shares mutable metadata', async () => {
    const fetch = vi.fn().mockImplementation(async () => response())
    vi.stubGlobal('fetch', fetch)
    const { getWorkspaceRootsState } = await import('./codexGateway')
    const [first, second] = await Promise.all([getWorkspaceRootsState(), getWorkspaceRootsState()])
    expect(fetch).toHaveBeenCalledTimes(1)
    expect(first.localProjects?.[0]?.rootPaths).toEqual(['C:\\Projects\\alpha'])
    first.localProjects![0]!.rootPaths.push('different')
    first.threadProjectAssignments!.one = 'different'
    expect(second.localProjects?.[0]?.rootPaths).toHaveLength(1)
    expect((await getWorkspaceRootsState()).threadProjectAssignments?.one).toBe('alpha')
    vi.setSystemTime(11001)
    await getWorkspaceRootsState()
    expect(fetch).toHaveBeenCalledTimes(2)
  })
  it('forces an immediate refresh after desktop changes and requests uncached HTTP responses', async () => {
    const fetch = vi.fn().mockResolvedValueOnce(response()).mockResolvedValueOnce(response('Renamed'))
    vi.stubGlobal('fetch', fetch)
    const { getWorkspaceRootsState } = await import('./codexGateway')
    await getWorkspaceRootsState()
    expect((await getWorkspaceRootsState({ force: true })).localProjects?.[0]?.name).toBe('Renamed')
    expect(fetch.mock.calls[0]?.[1]).toEqual({ cache: 'no-store' })
  })
  it('does not let an old read repopulate the cache after a project mutation', async () => {
    let resolveOld!: (value: Response) => void
    const fetch = vi.fn().mockImplementationOnce(() => new Promise<Response>((resolve) => { resolveOld = resolve }))
      .mockResolvedValueOnce(new Response('{}')).mockResolvedValueOnce(response('New name'))
    vi.stubGlobal('fetch', fetch)
    const { getWorkspaceRootsState, mutateLocalProject } = await import('./codexGateway')
    const old = getWorkspaceRootsState()
    await mutateLocalProject({ type: 'rename', projectId: 'alpha', name: 'New name' })
    resolveOld(response('Old name'))
    await old
    expect((await getWorkspaceRootsState()).localProjects?.[0]?.name).toBe('New name')
    expect(fetch).toHaveBeenCalledTimes(3)
  })
  it('retries failed reads instead of permanently caching failure', async () => {
    const fetch = vi.fn().mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce(response())
    vi.stubGlobal('fetch', fetch)
    const { getWorkspaceRootsState } = await import('./codexGateway')
    await expect(getWorkspaceRootsState()).rejects.toThrow('offline')
    expect((await getWorkspaceRootsState()).localProjects).toHaveLength(1)
  })
})
