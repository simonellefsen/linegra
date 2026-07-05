import { describe, expect, it } from 'vitest';
import { buildPublicCrawlSources } from './publicCrawlSources';

describe('publicCrawlSources', () => {
  it('dedupes sources and formats citation summaries', () => {
    const sources = buildPublicCrawlSources(
      [
        {
          id: 'src-1',
          title: 'Parish register, Skt. Petri',
          type: 'Vital Record',
          repository: 'Rigsarkivet',
        },
      ],
      [
        {
          source_id: 'src-1',
          event_label: 'Baptism',
          page_text: '42',
        },
        {
          source_id: 'src-1',
          event_label: 'Burial',
          page_text: '88',
        },
      ]
    );
    expect(sources).toHaveLength(1);
    expect(sources[0]?.citations).toHaveLength(2);
    expect(sources[0]?.summary).toContain('Parish register, Skt. Petri (Vital Record)');
    expect(sources[0]?.summary).toContain('Baptism, p. 42');
    expect(sources[0]?.summary).toContain('Burial, p. 88');
    expect(sources[0]?.summary).toContain('Rigsarkivet');
  });
});
