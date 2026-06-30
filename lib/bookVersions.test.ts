import { describe, it, expect } from 'vitest';
import { FamilyBook, BookChapter } from '../types';
import {
  createBookVersion,
  recordVersion,
  matchesVersion,
  restoreVersion,
  MAX_BOOK_VERSIONS,
} from './bookVersions';

const book = (overrides: Partial<{ title: string; subtitle: string | null; chapters: BookChapter[] }> = {}): FamilyBook => ({
  id: 'b1',
  treeId: 't1',
  title: overrides.title ?? 'Title',
  subtitle: overrides.subtitle ?? null,
  status: 'draft',
  isPublic: false,
  options: { scope: 'all', style: 'narrative', length: 'medium', language: 'en' },
  chapters: overrides.chapters ?? [{ kind: 'overview', title: 'Overview', narrative: 'once upon a time', status: 'draft' }],
  statistics: { personCount: 1, topSurnames: [], topPlaces: [], topOccupations: [] },
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
});

const meta = (n: number) => ({ id: `v${n}`, createdAt: `2026-01-0${n}T00:00:00Z` });

describe('createBookVersion', () => {
  it('snapshots title/subtitle/chapters with a deep copy', () => {
    const b = book({ chapters: [{ kind: 'overview', title: 'O', narrative: 'a', status: 'draft' }] });
    const v = createBookVersion(b, 'Save', meta(1));
    expect(v.label).toBe('Save');
    expect(v.title).toBe('Title');
    expect(v.chapters).toEqual(b.chapters);
    // mutating the book afterwards does not mutate the snapshot
    b.chapters[0].narrative = 'b';
    expect(v.chapters[0].narrative).toBe('a');
  });
});

describe('versionFingerprint + matchesVersion', () => {
  it('matches when content is identical', () => {
    const b = book();
    const v = createBookVersion(b, 'Save', meta(1));
    expect(matchesVersion(b, v)).toBe(true);
  });
  it('does not match after an edit', () => {
    const b = book();
    const v = createBookVersion(b, 'Save', meta(1));
    b.chapters[0].narrative = 'changed';
    expect(matchesVersion(b, v)).toBe(false);
  });
});

describe('recordVersion', () => {
  it('prepends a new version (newest first)', () => {
    const v1 = createBookVersion(book({ title: 'A' }), 'Save', meta(1));
    const v2 = createBookVersion(book({ title: 'B' }), 'Save', meta(2));
    const h = recordVersion(recordVersion([], v1), v2);
    expect(h.map((v) => v.title)).toEqual(['B', 'A']);
  });

  it('skips recording a duplicate of the most recent version (same reference returned)', () => {
    const v1 = createBookVersion(book(), 'Save', meta(1));
    const v1Dup = createBookVersion(book(), 'Save', meta(2)); // same content, different id/time
    const h = recordVersion([], v1);
    expect(recordVersion(h, v1Dup)).toBe(h); // unchanged
  });

  it('caps the history to MAX_BOOK_VERSIONS', () => {
    let h: ReturnType<typeof createBookVersion>[] = [];
    for (let i = 0; i < MAX_BOOK_VERSIONS + 5; i += 1) {
      h = recordVersion(h, createBookVersion(book({ title: `T${i}` }), 'Save', meta(i + 1)));
    }
    expect(h.length).toBe(MAX_BOOK_VERSIONS);
    expect(h[0].title).toBe(`T${MAX_BOOK_VERSIONS + 4}`); // newest kept
  });
});

describe('restoreVersion', () => {
  it('returns a new book with the version content, without mutating the input', () => {
    const current = book({ title: 'Current', chapters: [{ kind: 'overview', title: 'O', narrative: 'new', status: 'draft' }] });
    const snapshotBook = book({ title: 'Old', subtitle: 'sub', chapters: [{ kind: 'overview', title: 'O', narrative: 'old', status: 'draft' }] });
    const v = createBookVersion(snapshotBook, 'Save', meta(1));
    const restored = restoreVersion(current, v);
    expect(restored.title).toBe('Old');
    expect(restored.subtitle).toBe('sub');
    expect(restored.chapters[0].narrative).toBe('old');
    expect(current.title).toBe('Current'); // input untouched
    expect(current.chapters[0].narrative).toBe('new');
  });

  it('marks a restored book as a fresh draft', () => {
    const published = book({ title: 'P' });
    published.status = 'complete';
    const v = createBookVersion(published, 'Publish', meta(1));
    const restored = restoreVersion(published, v);
    expect(restored.status).toBe('draft');
  });
});
