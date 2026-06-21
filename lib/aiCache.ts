// Tiny bounded LRU cache used to dedupe AI utility calls.
//
// Genealogy editing is iterative: the same place string or cause-of-death is
// re-submitted repeatedly while a record is being polished. Caching the
// normalized output avoids hitting OpenRouter again for an input we just saw.
// In-memory and session-scoped on purpose — simple, with no stale-across-session
// surprises.

export class BoundedCache<V> {
  private readonly store = new Map<string, V>();

  constructor(private readonly maxEntries = 200) {}

  get(key: string): V | undefined {
    if (!this.store.has(key)) return undefined;
    // Touch for recency: re-insert so it becomes the most-recently-used entry.
    const value = this.store.get(key) as V;
    this.store.delete(key);
    this.store.set(key, value);
    return value;
  }

  has(key: string): boolean {
    return this.store.has(key);
  }

  set(key: string, value: V): void {
    if (this.store.has(key)) this.store.delete(key);
    this.store.set(key, value);
    if (this.store.size > this.maxEntries) {
      const oldest = this.store.keys().next().value;
      if (oldest !== undefined) this.store.delete(oldest);
    }
  }

  clear(): void {
    this.store.clear();
  }

  get size(): number {
    return this.store.size;
  }
}
