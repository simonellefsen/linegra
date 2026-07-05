// Roadmap V3 — map admin_get_api_error_stats RPC for the Errors admin panel.

export interface ApiErrorDayRow {
  day: string;
  hits: number;
}

export interface ApiErrorSourceRow {
  source: string;
  hits: number;
}

export interface ApiErrorRouteRow {
  route: string;
  hits: number;
}

export interface ApiErrorStatusRow {
  statusCode: number;
  hits: number;
}

export interface ApiErrorRecentRow {
  recordedAt: string;
  source: string;
  route: string;
  statusCode: number;
  message?: string | null;
}

export interface AiProxyErrorPurposeRow {
  purpose: string;
  hits: number;
}

export interface AiProxyErrorRecentRow {
  recordedAt: string;
  purpose: string;
  model?: string | null;
  error?: string | null;
  status?: string | null;
}

export interface ApiErrorStats {
  days: number;
  totals: {
    hits: number;
    uniqueRoutes: number;
    uniqueSources: number;
  };
  byDay: ApiErrorDayRow[];
  bySource: ApiErrorSourceRow[];
  byRoute: ApiErrorRouteRow[];
  byStatus: ApiErrorStatusRow[];
  recent: ApiErrorRecentRow[];
  aiProxy: {
    totals: { hits: number };
    byPurpose: AiProxyErrorPurposeRow[];
    recent: AiProxyErrorRecentRow[];
  };
}

const asNumber = (value: unknown, fallback = 0): number => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const mapRows = <T>(
  value: unknown,
  mapper: (row: Record<string, unknown>) => T
): T[] => (Array.isArray(value) ? value.map((row) => mapper(row as Record<string, unknown>)) : []);

export const mapApiErrorStats = (payload: unknown): ApiErrorStats => {
  const data = (payload ?? {}) as Record<string, unknown>;
  const totals = (data.totals ?? {}) as Record<string, unknown>;
  const aiProxy = (data.aiProxy ?? data.ai_proxy ?? {}) as Record<string, unknown>;
  const aiTotals = (aiProxy.totals ?? {}) as Record<string, unknown>;

  return {
    days: asNumber(data.days, 30),
    totals: {
      hits: asNumber(totals.hits),
      uniqueRoutes: asNumber(totals.unique_routes ?? totals.uniqueRoutes),
      uniqueSources: asNumber(totals.unique_sources ?? totals.uniqueSources),
    },
    byDay: mapRows(data.byDay ?? data.by_day, (row) => ({
      day: String(row.day ?? ''),
      hits: asNumber(row.hits),
    })),
    bySource: mapRows(data.bySource ?? data.by_source, (row) => ({
      source: String(row.source ?? 'unknown'),
      hits: asNumber(row.hits),
    })),
    byRoute: mapRows(data.byRoute ?? data.by_route, (row) => ({
      route: String(row.route ?? 'unknown'),
      hits: asNumber(row.hits),
    })),
    byStatus: mapRows(data.byStatus ?? data.by_status, (row) => ({
      statusCode: asNumber(row.status_code ?? row.statusCode),
      hits: asNumber(row.hits),
    })),
    recent: mapRows(data.recent, (row) => ({
      recordedAt: String(row.recorded_at ?? row.recordedAt ?? ''),
      source: String(row.source ?? 'unknown'),
      route: String(row.route ?? 'unknown'),
      statusCode: asNumber(row.status_code ?? row.statusCode),
      message: typeof row.message === 'string' ? row.message : null,
    })),
    aiProxy: {
      totals: { hits: asNumber(aiTotals.hits) },
      byPurpose: mapRows(aiProxy.byPurpose ?? aiProxy.by_purpose, (row) => ({
        purpose: String(row.purpose ?? 'unknown'),
        hits: asNumber(row.hits),
      })),
      recent: mapRows(aiProxy.recent, (row) => ({
        recordedAt: String(row.recorded_at ?? row.recordedAt ?? ''),
        purpose: String(row.purpose ?? 'unknown'),
        model: typeof row.model === 'string' ? row.model : null,
        error: typeof row.error === 'string' ? row.error : null,
        status: typeof row.status === 'string' ? row.status : null,
      })),
    },
  };
};

export const labelApiErrorSource = (source: string): string => {
  switch (source) {
    case 'public-api':
      return 'Public crawl API';
    case 'ai-proxy':
      return 'AI proxy';
    case 'middleware':
      return 'Edge middleware';
    default:
      return source;
  }
};
