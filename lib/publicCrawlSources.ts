// Roadmap U15 — sources and citations for public person crawl shells.

export interface PublicCrawlSourceCitation {
  eventLabel?: string | null;
  label?: string | null;
  page?: string | null;
  dataDate?: string | null;
  dataText?: string | null;
}

export interface PublicCrawlSourceRef {
  id: string;
  title: string;
  type: string;
  repository?: string | null;
  url?: string | null;
  citationDate?: string | null;
  page?: string | null;
  callNumber?: string | null;
  abbreviation?: string | null;
  notes?: string | null;
  citations: PublicCrawlSourceCitation[];
  summary: string;
}

type SourceRow = {
  id: string;
  title: string;
  type: string;
  repository?: string | null;
  url?: string | null;
  citation_date_text?: string | null;
  page?: string | null;
  call_number?: string | null;
  abbreviation?: string | null;
  notes?: string | null;
};

type CitationRow = {
  source_id: string;
  event_label?: string | null;
  label?: string | null;
  page_text?: string | null;
  data_date?: string | null;
  data_text?: string | null;
};

const trimOrNull = (value?: string | null): string | null => {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
};

const formatCitationDetail = (citation: PublicCrawlSourceCitation): string => {
  const parts = [
    trimOrNull(citation.eventLabel),
    trimOrNull(citation.label),
    citation.page ? `p. ${citation.page}` : null,
    trimOrNull(citation.dataDate),
    trimOrNull(citation.dataText),
  ].filter(Boolean);
  return parts.join(', ');
};

const formatSourceSummary = (
  source: Omit<PublicCrawlSourceRef, 'summary' | 'citations'>,
  citations: PublicCrawlSourceCitation[]
): string => {
  const typeSuffix = source.type && source.type !== 'Unknown' ? ` (${source.type})` : '';
  const citationBits = citations.map(formatCitationDetail).filter(Boolean);
  const citationSuffix = citationBits.length ? ` — ${citationBits.join('; ')}` : '';
  const repoSuffix = source.repository ? ` · ${source.repository}` : '';
  return `${source.title}${typeSuffix}${citationSuffix}${repoSuffix}`;
};

export const buildPublicCrawlSources = (
  sourceRows: SourceRow[],
  citationRows: CitationRow[]
): PublicCrawlSourceRef[] => {
  const citationsBySource = new Map<string, PublicCrawlSourceCitation[]>();
  citationRows.forEach((row) => {
    const citation: PublicCrawlSourceCitation = {
      eventLabel: trimOrNull(row.event_label),
      label: trimOrNull(row.label),
      page: trimOrNull(row.page_text),
      dataDate: trimOrNull(row.data_date),
      dataText: trimOrNull(row.data_text),
    };
    const list = citationsBySource.get(row.source_id) ?? [];
    list.push(citation);
    citationsBySource.set(row.source_id, list);
  });

  return sourceRows
    .map((row) => {
      const citations = citationsBySource.get(row.id) ?? [];
      const base = {
        id: row.id,
        title: row.title?.trim() || 'Untitled source',
        type: row.type || 'Unknown',
        repository: trimOrNull(row.repository),
        url: trimOrNull(row.url),
        citationDate: trimOrNull(row.citation_date_text),
        page: trimOrNull(row.page),
        callNumber: trimOrNull(row.call_number),
        abbreviation: trimOrNull(row.abbreviation),
        notes: trimOrNull(row.notes),
        citations,
      };
      return {
        ...base,
        summary: formatSourceSummary(base, citations),
      };
    })
    .sort((left, right) => left.title.localeCompare(right.title));
};
