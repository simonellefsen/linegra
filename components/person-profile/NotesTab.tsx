import React from 'react';
import { Link, Trash2, Plus } from 'lucide-react';
import { NOTE_TYPES } from './constants';
import { Note } from '../../types';

interface NotesTabProps {
  notes: Note[];
  availableEvents: string[];
  onAddNote: () => void;
  onUpdateNote: (id: string, updates: Partial<Note>) => void;
  onRemoveNote: (id: string) => void;
}

const NotesTab: React.FC<NotesTabProps> = ({ notes, availableEvents, onAddNote, onUpdateNote, onRemoveNote }) => (
  <div className="space-y-10 animate-in fade-in slide-in-from-bottom-2 duration-300">
    <div className="flex items-center justify-between">
      <p className="text-[11px] font-black text-slate-400 uppercase tracking-[0.25em]">Researcher Ledger</p>
      <button onClick={onAddNote} className="text-[9px] font-black text-blue-600 uppercase tracking-widest flex items-center gap-1.5">
        <Plus className="w-4 h-4" /> Add Entry
      </button>
    </div>
    <div className="space-y-6">
      {notes.map((note) => (
        <div key={note.id} className="p-6 bg-white rounded-[32px] border border-slate-100 shadow-sm transition-all hover:shadow-md space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <select
                value={note.type}
                onChange={(e) => onUpdateNote(note.id, { type: e.target.value as Note['type'] })}
                className="px-2 py-0.5 bg-amber-100 text-amber-700 text-[9px] font-black uppercase rounded-lg border-none outline-none cursor-pointer"
              >
                {NOTE_TYPES.map((type) => (
                  <option key={type} value={type}>
                    {type}
                  </option>
                ))}
              </select>
              <div className="flex items-center gap-1.5 px-2 py-0.5 bg-amber-50 rounded-lg border border-amber-100">
                <Link className="w-2.5 h-2.5 text-amber-600" />
                <select
                  value={note.event || 'General'}
                  onChange={(e) => onUpdateNote(note.id, { event: e.target.value })}
                  className="bg-transparent text-[10px] text-amber-600 font-black uppercase tracking-widest border-none outline-none cursor-pointer"
                >
                  {availableEvents.map((ev) => (
                    <option key={ev} value={ev}>
                      {ev}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{note.date || 'Today'}</span>
              <button onClick={() => onRemoveNote(note.id)} className="text-slate-300 hover:text-rose-500">
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          </div>
          <textarea
            value={note.text}
            onChange={(e) => onUpdateNote(note.id, { text: e.target.value })}
            className="w-full text-sm text-slate-700 leading-relaxed font-medium border-none outline-none bg-transparent min-h-[100px] resize-none"
            placeholder="Enter research observations, task lists, or discrepancy reports..."
          />
        </div>
      ))}
      {notes.length === 0 && <p className="text-center py-20 text-xs text-slate-400 italic">No entries found in the researcher ledger.</p>}
    </div>
  </div>
);

export default NotesTab;
