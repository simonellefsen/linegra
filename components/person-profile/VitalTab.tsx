import React from 'react';
import {
  Library,
  FileText,
  Image as ImageIcon,
  Plus,
  Skull,
  Heart,
  Home,
  History,
  Trash2,
  GraduationCap,
  Sword,
  PlaneLanding,
  PlaneTakeoff,
  Calendar,
  Fingerprint,
} from 'lucide-react';
import DetailEdit from './DetailEdit';
import { FluentDateInput } from '../FluentDate';
import { PlaceInput } from '../PlaceInput';
import { ALT_NAME_TYPES, DEATH_CATEGORIES, EVENT_TYPES } from './constants';
import { AlternateName, DeathCauseCategory, PersonEvent, StructuredPlace } from '../../types';

interface VitalTabProps {
  firstName: string;
  lastName: string;
  maidenName: string;
  onFirstNameChange: (value: string) => void;
  onLastNameChange: (value: string) => void;
  onMaidenNameChange: (value: string) => void;
  altNames: AlternateName[];
  onAddAltName: () => void;
  onUpdateAltName: (index: number, field: keyof AlternateName, value: string) => void;
  onRemoveAltName: (index: number) => void;
  birthDate: string;
  onBirthDateChange: (value: string) => void;
  birthPlace: string | StructuredPlace;
  onBirthPlaceChange: (value: string | StructuredPlace) => void;
  deathDate: string;
  onDeathDateChange: (value: string) => void;
  deathPlace: string | StructuredPlace;
  onDeathPlaceChange: (value: string | StructuredPlace) => void;
  residenceAtDeath: string | StructuredPlace;
  onResidenceAtDeathChange: (value: string | StructuredPlace) => void;
  deathCause: string;
  onDeathCauseChange: (value: string) => void;
  deathCategory: DeathCauseCategory;
  onDeathCategoryChange: (value: DeathCauseCategory) => void;
  burialDate: string;
  onBurialDateChange: (value: string) => void;
  burialPlace: string | StructuredPlace;
  onBurialPlaceChange: (value: string | StructuredPlace) => void;
  events: PersonEvent[];
  onAddEvent: () => void;
  onUpdateEvent: (id: string, field: keyof PersonEvent, value: any) => void;
  onRemoveEvent: (id: string) => void;
  onAddSource: (eventLabel?: string) => void;
  onNotesBadgeClick: (eventLabel: string) => void;
  getSourceCountForEvent: (eventLabel: string) => number;
  getNoteCountForEvent: (eventLabel: string) => number;
  getMediaCountForEvent: (eventLabel: string) => number;
}

const getEventIcon = (type: string) => {
  switch (type.toLowerCase()) {
    case 'residence':
      return Home;
    case 'education':
      return GraduationCap;
    case 'military service':
      return Sword;
    case 'immigration':
      return PlaneLanding;
    case 'emigration':
      return PlaneTakeoff;
    case 'baptism':
    case 'christening':
      return Heart;
    case 'burial':
      return Home;
    case 'probate':
      return FileText;
    default:
      return Calendar;
  }
};

