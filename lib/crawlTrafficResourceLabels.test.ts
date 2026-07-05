import { describe, expect, it } from 'vitest';
import {
  collectCrawlTrafficResourceRefs,
  crawlTrafficResourceCacheKey,
  humanizeCrawlResourceKey,
  labelCrawlResourceFromKey,
  resolveCrawlTrafficResourceLabels,
} from './crawlTrafficResourceLabels';
import type { CrawlTrafficStats } from './crawlTrafficStats';

const personId = '11111111-1111-4111-8111-111111111111';
const treeId = '22222222-2222-4222-8222-222222222222';

describe('crawlTrafficResourceLabels', () => {
  it('collects unique resource refs from recent hit tables', () => {
    const stats = {
      bot: {
        recent: [{ route: 'person', resourceId: personId, recordedAt: '', agentBucket: 'browser' }],
      },
      visitor: {
        recent: [
          { route: 'person', resourceKey: 'pernille-gether-a1b2c3d4', recordedAt: '' },
          { route: 'person', resourceKey: 'pernille-gether-a1b2c3d4', recordedAt: '' },
        ],
      },
    } as unknown as CrawlTrafficStats;

    const refs = collectCrawlTrafficResourceRefs(stats);
    expect(refs).toHaveLength(2);
    expect(crawlTrafficResourceCacheKey(refs[0]!)).toBe(`person:${personId}`);
  });

  it('humanizes slug resource keys', () => {
    expect(humanizeCrawlResourceKey('pernille-gether-gamby-a1b2c3d4')).toBe('Pernille Gether Gamby');
  });

  it('resolves person and tree labels with public URLs', () => {
    const refs = [
      { route: 'person', resourceId: personId },
      { route: 'tree', resourceId: treeId },
    ];
    const labels = resolveCrawlTrafficResourceLabels(refs, {
      origin: 'https://linegra.example',
      persons: new Map([
        [
          personId,
          { treeId, firstName: 'Pernille', lastName: 'Gamby', birthDate: '1980' },
        ],
      ]),
      trees: new Map([[treeId, { name: 'Lindau tree', slug: 'lindau-tree' }]]),
      books: new Map(),
      families: new Map(),
    });

    expect(labels[`person:${personId}`]?.label).toBe('Pernille Gamby (person)');
    expect(labels[`person:${personId}`]?.href).toContain('/tree/lindau-tree/person/');
    expect(labels[`tree:${treeId}`]?.label).toBe('Lindau tree (tree)');
    expect(labels[`tree:${treeId}`]?.href).toBe('https://linegra.example/tree/lindau-tree');
  });

  it('falls back to slug labels when no uuid match exists', () => {
    const label = labelCrawlResourceFromKey('person', 'birgitta-hallgren-deadbeef', 'https://linegra.example');
    expect(label.kind).toBe('slug');
    expect(label.label).toContain('Birgitta Hallgren');
  });
});
