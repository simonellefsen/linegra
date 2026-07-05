import React from 'react';
import { Dna } from 'lucide-react';

interface DnaPersonBadgeProps {
  matchCount: number;
  strongestCm?: number;
  onClick?: (event: React.MouseEvent) => void;
}

const DnaPersonBadge: React.FC<DnaPersonBadgeProps> = ({ matchCount, strongestCm, onClick }) => {
  const tooltip = strongestCm
    ? `${matchCount} DNA match${matchCount === 1 ? '' : 'es'} · strongest ${Math.round(strongestCm)} cM`
    : `${matchCount} DNA match${matchCount === 1 ? '' : 'es'}`;

  const className =
    'absolute top-2 right-2 inline-flex flex-col items-center justify-center gap-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 px-2 py-0.5 pointer-events-auto';

  if (onClick) {
    return (
      <button
        type="button"
        title={tooltip}
        aria-label={`${tooltip}. Open DNA panel.`}
        onClick={(event) => {
          event.stopPropagation();
          onClick(event);
        }}
        className={`${className} hover:bg-emerald-100 hover:border-emerald-300 cursor-pointer`}
      >
        <span className="inline-flex items-center gap-1">
          <Dna className="w-3 h-3" />
          <span className="text-[9px] font-black leading-none">{matchCount}</span>
        </span>
        {strongestCm ? (
          <span className="text-[8px] font-bold leading-none opacity-80">{Math.round(strongestCm)}cM</span>
        ) : null}
      </button>
    );
  }

  return (
    <div className={className} title={tooltip}>
      <span className="inline-flex items-center gap-1">
        <Dna className="w-3 h-3" />
        <span className="text-[9px] font-black leading-none">{matchCount}</span>
      </span>
      {strongestCm ? (
        <span className="text-[8px] font-bold leading-none opacity-80">{Math.round(strongestCm)}cM</span>
      ) : null}
    </div>
  );
};

export default DnaPersonBadge;
