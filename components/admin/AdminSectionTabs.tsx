import React from 'react';

export type AdminSection = 'database' | 'trees' | 'gedcom' | 'dna' | 'books' | 'research' | 'traffic';

interface AdminSectionTabsProps {
  section: AdminSection;
  onChange: (next: AdminSection) => void;
  showCrawlTraffic?: boolean;
}

const BASE_TABS: Array<{ id: AdminSection; label: string }> = [
  { id: 'database', label: 'Database' },
  { id: 'trees', label: 'Trees' },
  { id: 'gedcom', label: 'GEDCOM' },
  { id: 'dna', label: 'DNA' },
  { id: 'books', label: 'Books' },
  { id: 'research', label: 'Research' },
];

const AdminSectionTabs: React.FC<AdminSectionTabsProps> = ({
  section,
  onChange,
  showCrawlTraffic = false,
}) => {
  const tabs = showCrawlTraffic
    ? [...BASE_TABS, { id: 'traffic' as const, label: 'Traffic' }]
    : BASE_TABS;

  return (
  <div className="bg-white border border-slate-200 rounded-[32px] shadow-sm p-4 flex flex-wrap items-center gap-3">
    {tabs.map((tab) => (
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
};

export default AdminSectionTabs;
