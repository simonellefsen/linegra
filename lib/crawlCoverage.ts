// U18j — map crawl coverage RPC payload for the traffic panel.

export interface CrawlCoverageNeverCrawledPerson {
  personId: string;
  firstName?: string | null;
  lastName?: string | null;
}

export interface CrawlCoverageTreeRow {
  treeId: string;
  treeName: string;
  treeSlug?: string | null;
  totalPersonUrls: number;
  crawledPersonUrls: number;
  coveragePercent: number;
  neverCrawled: CrawlCoverageNeverCrawledPerson[];
}

export interface CrawlCoverageAgentTreeRow {
  agentBucket: string;
  treeId: string;
  treeName: string;
  crawledPersonUrls: number;
  totalPersonUrls: number;
  coveragePercent: number;
}

export interface CrawlCoverageStats {
  days: number;
  agentFilter?: string | null;
  trees: CrawlCoverageTreeRow[];
  byAgentTree: CrawlCoverageAgentTreeRow[];
}

const asRows = <T>(value: unknown, mapper: (row: Record<string, unknown>) => T): T[] =>
  Array.isArray(value) ? value.map((row) => mapper(row as Record<string, unknown>)) : [];

const mapNeverCrawled = (row: Record<string, unknown>): CrawlCoverageNeverCrawledPerson => ({
  personId: String(row.person_id ?? ''),
  firstName: typeof row.first_name === 'string' ? row.first_name : null,
  lastName: typeof row.last_name === 'string' ? row.last_name : null,
});

const mapTree = (row: Record<string, unknown>): CrawlCoverageTreeRow => ({
  treeId: String(row.tree_id ?? ''),
  treeName: String(row.tree_name ?? 'Family tree'),
  treeSlug: typeof row.tree_slug === 'string' ? row.tree_slug : null,
  totalPersonUrls: Number(row.total_person_urls ?? 0),
  crawledPersonUrls: Number(row.crawled_person_urls ?? 0),
  coveragePercent: Number(row.coverage_percent ?? 0),
  neverCrawled: asRows(row.never_crawled, mapNeverCrawled),
});

const mapAgentTree = (row: Record<string, unknown>): CrawlCoverageAgentTreeRow => ({
  agentBucket: String(row.agent_bucket ?? 'unknown'),
  treeId: String(row.tree_id ?? ''),
  treeName: String(row.tree_name ?? 'Family tree'),
  crawledPersonUrls: Number(row.crawled_person_urls ?? 0),
  totalPersonUrls: Number(row.total_person_urls ?? 0),
  coveragePercent: Number(row.coverage_percent ?? 0),
});

export const mapCrawlCoverageStats = (payload: unknown): CrawlCoverageStats => {
  const data = (payload && typeof payload === 'object' ? payload : {}) as Record<string, unknown>;
  return {
    days: Number(data.days ?? 30),
    agentFilter: typeof data.agent_filter === 'string' ? data.agent_filter : null,
    trees: asRows(data.trees, mapTree),
    byAgentTree: asRows(data.by_agent_tree, mapAgentTree),
  };
};

export const formatCoveragePersonName = (person: CrawlCoverageNeverCrawledPerson): string =>
  [person.firstName, person.lastName].filter(Boolean).join(' ').trim() || person.personId;
