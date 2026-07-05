import React, { useMemo } from 'react';
import { FileCode2 } from 'lucide-react';
import {
  buildAgentFormatBreakdowns,
  CRAWL_FORMAT_COLORS,
  CRAWL_FORMAT_LABELS,
  CRAWL_FORMAT_ORDER,
  formatSharePercent,
  type CrawlTrafficAgentFormatRow,
} from '../../lib/crawlFormatBreakdown';

interface CrawlTrafficFormatBreakdownProps {
  rows: CrawlTrafficAgentFormatRow[];
  agentOrder: string[];
  agentFilter?: string | null;
  rawRetentionDays: number;
  labelAgent: (agentBucket: string) => string;
}

const CrawlTrafficFormatBreakdown: React.FC<CrawlTrafficFormatBreakdownProps> = ({
  rows,
  agentOrder,
  agentFilter,
  rawRetentionDays,
  labelAgent,
}) => {
  const breakdowns = useMemo(
    () =>
      buildAgentFormatBreakdowns(rows, agentOrder).filter(
        (row) => !agentFilter || row.agentBucket === agentFilter
      ),
    [rows, agentOrder, agentFilter]
  );

  if (!breakdowns.length) {
    return (
      <div className="rounded-2xl border border-white bg-white p-4">
        <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 flex items-center gap-2">
          <FileCode2 className="w-4 h-4" />
          Response formats by agent
        </p>
        <p className="text-sm text-slate-400 mt-3">No format data in the raw event tail yet.</p>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-white bg-white p-4 space-y-4">
      <div className="space-y-1">
        <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 flex items-center gap-2">
          <FileCode2 className="w-4 h-4" />
          Response formats by agent
        </p>
        <p className="text-xs text-slate-500">
          Raw tail only (last {rawRetentionDays} days) — measures U7/U8 HTML, Markdown, and JSON adoption.
        </p>
      </div>

      <div className="flex flex-wrap gap-3 text-[10px] font-bold uppercase tracking-widest text-slate-500">
        {CRAWL_FORMAT_ORDER.map((format) => (
          <span key={format} className="inline-flex items-center gap-2">
            <span className={`inline-block h-2 w-4 rounded-full ${CRAWL_FORMAT_COLORS[format]}`} />
            {CRAWL_FORMAT_LABELS[format]}
          </span>
        ))}
      </div>

      <ul className="space-y-4">
        {breakdowns.map((row) => (
          <li key={row.agentBucket} className="space-y-2">
            <div className="flex items-center justify-between gap-3 text-sm">
              <span className="font-medium text-slate-800">{labelAgent(row.agentBucket)}</span>
              <span className="text-xs font-bold text-slate-500 tabular-nums">{row.totalHits} hits</span>
            </div>
            <div className="h-3 rounded-full bg-slate-100 overflow-hidden flex">
              {CRAWL_FORMAT_ORDER.map((format) => {
                const hits = row.formatHits[format];
                if (!hits) return null;
                const width = formatSharePercent(hits, row.totalHits);
                return (
                  <div
                    key={format}
                    className={`h-full ${CRAWL_FORMAT_COLORS[format]}`}
                    style={{ width: `${width}%` }}
                    title={`${CRAWL_FORMAT_LABELS[format]}: ${hits} (${width}%)`}
                  />
                );
              })}
            </div>
            <p className="text-[11px] text-slate-500">
              {CRAWL_FORMAT_ORDER.filter((format) => row.formatHits[format] > 0)
                .map(
                  (format) =>
                    `${CRAWL_FORMAT_LABELS[format]} ${formatSharePercent(row.formatHits[format], row.totalHits)}%`
                )
                .join(' · ')}
            </p>
          </li>
        ))}
      </ul>
    </div>
  );
};

export default CrawlTrafficFormatBreakdown;
