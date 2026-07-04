// Map admin_get_crawl_traffic_stats RPC payload for the Traffic panel.

export interface CrawlTrafficAgentRow {
  agentBucket: string;
  hits: number;
  lastSeen?: string;
}

export interface CrawlTrafficRouteRow {
  route: string;
  hits: number;
}

export interface CrawlTrafficDayRow {
  day: string;
  hits: number;
}

export interface CrawlTrafficRecentRow {
  recordedAt: string;
  route: string;
  agentBucket: string;
  resourceId?: string | null;
  responseFormat?: string | null;
}

export interface CrawlTrafficStats {
  days: number;
  totals: {
    hits: number;
    uniqueAgents: number;
    llmHits: number;
  };
  byAgent: CrawlTrafficAgentRow[];
  byRoute: CrawlTrafficRouteRow[];
  byDay: CrawlTrafficDayRow[];
  recent: CrawlTrafficRecentRow[];
}

export const CRAWLER_AGENT_LABELS: Record<string, string> = {
  googlebot: 'Googlebot',
  bingbot: 'Bingbot',
  gptbot: 'OpenAI (GPTBot)',
  claudebot: 'Anthropic (ClaudeBot)',
  perplexitybot: 'PerplexityBot',
  'other-bot': 'Other crawlers',
  unknown: 'Unknown agent',
};

export const labelCrawlerAgent = (bucket: string): string =>
  CRAWLER_AGENT_LABELS[bucket] ?? bucket;

export const mapCrawlTrafficStats = (payload: unknown): CrawlTrafficStats => {
  const data = (payload && typeof payload === 'object' ? payload : {}) as Record<string, unknown>;
  const totals = (data.totals && typeof data.totals === 'object' ? data.totals : {}) as Record<
    string,
    unknown
  >;

  const mapAgent = (row: Record<string, unknown>): CrawlTrafficAgentRow => ({
    agentBucket: String(row.agent_bucket ?? 'unknown'),
    hits: Number(row.hits ?? 0),
    lastSeen: typeof row.last_seen === 'string' ? row.last_seen : undefined,
  });

  const mapRoute = (row: Record<string, unknown>): CrawlTrafficRouteRow => ({
    route: String(row.route ?? 'unknown'),
    hits: Number(row.hits ?? 0),
  });

  const mapDay = (row: Record<string, unknown>): CrawlTrafficDayRow => ({
    day: String(row.day ?? ''),
    hits: Number(row.hits ?? 0),
  });

  const mapRecent = (row: Record<string, unknown>): CrawlTrafficRecentRow => ({
    recordedAt: String(row.recorded_at ?? ''),
    route: String(row.route ?? 'unknown'),
    agentBucket: String(row.agent_bucket ?? 'unknown'),
    resourceId: typeof row.resource_id === 'string' ? row.resource_id : null,
    responseFormat: typeof row.response_format === 'string' ? row.response_format : null,
  });

  const asRows = (value: unknown, mapper: (row: Record<string, unknown>) => unknown) =>
    Array.isArray(value) ? value.map((row) => mapper(row as Record<string, unknown>)) : [];

  return {
    days: Number(data.days ?? 30),
    totals: {
      hits: Number(totals.hits ?? 0),
      uniqueAgents: Number(totals.unique_agents ?? 0),
      llmHits: Number(totals.llm_hits ?? 0),
    },
    byAgent: asRows(data.by_agent, mapAgent) as CrawlTrafficAgentRow[],
    byRoute: asRows(data.by_route, mapRoute) as CrawlTrafficRouteRow[],
    byDay: asRows(data.by_day, mapDay) as CrawlTrafficDayRow[],
    recent: asRows(data.recent, mapRecent) as CrawlTrafficRecentRow[],
  };
};
