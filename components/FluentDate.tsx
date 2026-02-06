
import React from 'react';
import { Clock, HelpCircle, History, ArrowRightLeft } from 'lucide-react';

interface FluentDateDisplayProps {
  dateString?: string;
  className?: string;
  large?: boolean;
}

export const FluentDateDisplay: React.FC<FluentDateDisplayProps> = ({ dateString, className = '', large = false }) => {
  if (!dateString) return <span className="text-slate-400 italic">Unknown Date</span>;

  const lower = dateString.toLowerCase();
  const isApproximation = lower.includes('abt') || lower.includes('ca') || lower.includes('circa') || lower.includes('approx');
  const isRange = lower.includes('bet') || lower.includes('between') || lower.includes('-') || lower.includes('to');
  const hasTime = /\d{1,2}:\d{2}/.test(dateString);

  return (
    <div className={`inline-flex items-center gap-2 ${className}`}>
      {isApproximation && <HelpCircle className={`${large ? 'w-4 h-4' : 'w-3 h-3'} text-amber-500`} />}
      {isRange && <ArrowRightLeft className={`${large ? 'w-4 h-4' : 'w-3 h-3'} text-blue-500`} />}
      {hasTime && <Clock className={`${large ? 'w-4 h-4' : 'w-3 h-3'} text-emerald-500`} />}
      
      <span className={`
        ${isApproximation ? 'italic text-slate-600' : 'text-slate-800'}
        ${isRange ? 'bg-blue-50 px-2 py-0.5 rounded-md border border-blue-100' : ''}
        ${large ? 'text-lg font-serif font-bold' : 'text-sm font-medium'}
      `}>
        {dateString}
      </span>
    </div>
  );
};

export const FluentDateInput: React.FC<{
  value: string;
  onChange: (val: string) => void;
  placeholder?: string;
  label?: string;
}> = ({ value, onChange, placeholder, label }) => {
  const helpers = ['Abt', 'Circa', 'Bet', 'Unknown'];

  return (
    <div className="space-y-1.5 w-full">
      <div className="flex items-center justify-between px-1">
        {label && <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{label}</label>}
        <div className="flex gap-1">
          {helpers.map(h => (
            <button
              key={h}
              type="button"
              onClick={() => onChange(h === 'Unknown' ? 'Unknown' : `${h} ${value}`.trim())}
              className="px-2 py-0.5 bg-slate-100 hover:bg-slate-200 text-[9px] font-bold text-slate-500 rounded uppercase tracking-tighter transition-colors"
            >
              +{h}
            </button>
          ))}
        </div>
      </div>
      <div className="relative group">
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder || "e.g. Abt Jan 1880"}
          className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-slate-900/5 focus:border-slate-900 outline-none transition-all text-sm font-medium"
        />
        <div className="absolute right-3 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
          <History className="w-4 h-4 text-slate-300" />
        </div>
      </div>
    </div>
  );
};
