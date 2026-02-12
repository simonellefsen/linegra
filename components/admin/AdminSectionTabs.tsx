import React from 'react';

export type AdminSection = 'database' | 'trees' | 'gedcom' | 'dna';

interface AdminSectionTabsProps {
  section: AdminSection;
  onChange: (next: AdminSection) => void;
}

const TABS: Array<{ id: AdminSection; label: string }> = [
  { id: 'database', label: 'Database' },
  { id: 'trees', label: 'Trees' },
  { id: 'gedcom', label: 'GEDCOM' },
  { id: 'dna', label: 'DNA' },
];

const AdminSectionTabs: React.FC<AdminSectionTabsProps> = ({ section, onChange }) => (
  <div className="bg-white border border-slate-200 rounded-[32px] shadow-sm p-4 flex items-center gap-3">
    {TABS.map((tab) => (
      <button
        key={tab.id}
        onClick={() => onChange(tab.id)}
        className={`px-4 py-2 rounded-2xl text-xs font-black uppercase tracking-[0.2em] ${
          section === tab.id ? 'bg-slate-900 text-white' : 'text-slate-500 hover:bg-slate-100'
        }`}
      >
        {tab.label}
      </button>
    ))}
  </div>
);

export default AdminSectionTabs;
