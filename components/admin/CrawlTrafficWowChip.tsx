import React from 'react';
import { formatWeekOverWeekDelta } from '../../lib/crawlTrafficWow';
import type { WeekOverWeekDelta } from '../../lib/crawlTrafficWow';

const TONE_CLASSES: Record<'up' | 'down' | 'flat' | 'new', string> = {
  up: 'text-emerald-700 bg-emerald-50 border-emerald-100',
  down: 'text-rose-700 bg-rose-50 border-rose-100',
  flat: 'text-slate-500 bg-slate-50 border-slate-100',
  new: 'text-violet-700 bg-violet-50 border-violet-100',
};

const CrawlTrafficWowChip: React.FC<{ delta: WeekOverWeekDelta }> = ({ delta }) => {
  const formatted = formatWeekOverWeekDelta(delta);
  return (
    <span
      className={`inline-flex mt-2 rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${TONE_CLASSES[formatted.tone]}`}
    >
      {formatted.label}
    </span>
  );
};

export default CrawlTrafficWowChip;