const VitalTab: React.FC<VitalTabProps> = ({
  firstName,
  lastName,
  maidenName,
  onFirstNameChange,
  onLastNameChange,
  onMaidenNameChange,
  altNames,
  onAddAltName,
  onUpdateAltName,
  onRemoveAltName,
  birthDate,
  onBirthDateChange,
  birthPlace,
  onBirthPlaceChange,
  deathDate,
  onDeathDateChange,
  deathPlace,
  onDeathPlaceChange,
  residenceAtDeath,
  onResidenceAtDeathChange,
  deathCause,
  onDeathCauseChange,
  deathCategory,
  onDeathCategoryChange,
  burialDate,
  onBurialDateChange,
  burialPlace,
  onBurialPlaceChange,
  events,
  onAddEvent,
  onUpdateEvent,
  onRemoveEvent,
  onAddSource,
  onNotesBadgeClick,
  getSourceCountForEvent,
  getNoteCountForEvent,
  getMediaCountForEvent,
}) => {
  return (
    <div className="space-y-12 animate-in fade-in slide-in-from-bottom-2 duration-300">
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-blue-50 text-blue-500 rounded-2xl flex items-center justify-center shadow-sm">
              <Fingerprint className="w-6 h-6" />
            </div>
            <p className="text-[11px] font-black text-slate-400 uppercase tracking-[0.25em]">Identity Profile</p>
          </div>
          <button
            onClick={onAddAltName}
            className="text-[9px] font-black text-blue-600 uppercase tracking-widest flex items-center gap-1.5 hover:translate-x-1 transition-all"
          >
            <Plus className="w-4 h-4" /> Add Identity
          </button>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <DetailEdit label="First Name" value={firstName} onChange={onFirstNameChange} />
          <DetailEdit label="Surname" value={lastName} onChange={onLastNameChange} />
        </div>
        <DetailEdit label="Maiden Name" value={maidenName} onChange={onMaidenNameChange} placeholder="née..." />

        {altNames.length > 0 && (
          <div className="space-y-4 pt-2">
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">Alternate Identities</p>
            {altNames.map((alt, idx) => (
              <div
                key={`${alt.type}-${idx}`}
                className="p-4 bg-white border border-slate-100 rounded-3xl space-y-3 relative group/alt shadow-sm transition-all hover:shadow-md"
              >
                <button
                  onClick={() => onRemoveAltName(idx)}
                  className="absolute top-4 right-4 text-slate-300 hover:text-rose-500 opacity-0 group-hover/alt:opacity-100 transition-all"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
                <select
                  value={alt.type}
                  onChange={(e) => onUpdateAltName(idx, 'type', e.target.value)}
                  className="text-[10px] font-black bg-slate-50 border border-slate-200 rounded-lg px-3 py-1.5 uppercase tracking-widest text-slate-900 shadow-sm outline-none cursor-pointer"
                >
                  {ALT_NAME_TYPES.map((type) => (
                    <option key={type} value={type}>
                      {type}
                    </option>
                  ))}
                </select>
                <div className="grid grid-cols-2 gap-3">
                  <DetailEdit label="First Name" value={alt.firstName} onChange={(value) => onUpdateAltName(idx, 'firstName', value)} />
                  <DetailEdit label="Surname" value={alt.lastName} onChange={(value) => onUpdateAltName(idx, 'lastName', value)} />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="space-y-8 pt-6 border-t border-slate-200/60">
        <p className="text-[11px] font-black text-slate-400 uppercase tracking-[0.25em]">Vitals: Arrival & Departure</p>
        <div className="space-y-10">
          {[
            {
              label: 'Birth Record',
              icon: <Plus className="w-3.5 h-3.5" />,
              badgeColor: 'text-blue-600',
              eventLabel: 'Birth',
              fields: (
                <>
                  <FluentDateInput label="Date" value={birthDate} onChange={onBirthDateChange} />
                  <PlaceInput label="Location" value={birthPlace} onChange={onBirthPlaceChange} />
                </>
              ),
              wrapperClass: 'bg-white',
            },
            {
              label: 'Death Record',
              icon: <Skull className="w-3.5 h-3.5" />,
              badgeColor: 'text-slate-600',
              eventLabel: 'Death',
              fields: (
                <>
                  <FluentDateInput label="Date" value={deathDate} onChange={onDeathDateChange} />
                  <PlaceInput label="Place of Death (e.g. Hospital)" value={deathPlace} onChange={onDeathPlaceChange} />
                  <PlaceInput label="Residence at Death (e.g. Home)" value={residenceAtDeath} onChange={onResidenceAtDeathChange} />
                  <DetailEdit label="Cause of Death" value={deathCause} onChange={onDeathCauseChange} />
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">Death Category</label>
                    <select
                      value={deathCategory}
                      onChange={(event) => onDeathCategoryChange(event.target.value as DeathCauseCategory)}
                      className="w-full px-4 py-2.5 bg-white border border-slate-200 rounded-xl text-sm font-medium outline-none cursor-pointer"
                    >
                      {DEATH_CATEGORIES.map((category) => (
                        <option key={category} value={category}>
                          {category}
                        </option>
                      ))}
                    </select>
                  </div>
                </>
              ),
              wrapperClass: 'bg-slate-900/5 border border-slate-200/60',
            },
            {
              label: 'Burial Record',
              icon: <Home className="w-3.5 h-3.5" />,
              badgeColor: 'text-slate-600',
              eventLabel: 'Burial',
              fields: (
                <>
                  <FluentDateInput label="Date" value={burialDate} onChange={onBurialDateChange} />
                  <PlaceInput label="Burial Location (e.g. Cemetery)" value={burialPlace} onChange={onBurialPlaceChange} />
                </>
              ),
              wrapperClass: 'bg-white',
            },
          ].map((record) => (
            <div key={record.label} className="space-y-4">
              <div className="flex items-center justify-between px-1">
                <div className={`flex items-center gap-2 text-[10px] font-black uppercase ${record.badgeColor} tracking-widest`}>
                  {record.icon} {record.label}
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => onAddSource(record.eventLabel)}
                    aria-label={`Link ${record.eventLabel?.toLowerCase()} source`}
                    className="relative p-2 rounded-full text-rose-500 hover:bg-rose-50 transition-colors"
                  >
                    <Library className="w-4 h-4" />
                    {getSourceCountForEvent(record.eventLabel) > 0 && (
                      <span className="absolute -top-1 -right-1 bg-rose-500 text-white text-[9px] font-black rounded-full px-1">
                        {getSourceCountForEvent(record.eventLabel)}
                      </span>
                    )}
                  </button>
                  <button
                    aria-label={`View ${record.eventLabel?.toLowerCase()} notes`}
                    onClick={() => onNotesBadgeClick(record.eventLabel)}
                    className={`relative p-2 rounded-full transition-colors ${
                      getNoteCountForEvent(record.eventLabel) > 0 ? 'text-emerald-500 hover:bg-emerald-50' : 'text-slate-300 cursor-default'
                    }`}
                  >
                    <FileText className="w-4 h-4" />
                    {getNoteCountForEvent(record.eventLabel) > 0 && (
                      <span className="absolute -top-1 -right-1 bg-emerald-500 text-white text-[9px] font-black rounded-full px-1">
                        {getNoteCountForEvent(record.eventLabel)}
                      </span>
                    )}
                  </button>
                  <button aria-label="View linked media" className="relative p-2 rounded-full text-sky-600 hover:bg-sky-50 transition-colors">
                    <ImageIcon className="w-4 h-4" />
                    {getMediaCountForEvent(record.eventLabel) > 0 && (
                      <span className="absolute -top-1 -right-1 bg-sky-600 text-white text-[9px] font-black rounded-full px-1">
                        {getMediaCountForEvent(record.eventLabel)}
                      </span>
                    )}
                  </button>
                </div>
              </div>
              <div className={`${record.wrapperClass} p-6 rounded-[36px] border border-slate-100 shadow-sm space-y-5`}>
                {record.fields}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="space-y-6 pt-6 border-t border-slate-200/60">
        <div className="flex items-center justify-between">
          <p className="text-[11px] font-black text-slate-400 uppercase tracking-[0.25em]">Life Chronology</p>
          <button
            onClick={onAddEvent}
            className="text-[9px] font-black text-blue-600 uppercase tracking-widest flex items-center gap-1.5 hover:translate-x-1 transition-all"
          >
            <Plus className="w-4 h-4" /> Add Event
          </button>
        </div>
        <div className="space-y-6">
          {events.map((event) => {
            const EvIcon = getEventIcon(event.type);
            const eventLabel = event.date ? `${event.type} (${event.date})` : event.type;
            const sourceCount = getSourceCountForEvent(event.type || eventLabel);
            const noteCount = getNoteCountForEvent(event.type || eventLabel);
            const mediaCount = getMediaCountForEvent(event.type || eventLabel);
            return (
              <div
                key={event.id}
                className="p-6 bg-white border border-slate-100 rounded-[36px] shadow-sm space-y-4 group/event relative transition-all hover:shadow-md"
              >
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-slate-50 text-slate-900 rounded-xl shadow-sm">
                      <EvIcon className="w-4 h-4" />
                    </div>
                    <select
                      value={event.type}
                      onChange={(e) => onUpdateEvent(event.id, 'type', e.target.value)}
                      className="text-[10px] font-black bg-slate-50 border border-slate-200 rounded-lg px-3 py-1.5 uppercase tracking-widest text-slate-900 shadow-sm outline-none cursor-pointer"
                    >
                      {EVENT_TYPES.map((type) => (
                        <option key={type} value={type}>
                          {type}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => onAddSource(event.type || eventLabel)}
                      className="relative p-2 rounded-full text-rose-500 hover:bg-rose-50 transition-colors"
                    >
                      <Library className="w-4 h-4" />
                      {sourceCount > 0 && (
                        <span className="absolute -top-1 -right-1 bg-rose-500 text-white text-[9px] font-black rounded-full px-1">
                          {sourceCount}
                        </span>
                      )}
                    </button>
                    <button
                      onClick={() => onNotesBadgeClick(event.type || eventLabel)}
                      className={`relative p-2 rounded-full transition-colors ${
                        noteCount > 0 ? 'text-emerald-500 hover:bg-emerald-50' : 'text-slate-300 cursor-default'
                      }`}
                    >
                      <FileText className="w-4 h-4" />
                      {noteCount > 0 && (
                        <span className="absolute -top-1 -right-1 bg-emerald-500 text-white text-[9px] font-black rounded-full px-1">
                          {noteCount}
                        </span>
                      )}
                    </button>
                    <button className="relative p-2 rounded-full text-sky-600 hover:bg-sky-50 transition-colors">
                      <ImageIcon className="w-4 h-4" />
                      {mediaCount > 0 && (
                        <span className="absolute -top-1 -right-1 bg-sky-600 text-white text-[9px] font-black rounded-full px-1">
                          {mediaCount}
                        </span>
                      )}
                    </button>
                    <button onClick={() => onRemoveEvent(event.id)} className="text-slate-300 hover:text-rose-500 transition-all">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
                <FluentDateInput label="Date" value={event.date || ''} onChange={(value) => onUpdateEvent(event.id, 'date', value)} />
                <PlaceInput label="Location" value={event.place || ''} onChange={(value) => onUpdateEvent(event.id, 'place', value)} />
                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">Historical Context / Notes</label>
                  <textarea
                    value={event.description || ''}
                    onChange={(e) => onUpdateEvent(event.id, 'description', e.target.value)}
                    className="w-full px-4 py-2.5 bg-slate-50 border border-slate-100 rounded-xl text-xs font-medium outline-none focus:ring-2 focus:ring-slate-900/5 min-h-[60px] resize-none"
                    placeholder="Add specific details for this event instance..."
                  />
                </div>
              </div>
            );
          })}
          {events.length === 0 && (
            <div className="py-12 text-center border-2 border-dashed border-slate-200 rounded-[40px] space-y-3">
              <History className="w-8 h-8 text-slate-200 mx-auto" />
              <p className="text-xs text-slate-400 italic">
                No custom chronological events recorded. Add residences, military service, or educational records to build a complete life story.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default VitalTab;
