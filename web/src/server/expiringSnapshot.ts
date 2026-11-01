export class ExpiringSnapshot<T> {
  private value: { data: T; until: number } | null = null
  private pending: Promise<T> | null = null
  private generation = 0
  constructor(private readonly load: () => Promise<T>, private readonly ttl: number) {}
  invalidate(): void { this.generation++; this.value = null }
  get(): Promise<T> {
    if (this.value && this.value.until > Date.now()) return Promise.resolve(this.value.data)
    if (this.pending) return this.pending
    const generation = this.generation
    const run = this.load().then(data => {
      if (this.generation === generation) this.value = { data, until: Date.now() + this.ttl }
      return data
    }).finally(() => { if (this.pending === run) this.pending = null })
    this.pending = run
    return run
  }
}
