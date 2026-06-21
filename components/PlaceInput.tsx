
import React, { useId, useState } from 'react';
import {
  MapPin,
  ChevronDown,
  ChevronUp,
  Globe,
  Map as MapIcon,
  Compass,
  History,
  Home,
  Hash,
  Layers,
  DoorOpen,
  Navigation,
  FileText,
  Church,
  Landmark
} from 'lucide-react';
import { StructuredPlace } from '../types';

interface PlaceInputProps {
  label: string;
  value: string | StructuredPlace;
  onChange: (val: StructuredPlace) => void;
  disabled?: boolean;
}

// Danish floor designations (stue = ground floor; 1. sal = the floor above it).
const FLOOR_SUGGESTIONS = ['Kælder', 'Stue', '1. sal', '2. sal', '3. sal', '4. sal', '5. sal', 'Kvist'];
// Old-style apartment / courtyard designations + door codes.
const APARTMENT_SUGGESTIONS = ['Baggården', 'Baghuset', 'Stuen', 'st.th.', 'st.tv.', '1.th.', '1.tv.'];

export const PlaceInput: React.FC<PlaceInputProps> = ({ label, value, onChange, disabled = false }) => {
  const [isExpanded, setIsExpanded] = useState(false);

  // Normalize value
  const place: StructuredPlace = typeof value === 'string'
    ? { fullText: value }
    : value || { fullText: '' };

  const updateField = (field: keyof StructuredPlace, val: string | number | undefined) => {
    const newPlace: StructuredPlace = { ...place, [field]: val ?? undefined };
    onChange(newPlace);
  };

  return (
    <div className="space-y-2 w-full group">
      <div className="flex items-center justify-between px-1">
        <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{label}</label>
        <button
          type="button"
          onClick={() => !disabled && setIsExpanded(!isExpanded)}
          disabled={disabled}
          className={`text-[10px] font-bold flex items-center gap-1 transition-colors ${
            disabled ? 'text-slate-300 cursor-not-allowed' : 'text-slate-400 hover:text-slate-900'
          }`}
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
          placeholder="e.g. Rosengade, Brædstrup, Ring Sogn, Tyrsting Herred, Skanderborg Amt, Danmark"
          disabled={disabled}
          readOnly={disabled}
          className={`w-full pl-11 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-slate-900/5 focus:border-slate-900 outline-none text-sm font-medium transition-all ${
            disabled ? 'opacity-70 cursor-not-allowed' : ''
          }`}
        />
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
                  disabled={disabled}
                  placeholder="e.g. Rosengade"
                />
              </div>
              <DetailField
                label="Nr. (No.)"
                icon={Hash}
                value={place.houseNumber}
                onChange={(v) => updateField('houseNumber', v)}
                disabled={disabled}
              />
              <div className="grid grid-cols-2 gap-2">
                <DetailField
                  label="Sal (Floor)"
                  icon={Layers}
                  value={place.floor}
                  onChange={(v) => updateField('floor', v)}
                  disabled={disabled}
                  suggestions={FLOOR_SUGGESTIONS}
                  hint="Stue = ground floor"
                />
                <DetailField
                  label="Lejl. (Apt)"
                  icon={DoorOpen}
                  value={place.apartment}
                  onChange={(v) => updateField('apartment', v)}
                  disabled={disabled}
                  suggestions={APARTMENT_SUGGESTIONS}
                  placeholder="Baggården"
                />
              </div>
            </div>
          </div>

          {/* Section 2: Locality hierarchy (Danish/Scandinavian) */}
          <div className="space-y-3 pt-4 border-t border-slate-200">
            <p className="text-[9px] font-black text-slate-400 uppercase tracking-[0.2em] mb-2 px-1">Sted (Locality — most specific first)</p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <DetailField
                label="Stednavn (Neighborhood)"
                icon={Compass}
                value={place.placeName}
                onChange={(v) => updateField('placeName', v)}
                disabled={disabled}
              />
              <DetailField
                label="By (City / Town)"
                icon={Home}
                value={place.city}
                onChange={(v) => updateField('city', v)}
                disabled={disabled}
              />
              <DetailField
                label="Sogn (Parish)"
                icon={Church}
                value={place.parish}
                onChange={(v) => updateField('parish', v)}
                disabled={disabled}
                placeholder="e.g. Ring Sogn"
              />
              <DetailField
                label="Herred / Kommune (Hundred)"
                icon={Landmark}
                value={place.hundred}
                onChange={(v) => updateField('hundred', v)}
                disabled={disabled}
                placeholder="e.g. Tyrsting Herred"
              />
              <DetailField
                label="Amt / Region (County)"
                icon={MapIcon}
                value={place.county}
                onChange={(v) => updateField('county', v)}
                disabled={disabled}
                placeholder="e.g. Skanderborg Amt"
              />
              <DetailField
                label="Land (Country)"
                icon={Globe}
                value={place.country}
                onChange={(v) => updateField('country', v)}
                disabled={disabled}
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
                disabled={disabled}
                placeholder="e.g. Københavns Amt"
              />
              <div className="grid grid-cols-2 gap-2">
                <DetailField
                  label="Lat (Latitude)"
                  icon={Navigation}
                  value={place.lat?.toString()}
                  onChange={(v) => updateField('lat', v ? parseFloat(v) : undefined)}
                  disabled={disabled}
                />
                <DetailField
                  label="Lng (Longitude)"
                  icon={Navigation}
                  value={place.lng?.toString()}
                  onChange={(v) => updateField('lng', v ? parseFloat(v) : undefined)}
                  disabled={disabled}
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
                disabled={disabled}
                className="w-full px-4 py-3 bg-white border border-slate-200 rounded-2xl text-xs font-medium focus:ring-2 focus:ring-slate-900/5 focus:border-slate-900 outline-none min-h-[80px] resize-none disabled:opacity-50"
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

interface DetailFieldProps {
  label: string;
  icon: React.ComponentType<React.SVGProps<SVGSVGElement>>;
  value?: string;
  onChange: (v: string) => void;
  placeholder?: string;
  disabled?: boolean;
  suggestions?: string[];
  hint?: string;
}

const DetailField: React.FC<DetailFieldProps> = ({ label, icon: Icon, value, onChange, placeholder, disabled, suggestions, hint }) => {
  const listId = useId();
  return (
    <div className="space-y-1">
      <label className="text-[9px] font-bold text-slate-400 uppercase tracking-widest px-1 truncate block">{label}</label>
      <div className="relative">
        <Icon className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-300" />
        <input
          type="text"
          value={value || ''}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          disabled={disabled}
          readOnly={disabled}
          list={suggestions ? listId : undefined}
          className={`w-full pl-9 pr-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-medium focus:ring-2 focus:ring-slate-900/5 focus:border-slate-900 outline-none transition-all ${
            disabled ? 'opacity-60 cursor-not-allowed bg-slate-50' : ''
          }`}
        />
        {suggestions ? (
          <datalist id={listId}>
            {suggestions.map((s) => (
              <option key={s} value={s} />
            ))}
          </datalist>
        ) : null}
      </div>
      {hint ? <p className="text-[9px] text-slate-300 px-1 leading-tight">{hint}</p> : null}
    </div>
  );
};
