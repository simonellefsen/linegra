import React from 'react';

interface DetailEditProps {
  label: string;
  value?: string;
  onChange: (value: string) => void;
  placeholder?: string;
}

const DetailEdit: React.FC<DetailEditProps> = ({ label, value, onChange, placeholder }) => (
  <div className="space-y-1">
    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest px-1 block">{label}</label>
    <input
      value={value || ''}
      onChange={(event) => onChange(event.target.value)}
      placeholder={placeholder}
      className="w-full px-4 py-2.5 bg-white border border-slate-200 rounded-xl text-sm font-medium focus:ring-2 focus:ring-slate-900/5 focus:border-slate-900 outline-none transition-all shadow-sm"
    />
  </div>
);

export default DetailEdit;
