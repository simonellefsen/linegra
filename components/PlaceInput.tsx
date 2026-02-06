
import React, { useState } from 'react';
import { 
  MapPin, 
  ChevronDown, 
  ChevronUp, 
  Sparkles, 
  Globe, 
  Map as MapIcon, 
  Compass, 
  Info, 
  Loader2, 
  History, 
  Home, 
  Hash, 
  Layers, 
  DoorOpen,
  Navigation,
  FileText
} from 'lucide-react';
import { StructuredPlace } from '../types';
import { parsePlaceString } from '../services/gemini';

interface PlaceInputProps {
  label: string;
  value: string | StructuredPlace;
  onChange: (val: StructuredPlace) => void;
}

export const PlaceInput: React.FC<PlaceInputProps> = ({ label, value, onChange }) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const [isParsing, setIsParsing] = useState(false);

  // Normalize value
  const place: StructuredPlace = typeof value === 'string' 
    ? { fullText: value } 
    : value || { fullText: '' };

  const updateField = (field: keyof StructuredPlace, val: any) => {
    const newPlace = { ...place, [field]: val };
    onChange(newPlace);
  };

  const handleSmartParse = async () => {
    if (!place.fullText) return;
    setIsParsing(true);
    const result = await parsePlaceString(place.fullText);
    onChange({ ...place, ...result });
    setIsParsing(false);
    setIsExpanded(true);
  };

  return (
    <div className="space-y-2 w-full group">
      <div className="flex items-center justify-between px-1">
        <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{label}</label>
        <button 
          type="button"
          onClick={() => setIsExpanded(!isExpanded)}
          className="text-[10px] font-bold text-slate-400 hover:text-slate-900 flex items-center gap-1 transition-colors"
        >
          {isExpanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
          {isExpanded ? 'Simple' : 'Details'}
        </button>
      </div>

      <div className="relative">
        <MapPin className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 group-focus-within:text-slate-900 transition-colors" />
        <input 
          type="text" 
          value={place.fullText}
          onChange={(e) => updateField('fullText', e.target.value)}
          placeholder="e.g. Christianshavn, Copenhagen, Denmark"
          className="w-full pl-11 pr-24 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-slate-900/5 focus:border-slate-900 outline-none text-sm font-medium transition-all"
        />
        <button 
          onClick={handleSmartParse}
          disabled={isParsing || !place.fullText}
          className="absolute right-2 top-1/2 -translate-y-1/2 px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-[9px] font-bold text-slate-600 hover:bg-slate-50 transition-all flex items-center gap-1.5 shadow-sm disabled:opacity-50"
        >
          {isParsing ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3 text-amber-500" />}
          AI Structure
        </button>
      </div>

      {isExpanded && (
        <div className="p-6 bg-slate-50/50 border border-slate-100 rounded-[28px] mt-2 space-y-6 animate-in slide-in-from-top-2 duration-200 shadow-inner">
          {/* Section 1: Street Address */}
          <div className="space-y-3">
            <p className="text-[9px] font-black text-slate-400 uppercase tracking-[0.2em] mb-2 px-1">Gadeadresse (Street Details)</p>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
              <div className="md:col-span-2">
                <DetailField 
                  label="Gade (Street)" 
                  icon={Home} 
                  value={place.street} 
                  onChange={(v) => updateField('street', v)} 
                  placeholder="e.g. Amagerbrogade"
                />
              </div>
              <DetailField 
                label="Nr. (No.)" 
                icon={Hash} 
                value={place.houseNumber} 
                onChange={(v) => updateField('houseNumber', v)} 
              />
              <div className="grid grid-cols-2 gap-2">
                 <DetailField 
                  label="Sal (Floor)" 
                  icon={Layers} 
                  value={place.floor} 
                  onChange={(v) => updateField('floor', v)} 
                />
                <DetailField 
                  label="Lejl. (Apt)" 
                  icon={DoorOpen} 
                  value={place.apartment} 
                  onChange={(v) => updateField('apartment', v)} 
                />
              </div>
            </div>
          </div>

          {/* Section 2: Administrative Layers */}
          <div className="space-y-3 pt-4 border-t border-slate-200">
            <p className="text-[9px] font-black text-slate-400 uppercase tracking-[0.2em] mb-2 px-1">Område & Region (Area & Region)</p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <DetailField 
                label="Stednavn (Neighborhood/Landmark)" 
                icon={Compass} 
                value={place.placeName} 
                onChange={(v) => updateField('placeName', v)} 
              />
              <DetailField 
                label="Sogn / By (Town / Parish)" 
                icon={Home} 
                value={place.city} 
                onChange={(v) => updateField('city', v)} 
              />
              <DetailField 
                label="Amt / Herred / Region" 
                icon={MapIcon} 
                value={place.county} 
                onChange={(v) => updateField('county', v)} 
              />
              <DetailField 
                label="Land (Country)" 
                icon={Globe} 
                value={place.country} 
                onChange={(v) => updateField('country', v)} 
              />
            </div>
          </div>
          
          {/* Section 3: Historical & Advanced */}
          <div className="space-y-4 pt-4 border-t border-slate-200">
            <p className="text-[9px] font-black text-slate-400 uppercase tracking-[0.2em] mb-2 px-1">Research & Historie (Advanced)</p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <DetailField 
                label="Historisk Navn (Historical Name)" 
                icon={History} 
                value={place.historicalName} 
                onChange={(v) => updateField('historicalName', v)} 
                placeholder="e.g. Københavns Amt"
              />
              <div className="grid grid-cols-2 gap-2">
                <DetailField 
                  label="Lat (Latitude)" 
                  icon={Navigation} 
                  value={place.lat?.toString()} 
                  onChange={(v) => updateField('lat', v ? parseFloat(v) : undefined)} 
                />
                <DetailField 
                  label="Lng (Longitude)" 
                  icon={Navigation} 
                  value={place.lng?.toString()} 
                  onChange={(v) => updateField('lng', v ? parseFloat(v) : undefined)} 
                />
              </div>
            </div>
            
            <div className="space-y-1.5">
              <label className="text-[9px] font-bold text-slate-400 uppercase tracking-widest px-1 flex items-center gap-2">
                <FileText className="w-3 h-3" /> Stednotater (Location Notes)
              </label>
              <textarea 
                value={place.notes || ''}
                onChange={(e) => updateField('notes', e.target.value)}
                placeholder="Extra details like 'Destroyed in fire' or 'Next to the town hall'..."
                className="w-full px-4 py-3 bg-white border border-slate-200 rounded-2xl text-xs font-medium focus:ring-2 focus:ring-slate-900/5 focus:border-slate-900 outline-none min-h-[80px] resize-none"
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

const DetailField: React.FC<{ 
  label: string; 
  icon: any; 
  value?: string; 
  onChange: (v: string) => void; 
  placeholder?: string 
}> = ({ label, icon: Icon, value, onChange, placeholder }) => (
  <div className="space-y-1">
    <label className="text-[9px] font-bold text-slate-400 uppercase tracking-widest px-1 truncate block">{label}</label>
    <div className="relative">
      <Icon className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-300" />
      <input 
        type="text" 
        value={value || ''}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full pl-9 pr-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-medium focus:ring-2 focus:ring-slate-900/5 focus:border-slate-900 outline-none transition-all"
      />
    </div>
  </div>
);
