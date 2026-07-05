// Roadmap V2 — map admin_get_client_error_stats RPC for the Errors admin panel.

export interface ClientErrorDayRow {
  day: string;
  hits: number;
}

export interface ClientErrorRouteRow {
  route: string;
  hits: number;
}

export interface ClientErrorKindRow {
  kind: string;
  hits: number;
}

export interface ClientErrorSignatureRow {
  message: string;
  stackHash: string;
  hits: number;
  lastSeen?: string;
}

export interface ClientErrorRecentRow {
  recordedAt: string;
  kind: string;
  message: string;
  stackHash: string;
  route?: string | null;
  source?: string | null;
}

export interface ClientErrorStats {
  days: number;
  totals: {
    hits: number;
    uniqueSignatures: number;
  };
  byDay: ClientErrorDayRow[];
  byRoute: ClientErrorRouteRow[];
  byKind: ClientErrorKindRow[];
  topErrors: ClientErrorSignatureRow[];
  recent: ClientErrorRecentRow[];
}

const asNumber = (value: unknown, fallback = 0): number => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const mapDayRow = (row: Record<string, unknown>): ClientErrorDayRow => ({
  day: String(row.day ?? ''),
  hits: asNumber(row.hits),
});

const mapRouteRow = (row: Record<string, unknown>): ClientErrorRouteRow => ({
  route: String(row.route ?? '/'),
  hits: asNumber(row.hits),
});

const mapKindRow = (row: Record<string, unknown>): ClientErrorKindRow => ({
  kind: String(row.kind ?? 'error'),
  hits: asNumber(row.hits),
});

const mapSignatureRow = (row: Record<string, unknown>): ClientErrorSignatureRow => ({
  message: String(row.message ?? 'Unknown error'),
  stackHash: String(row.stack_hash ?? row.stackHash ?? ''),
  hits: asNumber(row.hits),
  lastSeen: typeof row.last_seen === 'string' ? row.last_seen : undefined,
});

const mapRecentRow = (row: Record<string, unknown>): ClientErrorRecentRow => ({
  recordedAt: String(row.recorded_at ?? row.recordedAt ?? ''),
  kind: String(row.kind ?? 'error'),
  message: String(row.message ?? 'Unknown error'),
  stackHash: String(row.stack_hash ?? row.stackHash ?? ''),
  route: typeof row.route === 'string' ? row.route : null,
  source: typeof row.source === 'string' ? row.source : null,
});

const mapRows = <T>(
  value: unknown,
  mapper: (row: Record<string, unknown>) => T
): T[] => (Array.isArray(value) ? value.map((row) => mapper(row as Record<string, unknown>)) : []);

export const mapClientErrorStats = (payload: unknown): ClientErrorStats => {
  const data = (payload ?? {}) as Record<string, unknown>;
  const totals = (data.totals ?? {}) as Record<string, unknown>;
  return {
    days: asNumber(data.days, 30),
    totals: {
      hits: asNumber(totals.hits),
      uniqueSignatures: asNumber(totals.unique_signatures ?? totals.uniqueSignatures),
    },
    byDay: mapRows(data.byDay ?? data.by_day, mapDayRow),
    byRoute: mapRows(data.byRoute ?? data.by_route, mapRouteRow),
    byKind: mapRows(data.byKind ?? data.by_kind, mapKindRow),
    topErrors: mapRows(data.topErrors ?? data.top_errors, mapSignatureRow),
    recent: mapRows(data.recent, mapRecentRow),
  };
};

export const labelClientErrorKind = (kind: string): string => {
  switch (kind) {
    case 'rejection':
      return 'Unhandled promise';
    case 'boundary':
      return 'React boundary';
    default:
      return 'Runtime error';
  }
};
