import React from 'react';
import { Lock, Trash2, Dna } from 'lucide-react';
import { DNATest } from '../../types';
import { DNA_VENDORS, DNA_TEST_TYPES } from './constants';

interface DNATabProps {
  dnaTests: DNATest[];
  canAccessDNA: boolean;
  onAddTest: () => void;
  onUpdateTest: (id: string, updates: Partial<DNATest>) => void;
  onRemoveTest: (id: string) => void;
}

const DNATab: React.FC<DNATabProps> = ({ dnaTests, canAccessDNA, onAddTest, onUpdateTest, onRemoveTest }) => (
  <div className="space-y-10 animate-in fade-in slide-in-from-bottom-2 duration-300">
    <div className="flex items-center justify-between">
      <p className="text-[11px] font-black text-slate-400 uppercase tracking-[0.25em]">Genetic Archive</p>
      <button onClick={onAddTest} className="text-[9px] font-black text-blue-600 uppercase tracking-widest flex items-center gap-1.5">
        <Dna className="w-4 h-4" /> Log Result
      </button>
    </div>
    {!canAccessDNA ? (
      <div className="py-24 text-center space-y-4">
        <Lock className="w-12 h-12 text-slate-200 mx-auto" />
        <p className="text-[11px] text-slate-400 font-bold uppercase tracking-[0.2em]">Restricted Access Record</p>
        <p className="text-xs text-slate-400 max-w-[200px] mx-auto italic">
          Genetic data is only available to project administrators and verified descendants.
        </p>
      </div>
    ) : (
      <div className="space-y-6">
        {dnaTests.map((test) => (
          <div key={test.id} className="bg-slate-900 rounded-[40px] p-8 text-white relative overflow-hidden group/dna shadow-2xl space-y-6">
            <button
              onClick={() => onRemoveTest(test.id)}
              className="absolute top-4 right-6 text-white/20 hover:text-rose-400 opacity-0 group-hover/dna:opacity-100 transition-all"
            >
              <Trash2 className="w-4 h-4" />
            </button>
            <h4 className="text-2xl font-serif font-bold flex items-center gap-3">
              <Dna className="w-7 h-7 text-blue-400" />
              <select
                value={test.vendor}
                onChange={(e) => onUpdateTest(test.id, { vendor: e.target.value as DNATest['vendor'] })}
                className="bg-transparent border-none outline-none font-serif text-white cursor-pointer"
              >
                {DNA_VENDORS.map((vendor) => (
                  <option key={vendor} value={vendor} className="text-slate-900">
                    {vendor}
                  </option>
                ))}
              </select>
            </h4>
            <div className="grid grid-cols-2 gap-4">
              <div className="p-4 bg-white/5 border border-white/10 rounded-3xl">
                <p className="text-[10px] text-slate-400 font-black uppercase mb-1">Test Type</p>
                <select
                  value={test.type}
                  onChange={(e) => onUpdateTest(test.id, { type: e.target.value as DNATest['type'] })}
                  className="bg-transparent border-none text-lg font-serif font-bold text-white outline-none w-full cursor-pointer"
                >
                  {DNA_TEST_TYPES.map((type) => (
                    <option key={type} value={type} className="text-slate-900">
                      {type}
                    </option>
                  ))}
                </select>
              </div>
              <div className="p-4 bg-white/5 border border-white/10 rounded-3xl">
                <p className="text-[10px] text-slate-400 font-black uppercase mb-1">Haplogroup</p>
                <input
                  value={test.haplogroup || ''}
                  onChange={(e) => onUpdateTest(test.id, { haplogroup: e.target.value })}
                  placeholder="e.g. R-M269"
                  className="bg-transparent border-none text-lg font-serif font-bold text-white outline-none w-full"
                />
              </div>
            </div>
            <div className="mt-4 p-4 bg-white/5 border border-white/10 rounded-3xl">
              <p className="text-[10px] text-slate-400 font-black uppercase mb-1">Internal Notes</p>
              <textarea
                value={test.notes || ''}
                onChange={(e) => onUpdateTest(test.id, { notes: e.target.value })}
                placeholder="Researcher observations..."
                className="bg-transparent border-none text-xs font-medium text-white/70 outline-none w-full resize-none min-h-[40px]"
              />
            </div>
          </div>
        ))}
        {dnaTests.length === 0 && <p className="text-center py-20 text-xs text-slate-400 italic">No genetic records logged in this archive.</p>}
      </div>
    )}
  </div>
);

export default DNATab;
