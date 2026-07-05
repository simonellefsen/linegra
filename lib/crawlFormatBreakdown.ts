// U18i — normalize crawl response formats for per-agent adoption breakdown.

export const CRAWL_FORMAT_ORDER = ['html', 'md', 'json', 'xml', 'other'] as const;

export type CrawlResponseFormatBucket = (typeof CRAWL_FORMAT_ORDER)[number];

export const CRAWL_FORMAT_LABELS: Record<CrawlResponseFormatBucket, string> = {
  html: 'HTML',
  md: 'Markdown',
  json: 'JSON',
  xml: 'XML',
  other: 'Other',
};

export const CRAWL_FORMAT_COLORS: Record<CrawlResponseFormatBucket, string> = {
  html: 'bg-violet-500/80',
  md: 'bg-emerald-500/80',
  json: 'bg-amber-400/80',
  xml: 'bg-sky-500/80',
  other: 'bg-slate-400/60',
};

export interface CrawlTrafficAgentFormatRow {
  agentBucket: string;
  format: string;
  hits: number;
}

export interface AgentFormatBreakdownRow {
  agentBucket: string;
  totalHits: number;
  formatHits: Record<CrawlResponseFormatBucket, number>;
}

export const normalizeCrawlResponseFormat = (
  format: string | null | undefined
): CrawlResponseFormatBucket => {
  const value = format?.trim().toLowerCase();
  if (!value || value === 'unknown') return 'other';
  if (value === 'markdown') return 'md';
  if (value === 'html' || value === 'md' || value === 'json' || value === 'xml') return value;
  return 'other';
};

export const emptyFormatHits = (): Record<CrawlResponseFormatBucket, number> => ({
  html: 0,
  md: 0,
  json: 0,
  xml: 0,
  other: 0,
});

export const buildAgentFormatBreakdowns = (
  rows: CrawlTrafficAgentFormatRow[],
  agentOrder: string[] = []
): AgentFormatBreakdownRow[] => {
  const grouped = new Map<string, Record<CrawlResponseFormatBucket, number>>();

  rows.forEach((row) => {
    const bucket = normalizeCrawlResponseFormat(row.format);
    const current = grouped.get(row.agentBucket) ?? emptyFormatHits();
    current[bucket] += row.hits;
    grouped.set(row.agentBucket, current);
  });

  const orderedAgents = [
    ...agentOrder.filter((agent) => grouped.has(agent)),
    ...[...grouped.keys()].filter((agent) => !agentOrder.includes(agent)).sort(),
  ];

  return orderedAgents.map((agentBucket) => {
    const formatHits = grouped.get(agentBucket) ?? emptyFormatHits();
    const totalHits = CRAWL_FORMAT_ORDER.reduce((sum, format) => sum + formatHits[format], 0);
    return { agentBucket, totalHits, formatHits };
  });
};

export const formatSharePercent = (hits: number, totalHits: number): number =>
  totalHits <= 0 ? 0 : Math.round((hits / totalHits) * 100);
