import React, { useMemo } from 'react';
import { Activity } from 'lucide-react';
import {
  buildOverlayDaySeries,
  overlayBarWidthPercent,
  overlayChartAxisMax,
  type CrawlTrafficDayRow,
} from '../../lib/crawlTrafficCharts';

interface CrawlTrafficTrendChartProps {
  windowDays: number;
  botByDay: CrawlTrafficDayRow[];
  visitorByDay: CrawlTrafficDayRow[];
  botLabel?: string;
}

const CrawlTrafficTrendChart: React.FC<CrawlTrafficTrendChartProps> = ({
  windowDays,
  botByDay,
  visitorByDay,
  botLabel = 'Bots',
}) => {
  const series = useMemo(
    () => buildOverlayDaySeries(windowDays, botByDay, visitorByDay),
    [windowDays, botByDay, visitorByDay]
  );
  const axisMax = useMemo(() => overlayChartAxisMax(series), [series]);

  return (
    <div className="rounded-[28px] border border-slate-200 bg-white p-6 space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 flex items-center gap-2">
          <Activity className="w-4 h-4" />
          Daily trend (UTC)
        </p>
        <div className="flex flex-wrap items-center gap-4 text-[10px] font-bold uppercase tracking-widest text-slate-500">
          <span className="inline-flex items-center gap-2">
            <span className="inline-block h-2 w-4 rounded-full bg-violet-500/80" />
            {botLabel}
          </span>
          <span className="inline-flex items-center gap-2">
            <span className="inline-block h-2 w-4 rounded-full bg-slate-500/70" />
            Visitors
          </span>
          <span className="text-slate-400">Max {axisMax}</span>
        </div>
      </div>

      <div className="space-y-2 max-h-[28rem] overflow-y-auto pr-1">
        {series.map((row) => (
          <div key={row.day} className="flex items-center gap-3 text-xs">
            <span className="w-24 shrink-0 text-slate-500 font-mono">{row.day}</span>
            <div className="flex-1 flex flex-col gap-1 justify-center min-w-0">
              <div className="h-2 rounded-full bg-slate-100 overflow-hidden">
                <div
                  className="h-full rounded-full bg-violet-500/80 transition-all"
                  style={{ width: `${overlayBarWidthPercent(row.botHits, axisMax)}%` }}
                />
              </div>
              <div className="h-2 rounded-full bg-slate-100 overflow-hidden">
                <div
                  className="h-full rounded-full bg-slate-500/70 transition-all"
                  style={{ width: `${overlayBarWidthPercent(row.visitorHits, axisMax)}%` }}
                />
              </div>
            </div>
            <span className="w-16 shrink-0 text-right font-bold text-slate-700 tabular-nums">
              {row.botHits}
              <span className="text-slate-300">/</span>
              {row.visitorHits}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
};

export default CrawlTrafficTrendChart;
