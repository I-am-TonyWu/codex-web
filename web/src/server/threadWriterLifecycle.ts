type Rpc = (method: string, params: unknown) => Promise<unknown>
type Notification = { method: string; params: unknown }
type CloseWaiter = { closed: Promise<boolean>; dispose: () => void }

function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' ? value as Record<string, unknown> : null
}

/** Unsubscribe is only an acknowledgement; thread/closed follows flushed shutdown. */
export function watchThreadClosed(
  threadId: string,
  subscribe: (listener: (notification: Notification) => void) => () => void,
  timeoutMs = 12_000,
): CloseWaiter {
  let settle!: (closed: boolean) => void
  const closed = new Promise<boolean>(resolve => { settle = resolve })
  const unsubscribe = subscribe(notification => {
    const params = record(notification.params)
    if (notification.method === 'thread/closed' && params?.threadId === threadId) settle(true)
  })
  const timer = setTimeout(() => settle(false), timeoutMs)
  const dispose = () => { clearTimeout(timer); unsubscribe(); settle(false) }
  return { closed, dispose }
}

/** Serialize ownership changes with sends; never remove an OS lock or another writer. */
export class ThreadWriterLifecycle {
  private readonly tails = new Map<string, Promise<unknown>>()

  async run<T>(threadId: string, operation: () => Promise<T>): Promise<T> {
    const previous = this.tails.get(threadId) ?? Promise.resolve()
    const current = previous.catch(() => undefined).then(operation)
    this.tails.set(threadId, current)
    try {
      return await current
    } finally {
      if (this.tails.get(threadId) === current) this.tails.delete(threadId)
    }
  }

  releaseIdle(threadId: string, rpc: Rpc, watchClose: () => CloseWaiter): Promise<boolean> {
    return this.run(threadId, async () => {
      const response = record(await rpc('thread/read', { threadId, includeTurns: false }))
      const thread = record(response?.thread)
      // notLoaded includes histories owned by a different process. Only our own
      // loaded, idle session can be unsubscribed; busy/unknown states stay intact.
      const status = record(thread?.status)?.type
      // Native systemError is a terminal inactive state, not an active turn.
      if (status !== 'idle' && status !== 'systemError') return false
      // Subscribe before the request so an immediate close cannot race its reply.
      const waiter = watchClose()
      try {
        const result = record(await rpc('thread/unsubscribe', { threadId }))
        return result?.status === 'unsubscribed' && await waiter.closed
      } finally {
        waiter.dispose()
      }
    })
  }
}
