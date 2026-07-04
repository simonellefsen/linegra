import React, { useMemo } from 'react';
import {
  buildChromosomePaintModel,
  paintStyleForCluster,
  type PaintSegmentInput,
} from '../../lib/dnaSegmentPainter';

interface DnaSegmentPainterViewProps {
  inputs: PaintSegmentInput[];
  minCentimorgans?: number;
  onSelectMatch?: (matchId: string) => void;
  selectedMatchId?: string | null;
}

const formatBp = (value: number) => {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)} Mb`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(0)} kb`;
  return `${value} bp`;
};

const DnaSegmentPainterView: React.FC<DnaSegmentPainterViewProps> = ({
  inputs,
  minCentimorgans = 0,
  onSelectMatch,
  selectedMatchId = null,
}) => {
  const rows = useMemo(
    () => buildChromosomePaintModel(inputs, { minCentimorgans }),
    [inputs, minCentimorgans]
  );

  if (!rows.length) {
    return (
      <p className="text-sm text-slate-500 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-6">
        No segments above {minCentimorgans} cM to paint on the chromosome map.
      </p>
    );
  }

  const laneHeight = 14;
  const laneGap = 4;

  return (
    <div className="space-y-2">
      {rows.map((row) => {
        const trackHeight = row.laneCount * laneHeight + (row.laneCount - 1) * laneGap + 8;
        return (
          <div key={row.chromosome} className="flex items-stretch gap-3">
            <div className="w-10 shrink-0 flex items-center justify-end">
              <span className="text-[10px] font-black uppercase tracking-wider text-slate-500">
                {row.chromosome}
              </span>
            </div>
            <div
              className="relative flex-1 rounded-xl border border-slate-200 bg-slate-50 overflow-hidden"
              style={{ minHeight: trackHeight }}
              title={`Chr ${row.chromosome} · max ${formatBp(row.maxPosition)}`}
            >
              {row.segments.map((segment, index) => {
                const style = paintStyleForCluster(segment.clusterIndex);
                const isSelected = selectedMatchId === segment.matchId;
                const top = 4 + segment.lane * (laneHeight + laneGap);
                return (
                  <button
                    key={`${segment.matchId}-${segment.chromosome}-${segment.start}-${index}`}
                    type="button"
                    onClick={() => onSelectMatch?.(segment.matchId)}
                    className={`absolute rounded-sm border ${style.fill} ${style.border} ${style.hover} transition-colors ${
                      isSelected ? 'ring-2 ring-blue-500 ring-offset-1 z-10' : 'z-0'
                    }`}
                    style={{
                      left: `${segment.leftFraction * 100}%`,
                      width: `${Math.max(segment.widthFraction * 100, 0.4)}%`,
                      top,
                      height: laneHeight,
                    }}
                    title={`${segment.matchLabel} · chr${segment.chromosome}:${formatBp(segment.start)}-${formatBp(segment.end)} · ${segment.centimorgans.toFixed(1)} cM${
                      segment.clusterIndex !== null ? ` · cluster ${segment.clusterIndex + 1}` : ''
                    }`}
                  />
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
};

export default DnaSegmentPainterView;
