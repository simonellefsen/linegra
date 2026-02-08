
import React from 'react';
import { Person, FamilyTree } from '../types';
import { 
  Calendar, 
  HelpCircle,
  Clock,
  ChevronRight,
  TrendingUp,
  Image as ImageIcon
} from 'lucide-react';
import { getAvatarForPerson } from '../lib/avatar';

interface TreeLandingPageProps {
  tree: FamilyTree;
  whatsNew: Person[];
  anniversaries: Person[];
  mostWanted: Person[];
  mediaHighlights: Person[];
  onPersonSelect: (person: Person) => void;
  isAdmin: boolean;
  loading?: boolean;
  error?: string | null;
}

const TreeLandingPage: React.FC<TreeLandingPageProps> = ({
  tree,
  whatsNew,
  anniversaries,
  mostWanted,
  mediaHighlights,
  onPersonSelect,
  isAdmin,
  loading,
  error
}) => {

  return (
    <div className="space-y-8 pb-24">
      {/* Hero Header */}
      <div className="relative overflow-hidden rounded-[32px] md:rounded-[40px] bg-slate-900 text-white p-8 sm:p-10 lg:p-12 shadow-2xl">
        <div className="absolute top-0 right-0 w-1/2 h-full opacity-10 pointer-events-none hidden sm:block">
          <svg viewBox="0 0 400 400" className="w-full h-full">
            <path d="M50 350 C 100 200, 300 200, 350 50" stroke="white" strokeWidth="2" fill="none" />
            <circle cx="50" cy="350" r="10" fill="white" />
            <circle cx="350" cy="50" r="10" fill="white" />
          </svg>
        </div>
        
        <div className="relative z-10 max-w-2xl">
          <div className="flex items-center gap-3 mb-6">
            <span className="px-3 py-1 bg-white/20 backdrop-blur rounded-full text-[10px] font-bold uppercase tracking-widest">Active Tree</span>
            {isAdmin && <button className="px-3 py-1 bg-amber-400 text-amber-900 rounded-full text-[10px] font-bold uppercase tracking-widest hover:bg-amber-300 transition-colors">Admin Settings</button>}
          </div>
          <h1 className="text-3xl sm:text-4xl lg:text-5xl font-serif font-bold mb-3">{tree.name}</h1>
          <p className="text-slate-300 text-base sm:text-lg leading-relaxed max-w-2xl">{tree.description}</p>
          <div className="mt-6 flex flex-col sm:flex-row gap-3 sm:gap-4">
            <button className="bg-white text-slate-900 px-6 py-3 rounded-2xl font-bold flex items-center justify-center gap-2 hover:bg-slate-100 transition-all shadow-lg active:scale-95">
              Explore Tree
              <ChevronRight className="w-4 h-4" />
            </button>
            <button className="bg-slate-800 border border-slate-700 text-white px-6 py-3 rounded-2xl font-bold hover:bg-slate-700 transition-all">
              Statistics
            </button>
          </div>
        </div>
      </div>

      {/* Widgets Grid */}
      {error && (
        <div className="bg-rose-50 border border-rose-200 text-rose-600 px-6 py-4 rounded-[24px] text-sm">
          {error}
        </div>
      )}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4 sm:gap-6">
        
        {/* What's New */}
        <section className="bg-white p-6 sm:p-8 rounded-[28px] border border-slate-200 shadow-sm flex flex-col h-full">
          <div className="flex items-center justify-between mb-6">
            <h3 className="flex items-center gap-2 font-serif font-bold text-xl text-slate-900">
              <Clock className="w-5 h-5 text-blue-500" /> What's New
            </h3>
            <TrendingUp className="w-4 h-4 text-slate-300" />
          </div>
          <div className="space-y-4 flex-1">
            {loading && !whatsNew.length ? (
              <p className="text-slate-400 text-sm italic">Fetching latest additions…</p>
            ) : whatsNew.length ? (
              whatsNew.map(p => (
                <div 
                  key={p.id} 
                  onClick={() => onPersonSelect(p)}
                  className="flex items-center gap-3 p-2 hover:bg-slate-50 rounded-2xl transition-all cursor-pointer group"
                >
                  <div className="w-10 h-10 rounded-xl overflow-hidden bg-slate-100 shrink-0">
                    <img src={getAvatarForPerson(p)} className="w-full h-full object-cover" />
                  </div>
                  <div className="min-w-0">
                    <p className="font-bold text-slate-900 truncate group-hover:text-blue-600 transition-colors">{p.firstName} {p.lastName}</p>
                    <p className="text-[10px] text-slate-400 uppercase font-bold tracking-tighter">Added {new Date(p.updatedAt).toLocaleDateString()}</p>
                  </div>
                </div>
              ))
            ) : (
              <p className="text-slate-400 text-sm italic">No recent additions yet.</p>
            )}
          </div>
          <button className="mt-6 text-sm font-bold text-slate-400 hover:text-slate-900 transition-colors text-center w-full">View History</button>
        </section>

        {/* Calendar / Anniversaries */}
        <section className="bg-white p-6 sm:p-8 rounded-[28px] border border-slate-200 shadow-sm flex flex-col h-full">
          <div className="flex items-center justify-between mb-6">
            <h3 className="flex items-center gap-2 font-serif font-bold text-xl text-slate-900">
              <Calendar className="w-5 h-5 text-rose-500" /> This Month
            </h3>
          </div>
          <div className="space-y-4 flex-1">
            {loading && !anniversaries.length ? (
              <p className="text-slate-400 text-sm italic py-4">Loading calendar…</p>
            ) : anniversaries.length > 0 ? anniversaries.map(p => (
              <button
                key={p.id}
                onClick={() => onPersonSelect(p)}
                className="w-full text-left p-4 bg-rose-50 rounded-2xl border border-rose-100/50 hover:border-rose-200 transition-all cursor-pointer"
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[10px] font-bold text-rose-600 uppercase">Birthday</span>
                  <span className="text-[10px] font-bold text-rose-400 uppercase">{new Date(p.birthDate!).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>
                </div>
                <p className="font-bold text-slate-900 group-hover:text-rose-700 transition-colors">{p.firstName} {p.lastName}</p>
              </button>
            )) : (
              <p className="text-slate-400 text-sm italic py-4">No events found for this month.</p>
            )}
          </div>
          <button className="mt-6 text-sm font-bold text-slate-400 hover:text-slate-900 transition-colors text-center w-full">Open Calendar</button>
        </section>

        {/* Most Wanted (Missing Data) */}
        <section className="bg-white p-6 sm:p-8 rounded-[28px] border border-slate-200 shadow-sm flex flex-col h-full">
          <div className="flex items-center justify-between mb-6">
            <h3 className="flex items-center gap-2 font-serif font-bold text-xl text-slate-900">
              <HelpCircle className="w-5 h-5 text-amber-500" /> Most Wanted
            </h3>
          </div>
          <div className="space-y-4 flex-1">
            {loading && !mostWanted.length ? (
              <p className="text-slate-400 text-sm italic">Scanning for research targets…</p>
            ) : mostWanted.length ? (
              mostWanted.map(p => (
                <div 
                  key={p.id} 
                  onClick={() => onPersonSelect(p)}
                  className="flex items-center gap-3 p-2 hover:bg-slate-50 rounded-2xl transition-all cursor-pointer group"
                >
                  <div className="w-10 h-10 rounded-xl overflow-hidden bg-amber-50 flex items-center justify-center shrink-0">
                    <HelpCircle className="w-5 h-5 text-amber-500" />
                  </div>
                  <div>
                    <p className="font-bold text-slate-900">{p.firstName} {p.lastName}</p>
                    <div className="flex gap-1">
                      {!p.birthDate && <span className="text-[8px] bg-slate-100 px-1 rounded uppercase font-bold text-slate-400">Date</span>}
                      {!p.photoUrl && <span className="text-[8px] bg-slate-100 px-1 rounded uppercase font-bold text-slate-400">Media</span>}
                    </div>
                  </div>
                </div>
              ))
            ) : (
              <p className="text-slate-400 text-sm italic">No open research tasks.</p>
            )}
          </div>
          <button className="mt-6 text-sm font-bold text-slate-400 hover:text-slate-900 transition-colors text-center w-full">View Research Tasks</button>
        </section>

        {/* Media Highlights / Random Photos */}
        <section className="bg-white p-6 sm:p-8 rounded-[28px] border border-slate-200 shadow-sm flex flex-col h-full">
          <div className="flex items-center justify-between mb-6">
            <h3 className="flex items-center gap-2 font-serif font-bold text-xl text-slate-900">
              <ImageIcon className="w-5 h-5 text-emerald-500" /> Random Media
            </h3>
          </div>
          <div className="grid grid-cols-2 gap-3 flex-1">
            {loading && !mediaHighlights.length ? (
              <div className="col-span-2 text-center text-slate-400 text-sm italic">Collecting media…</div>
            ) : mediaHighlights.length ? (
              mediaHighlights.map(p => (
                <div 
                  key={p.id} 
                  className="aspect-square rounded-2xl overflow-hidden bg-slate-100 cursor-pointer hover:scale-105 transition-transform shadow-sm"
                  onClick={() => onPersonSelect(p)}
                >
                  <img src={p.photoUrl} className="w-full h-full object-cover grayscale hover:grayscale-0 transition-all duration-500" />
                </div>
              ))
            ) : (
              <div className="col-span-2 text-center text-slate-400 text-sm italic">Add photos to surface highlights here.</div>
            )}
          </div>
          <button className="mt-6 text-sm font-bold text-slate-400 hover:text-slate-900 transition-colors text-center w-full">Browse Gallery</button>
        </section>

      </div>
    </div>
  );
};

export default TreeLandingPage;
