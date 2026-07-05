// U18h — fixed-window daily overlay series for the traffic panel charts.

export interface CrawlTrafficDayRow {
  day: string;
  hits: number;
}

export interface CrawlTrafficOverlayDay {
  day: string;
  botHits: number;
  visitorHits: number;
}

export const listUtcDaysInWindow = (windowDays: number, anchor = new Date()): string[] => {
  const normalizedDays = Math.max(1, Math.floor(windowDays));
  const end = new Date(Date.UTC(anchor.getUTCFullYear(), anchor.getUTCMonth(), anchor.getUTCDate()));
  const days: string[] = [];
  for (let offset = normalizedDays - 1; offset >= 0; offset -= 1) {
    const day = new Date(end);
    day.setUTCDate(end.getUTCDate() - offset);
    days.push(day.toISOString().slice(0, 10));
  }
  return days;
};

export const hitsByDay = (rows: CrawlTrafficDayRow[]): Map<string, number> =>
  new Map(rows.map((row) => [row.day, row.hits]));

export const buildOverlayDaySeries = (
  windowDays: number,
  botByDay: CrawlTrafficDayRow[],
  visitorByDay: CrawlTrafficDayRow[],
  anchor = new Date()
): CrawlTrafficOverlayDay[] => {
  const botMap = hitsByDay(botByDay);
  const visitorMap = hitsByDay(visitorByDay);
  return listUtcDaysInWindow(windowDays, anchor)
    .map((day) => ({
      day,
      botHits: botMap.get(day) ?? 0,
      visitorHits: visitorMap.get(day) ?? 0,
    }))
    .reverse();
};

export const overlayChartAxisMax = (series: CrawlTrafficOverlayDay[]): number =>
  Math.max(1, ...series.flatMap((row) => [row.botHits, row.visitorHits]));

export const overlayBarWidthPercent = (hits: number, axisMax: number): number =>
  hits <= 0 || axisMax <= 0 ? 0 : (hits / axisMax) * 100;
