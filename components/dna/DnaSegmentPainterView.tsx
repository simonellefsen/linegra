import React, { useMemo, useState } from 'react';
import {
  buildChromosomePaintModel,
  paintStyleForCluster,
  type PaintSegmentInput,
  type PaintedSegment,
} from '../../lib/dnaSegmentPainter';

interface DnaSegmentPainterViewProps {
  inputs: PaintSegmentInput[];
  minCentimorgans?: number;
  onSelectMatch?: (matchId: string) => void;
  selectedMatchId?: string | null;
  clusterLabelsByIndex?: Map<number, string>;
}

const formatBp = (value: number) => {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)} Mb`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(0)} kb`;
  return `${value} bp`;
};

const sharedCmByMatchId = (inputs: PaintSegmentInput[]) => {
  const map = new Map<string, number | null>();
  inputs.forEach((input) => map.set(input.matchId, input.sharedCentimorgans ?? null));
  return map;
};

const DnaSegmentPainterView: React.FC<DnaSegmentPainterViewProps> = ({
  inputs,
  minCentimorgans = 0,
  onSelectMatch,
  selectedMatchId = null,
  clusterLabelsByIndex,
}) => {
  const [hovered, setHovered] = useState<PaintedSegment | null>(null);
  const rows = useMemo(
    () => buildChromosomePaintModel(inputs, { minCentimorgans }),
    [inputs, minCentimorgans]
  );
  const matchSharedCm = useMemo(() => sharedCmByMatchId(inputs), [inputs]);

  if (!rows.length) {
    return (
      <p className="text-sm text-slate-500 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-6">
        No segments above {minCentimorgans} cM to paint on the chromosome map.
      </p>
    );
  }

  const laneHeight = 14;
  const laneGap = 4;
  const hoveredSharedCm = hovered ? matchSharedCm.get(hovered.matchId) : null;

  return (
    <div className="space-y-2 relative">
      {hovered && (
        <div className="sticky top-0 z-20 rounded-xl border border-slate-200 bg-white/95 px-3 py-2 text-xs text-slate-700 shadow-sm backdrop-blur">
          <p className="font-semibold text-slate-900">{hovered.matchLabel}</p>
          <p>
            Chr {hovered.chromosome} · {formatBp(hovered.start)}–{formatBp(hovered.end)} ·{' '}
            <span className="font-semibold">{hovered.centimorgans.toFixed(1)} cM</span>
          </p>
          {hoveredSharedCm != null && (
            <p className="text-slate-500">Match total · {hoveredSharedCm.toFixed(1)} cM shared</p>
          )}
          {hovered.clusterIndex !== null && (
            <p className="text-slate-500">
              {clusterLabelsByIndex?.get(hovered.clusterIndex) ?? `Cluster ${hovered.clusterIndex + 1}`}
            </p>
          )}
        </div>
      )}
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
                    onMouseEnter={() => setHovered(segment)}
                    onMouseLeave={() => setHovered((current) => (current === segment ? null : current))}
                    className={`absolute rounded-sm border ${style.fill} ${style.border} ${style.hover} transition-colors ${
                      isSelected ? 'ring-2 ring-blue-500 ring-offset-1 z-10' : 'z-0'
                    }`}
                    style={{
                      left: `${segment.leftFraction * 100}%`,
                      width: `${Math.max(segment.widthFraction * 100, 0.4)}%`,
                      top,
                      height: laneHeight,
                    }}
                    aria-label={`${segment.matchLabel}, ${segment.centimorgans.toFixed(1)} cM on chromosome ${segment.chromosome}`}
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
