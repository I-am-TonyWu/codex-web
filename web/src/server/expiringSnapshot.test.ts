import { afterEach, expect, it, vi } from 'vitest'
import { ExpiringSnapshot } from './expiringSnapshot'
afterEach(() => vi.useRealTimers())
it('shares pending builds, expires old data, and refuses to repopulate after invalidation', async () => {
  vi.useFakeTimers()
  let finish!: (data: string) => void
  const load = vi.fn().mockImplementationOnce(() => new Promise<string>(resolve => { finish = resolve })).mockResolvedValue('new')
  const cache = new ExpiringSnapshot(load, 1000)
  const first = cache.get(); expect(cache.get()).toBe(first)
  cache.invalidate(); finish('old'); expect(await first).toBe('old')
  expect(await cache.get()).toBe('new'); expect(load).toHaveBeenCalledTimes(2)
  await cache.get(); expect(load).toHaveBeenCalledTimes(2)
  vi.advanceTimersByTime(1001); await cache.get(); expect(load).toHaveBeenCalledTimes(3)
})
