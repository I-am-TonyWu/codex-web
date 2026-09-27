type Rpc = { rpc(method: string, params: unknown): Promise<unknown> }
type Snapshot = { plugins: unknown; skills: unknown; syncing: boolean; syncError: string }

// One remote refresh per service, never one per browser/tab. Keep local reads
// usable while the remote marketplace is slow or temporarily unavailable.
export class ExtensionCatalog {
  private remote: Promise<void> | null = null
  private nextRemoteAt = 0
  private syncError = ''
  private snapshots = new Map<string, { expires: number; pending: Promise<Snapshot> }>()

  constructor(private server: Rpc) {}

  async read(cwd?: string): Promise<Snapshot> {
    if (!this.remote && Date.now() >= this.nextRemoteAt) {
      this.nextRemoteAt = Date.now() + 90_000
      this.remote = this.server.rpc('plugin/list', { forceRefetch: true })
        .then(() => { this.syncError = ''; this.snapshots.clear() })
        .catch(() => { this.syncError = '插件云端同步暂未完成，当前显示本机已安装内容。' })
        .finally(() => { this.remote = null })
    }
    const key = cwd || ''
    let entry = this.snapshots.get(key)
    if (!entry || entry.expires <= Date.now()) {
      const params = cwd ? { cwds: [cwd] } : {}
      const pending = Promise.all([
        this.server.rpc('plugin/installed', params),
        this.server.rpc('skills/list', { ...params, forceReload: true }),
      ]).then(([plugins, skills]) => ({ plugins, skills, syncing: false, syncError: '' }))
      entry = { expires: Number.POSITIVE_INFINITY, pending }
      if (this.snapshots.size >= 8) this.snapshots.delete(this.snapshots.keys().next().value!)
      this.snapshots.set(key, entry)
      pending.then(() => {
        const current = this.snapshots.get(key)
        if (current?.pending === pending) current.expires = Date.now() + 5_000
      }, () => { if (this.snapshots.get(key)?.pending === pending) this.snapshots.delete(key) })
    }
    return { ...await entry.pending, syncing: this.remote !== null, syncError: this.syncError }
  }
}
