import { describe, it, expect } from 'vitest';
import { Relationship } from '../types';
import { dnaSupportMatchIds, collectDnaSupportMatchIds } from './dnaSupport';

const rel = (id: string, metadata?: Record<string, unknown>): Relationship => ({
  id,
  treeId: 't',
  type: 'bio_father',
  personId: 'parent',
  relatedId: 'child',
  metadata,
});

describe('dnaSupportMatchIds', () => {
  it('reads the legacy string[] shape', () => {
    const md = { dna_support_by_person: { focusA: ['m1', 'm2', 'm1'] } };
    expect(dnaSupportMatchIds(md).sort()).toEqual(['m1', 'm2']);
  });

  it('reads the structured { match_ids } shape', () => {
    const md = { dna_support_by_person: { focusA: { match_ids: ['m3', 'm4'] } } };
    expect(dnaSupportMatchIds(md).sort()).toEqual(['m3', 'm4']);
  });

  it('merges across multiple focus people and dedupes', () => {
    const md = {
      dna_support_by_person: {
        focusA: ['m1'],
        focusB: { match_ids: ['m1', 'm2'] },
      },
    };
    expect(dnaSupportMatchIds(md).sort()).toEqual(['m1', 'm2']);
  });

  it('ignores non-string entries', () => {
    const md = { dna_support_by_person: { focusA: ['m1', 7, null, ''] } };
    expect(dnaSupportMatchIds(md)).toEqual(['m1']);
  });

  it('returns [] when metadata is missing / malformed', () => {
    expect(dnaSupportMatchIds(undefined)).toEqual([]);
    expect(dnaSupportMatchIds(null)).toEqual([]);
    expect(dnaSupportMatchIds({})).toEqual([]);
    expect(dnaSupportMatchIds({ dna_support_by_person: 'nope' })).toEqual([]);
    expect(dnaSupportMatchIds({ dna_support_by_person: [] })).toEqual([]);
  });
});

describe('collectDnaSupportMatchIds', () => {
  it('collects distinct match ids across all relationships', () => {
    const rels = [
      rel('r1', { dna_support_by_person: { a: ['m1', 'm2'] } }),
      rel('r2', { dna_support_by_person: { b: { match_ids: ['m2', 'm3'] } } }),
      rel('r3', { other: true }), // no support metadata
      rel('r4'), // no metadata at all
    ];
    expect(collectDnaSupportMatchIds(rels).sort()).toEqual(['m1', 'm2', 'm3']);
  });

  it('returns [] for an empty set', () => {
    expect(collectDnaSupportMatchIds([])).toEqual([]);
  });
});
