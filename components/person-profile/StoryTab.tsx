import React from 'react';
import { Sparkles } from 'lucide-react';

interface StoryTabProps {
  bio?: string | null;
}

const StoryTab: React.FC<StoryTabProps> = ({ bio }) => (
  <div className="space-y-8 animate-in fade-in slide-in-from-bottom-2 duration-300">
    <div className="flex items-center justify-between">
      <p className="text-[11px] font-black text-slate-400 uppercase tracking-[0.25em]">Narrative Archive</p>
      <button className="text-[9px] font-black text-blue-600 uppercase tracking-widest flex items-center gap-1.5">
        <Sparkles className="w-3.5 h-3.5" /> AI Rewrite
      </button>
    </div>
    <div className="prose prose-slate prose-lg max-w-none text-slate-700 leading-relaxed font-serif whitespace-pre-wrap first-letter:text-6xl first-letter:font-bold first-letter:mr-3 first-letter:float-left first-letter:text-slate-900 bg-white p-8 rounded-[40px] border border-slate-100 shadow-sm">
      {bio || 'Ancestral biography text has not yet been transcribed into the digital archive.'}
    </div>
  </div>
);

export default StoryTab;
