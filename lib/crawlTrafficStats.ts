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
  userAgent?: string | null;
}

export interface VisitorCountryRow {
  countryCode: string;
  hits: number;
  lastSeen?: string;
}

export interface VisitorRecentRow {
  recordedAt: string;
  route: string;
  countryCode?: string | null;
  region?: string | null;
  city?: string | null;
  resourceId?: string | null;
}

export interface BotTrafficStats {
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

export interface VisitorTrafficStats {
  totals: {
    hits: number;
    uniqueCountries: number;
    uniqueRoutes: number;
  };
  byCountry: VisitorCountryRow[];
  byRoute: CrawlTrafficRouteRow[];
  byDay: CrawlTrafficDayRow[];
  recent: VisitorRecentRow[];
}

export interface CrawlTrafficStats {
  days: number;
  agentFilter?: string | null;
  bot: BotTrafficStats;
  visitor: VisitorTrafficStats;
}

export const CRAWLER_AGENT_LABELS: Record<string, string> = {
  googlebot: 'Googlebot',
  bingbot: 'Bingbot',
  duckduckbot: 'DuckDuckBot',
  applebot: 'Applebot',
  facebookbot: 'Meta (Facebook)',
  gptbot: 'OpenAI (GPTBot)',
  claudebot: 'Anthropic (ClaudeBot)',
  perplexitybot: 'PerplexityBot',
  yandexbot: 'YandexBot',
  baiduspider: 'Baidu Spider',
  'other-bot': 'Other crawlers',
  unknown: 'Unknown agent',
  browser: 'Browser',
};

export const labelCrawlerAgent = (bucket: string): string =>
  CRAWLER_AGENT_LABELS[bucket] ?? bucket;

const countryDisplay =
  typeof Intl !== 'undefined' && 'DisplayNames' in Intl
    ? new Intl.DisplayNames(['en'], { type: 'region' })
    : null;

export const labelCountryCode = (countryCode: string | null | undefined): string => {
  const code = countryCode?.trim().toUpperCase();
  if (!code || code === '??') return 'Unknown country';
  return countryDisplay?.of(code) ?? code;
};

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

const mapBotRecent = (row: Record<string, unknown>): CrawlTrafficRecentRow => ({
  recordedAt: String(row.recorded_at ?? ''),
  route: String(row.route ?? 'unknown'),
  agentBucket: String(row.agent_bucket ?? 'unknown'),
  resourceId: typeof row.resource_id === 'string' ? row.resource_id : null,
  responseFormat: typeof row.response_format === 'string' ? row.response_format : null,
  userAgent: typeof row.user_agent === 'string' ? row.user_agent : null,
});

const mapVisitorCountry = (row: Record<string, unknown>): VisitorCountryRow => ({
  countryCode: String(row.country_code ?? '??'),
  hits: Number(row.hits ?? 0),
  lastSeen: typeof row.last_seen === 'string' ? row.last_seen : undefined,
});

const mapVisitorRecent = (row: Record<string, unknown>): VisitorRecentRow => ({
  recordedAt: String(row.recorded_at ?? ''),
  route: String(row.route ?? 'unknown'),
  countryCode: typeof row.country_code === 'string' ? row.country_code : null,
  region: typeof row.region === 'string' ? row.region : null,
  city: typeof row.city === 'string' ? row.city : null,
  resourceId: typeof row.resource_id === 'string' ? row.resource_id : null,
});

const asRows = <T>(value: unknown, mapper: (row: Record<string, unknown>) => T): T[] =>
  Array.isArray(value) ? value.map((row) => mapper(row as Record<string, unknown>)) : [];

const mapBotSection = (section: unknown): BotTrafficStats => {
  const data = (section && typeof section === 'object' ? section : {}) as Record<string, unknown>;
  const totals = (data.totals && typeof data.totals === 'object' ? data.totals : {}) as Record<
    string,
    unknown
  >;

  return {
    totals: {
      hits: Number(totals.hits ?? 0),
      uniqueAgents: Number(totals.unique_agents ?? 0),
      llmHits: Number(totals.llm_hits ?? 0),
    },
    byAgent: asRows(data.by_agent, mapAgent),
    byRoute: asRows(data.by_route, mapRoute),
    byDay: asRows(data.by_day, mapDay),
    recent: asRows(data.recent, mapBotRecent),
  };
};

const mapVisitorSection = (section: unknown): VisitorTrafficStats => {
  const data = (section && typeof section === 'object' ? section : {}) as Record<string, unknown>;
  const totals = (data.totals && typeof data.totals === 'object' ? data.totals : {}) as Record<
    string,
    unknown
  >;

  return {
    totals: {
      hits: Number(totals.hits ?? 0),
      uniqueCountries: Number(totals.unique_countries ?? 0),
      uniqueRoutes: Number(totals.unique_routes ?? 0),
    },
    byCountry: asRows(data.by_country, mapVisitorCountry),
    byRoute: asRows(data.by_route, mapRoute),
    byDay: asRows(data.by_day, mapDay),
    recent: asRows(data.recent, mapVisitorRecent),
  };
};

export const mapCrawlTrafficStats = (payload: unknown): CrawlTrafficStats => {
  const data = (payload && typeof payload === 'object' ? payload : {}) as Record<string, unknown>;

  // Support pre-20260704160000 flat RPC shape if migration lags behind deploy.
  const botPayload =
    data.bot ??
    (data.totals
      ? {
          totals: data.totals,
          by_agent: data.by_agent,
          by_route: data.by_route,
          by_day: data.by_day,
          recent: data.recent,
        }
      : undefined);

  return {
    days: Number(data.days ?? 30),
    agentFilter: typeof data.agent_filter === 'string' ? data.agent_filter : null,
    bot: mapBotSection(botPayload),
    visitor: mapVisitorSection(data.visitor),
  };
};
