import { describe, it, expect } from 'vitest';
import { BoundedCache } from './aiCache';

describe('BoundedCache', () => {
  it('stores and retrieves values', () => {
    const cache = new BoundedCache<number>();
    expect(cache.get('a')).toBeUndefined();
    cache.set('a', 1);
    expect(cache.get('a')).toBe(1);
    expect(cache.has('a')).toBe(true);
    expect(cache.size).toBe(1);
  });

  it('overwrites an existing key without growing', () => {
    const cache = new BoundedCache<number>();
    cache.set('a', 1);
    cache.set('a', 2);
    expect(cache.get('a')).toBe(2);
    expect(cache.size).toBe(1);
  });

  it('evicts the least-recently-used entry past capacity', () => {
    const cache = new BoundedCache<number>(2);
    cache.set('a', 1);
    cache.set('b', 2);
    cache.get('a'); // touch 'a' so 'b' is now least-recently-used
    cache.set('c', 3); // exceeds capacity => evict 'b'
    expect(cache.has('a')).toBe(true);
    expect(cache.has('b')).toBe(false);
    expect(cache.has('c')).toBe(true);
    expect(cache.size).toBe(2);
  });

  it('clears all entries', () => {
    const cache = new BoundedCache<number>();
    cache.set('a', 1);
    cache.clear();
    expect(cache.size).toBe(0);
    expect(cache.get('a')).toBeUndefined();
  });
});
