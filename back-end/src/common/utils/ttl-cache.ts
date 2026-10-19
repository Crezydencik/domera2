/**
 * Small in-process cache with TTL, size bound (oldest evicted first) and in-flight
 * de-duplication: concurrent `getOrLoad` calls for one key share a single load.
 * Failed loads are not cached. Per instance only — use it for data that may be briefly stale.
 */
export class TtlCache<K, V> {
  private readonly entries = new Map<K, { expiresAt: number; value: Promise<V> }>();

  constructor(private readonly options: { ttlMs: number; maxEntries: number }) {}

  getOrLoad(key: K, load: () => Promise<V>, now = Date.now()): Promise<V> {
    const hit = this.entries.get(key);
    if (hit && hit.expiresAt > now) return hit.value;

    const value = load();
    this.entries.delete(key);
    this.entries.set(key, { expiresAt: now + this.options.ttlMs, value });
    value.catch(() => {
      if (this.entries.get(key)?.value === value) this.entries.delete(key);
    });
    this.evict(now);
    return value;
  }

  delete(key: K): void {
    this.entries.delete(key);
  }

  clear(): void {
    this.entries.clear();
  }

  get size(): number {
    return this.entries.size;
  }

  private evict(now: number) {
    if (this.entries.size <= this.options.maxEntries) return;
    for (const [key, entry] of this.entries) {
      if (entry.expiresAt <= now) this.entries.delete(key);
    }
    while (this.entries.size > this.options.maxEntries) {
      const oldest = this.entries.keys().next();
      if (oldest.done) return;
      this.entries.delete(oldest.value);
    }
  }
}
