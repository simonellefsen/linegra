import React, { useState, useMemo, useRef } from 'react';
import { 
  Person, 
  User as UserType, 
  AlternateName, 
  DeathCauseCategory, 
  StructuredPlace, 
  AlternateNameType,
  Source,
  Note,
  PersonEvent,
  Relationship,
  RelationshipConfidence,
  DNATest,
  MediaItem,
  SourceType,
  NoteType,
  DNAVendor,
  DNATestType,
  MediaType
} from '../types';
import { FluentDateInput } from './FluentDate';
import { PlaceInput } from './PlaceInput';
import { MOCK_TREES, MOCK_RELATIONSHIPS, MOCK_MEDIA } from '../mockData';
import { 
  X, Library, Image as ImageIcon, FileText, Plus, Info, Lock, ShieldCheck, 
  Target, Microscope, Dna, Share2, ChevronRight, Search, Link2, 
  Skull, Heart, Trash2, Calendar,
  CheckCircle, HelpCircle, Edit3, Link, Music, Video, File,
  Upload as UploadIcon, Globe, Fingerprint, Sparkles, Home, GraduationCap, Sword, PlaneLanding, PlaneTakeoff,
  History
} from 'lucide-react';

interface PersonProfileProps {
  person: Person;
  currentUser: UserType | null;
  onClose: () => void;
  allPeople: Person[];
}

type ProfileSection = 'vital' | 'story' | 'family' | 'sources' | 'media' | 'dna' | 'notes';

const DEATH_CATEGORIES: DeathCauseCategory[] = [
  'Natural', 'Disease', 'Accident', 'Suicide', 'Homicide', 'Military', 'Legal Execution', 'Other', 'Unknown'
];

const ALT_NAME_TYPES: AlternateNameType[] = [
  'Birth Name', 'Nickname', 'Alias', 'Married Name', 'Anglicized Name', 'Legal Name Change', 'Also Known As', 'Religious Name'
];

const EVENT_TYPES = [
  'Residence', 
  'Immigration', 
  'Emigration', 
  'Education', 
  'Military Service',
  'Baptism', 
  'Christening', 
  'Confirmation', 
  'Naturalization', 
  'Probate', 
  'Will', 
  'Retirement', 
  'Occupation Change',
  'Other'
];

const CONFIDENCE_LEVELS: RelationshipConfidence[] = [
  'Confirmed', 'Probable', 'Assumed', 'Speculative', 'Unknown'
];

const SOURCE_TYPES: SourceType[] = ['Book', 'Church Record', 'Probate Register', 'Website', 'Census', 'Vital Record', 'Military Record', 'Unknown'];
const NOTE_TYPES: NoteType[] = ['Generic', 'To-do', 'Research Note', 'Discrepancy'];
const DNA_VENDORS: DNAVendor[] = ['FamilyTreeDNA', 'AncestryDNA', '23andMe', 'MyHeritage', 'LivingDNA', 'Other'];
const DNA_TEST_TYPES: DNATestType[] = ['Autosomal', 'Y-DNA', 'mtDNA', 'X-DNA', 'Other'];

const PersonProfile: React.FC<PersonProfileProps> = ({ person, currentUser, onClose, allPeople }) => {
  const [activeSection, setActiveSection] = useState<ProfileSection>('vital');
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Profile data state
  const [firstName, setFirstName] = useState(person.firstName);
  const [lastName, setLastName] = useState(person.lastName);
  const [maidenName, setMaidenName] = useState(person.maidenName || '');
  const [birthDate, setBirthDate] = useState(person.birthDate || '');
  const [birthPlace, setBirthPlace] = useState<string | StructuredPlace>(person.birthPlace || '');
  const [deathDate, setDeathDate] = useState(person.deathDate || '');
  const [deathPlace, setDeathPlace] = useState<string | StructuredPlace>(person.deathPlace || '');
  const [residenceAtDeath, setResidenceAtDeath] = useState<string | StructuredPlace>(person.residenceAtDeath || '');
  const [deathCause, setDeathCause] = useState(person.deathCause || '');
  const [deathCategory, setDeathCategory] = useState<DeathCauseCategory>(person.deathCauseCategory || 'Unknown');
  const [altNames, setAltNames] = useState<AlternateName[]>(person.alternateNames || []);
  const [events, setEvents] = useState<PersonEvent[]>(person.events || []);
  const isDNAMatch = !!person.isDNAMatch;

  // Dynamic Archive state
  const [sources, setSources] = useState<Source[]>(person.sources || []);
  const [notes, setNotes] = useState<Note[]>(person.notes || []);
  const [dnaTests, setDnaTests] = useState<DNATest[]>(person.dnaTests || []);
  const [mediaItems, setMediaItems] = useState<MediaItem[]>(() => {
    const ids = person.mediaIds || [];
    return MOCK_MEDIA.filter(m => ids.includes(m.id) || m.linkedPersonIds.includes(person.id));
  });

  const [relConfidences, setRelConfidences] = useState<Record<string, RelationshipConfidence>>(
    MOCK_RELATIONSHIPS.reduce((acc, r) => ({ ...acc, [r.id]: r.confidence || 'Unknown' }), {})
  );

  // Expanded available events list for dropdowns, including specific event instances if they have identifiers
  const availableEvents = useMemo(() => {
    const list = ['General', 'Birth', 'Death'];
    events.forEach(e => {
      const label = e.date ? `${e.type} (${e.date})` : e.type;
      if (!list.includes(label)) list.push(label);
    });
    return list;
  }, [events]);

  const canAccessDNA = useMemo(() => {
    if (!currentUser) return false;
    if (currentUser.isAdmin) return true;
    const activeTree = MOCK_TREES.find(t => t.id === person.treeId);
    return person.addedByUserId === currentUser.id || activeTree?.ownerId === currentUser.id;
  }, [currentUser, person]);

  const parents = useMemo(() => {
    return MOCK_RELATIONSHIPS
      .filter(r => r.relatedId === person.id && ['bio_father', 'bio_mother', 'adoptive_father', 'adoptive_mother', 'step_parent', 'guardian'].includes(r.type))
      .map(r => ({
        rel: r,
        person: allPeople.find(p => p.id === r.personId)
      }))
      .filter((item): item is { rel: Relationship; person: Person } => !!item.person);
  }, [person.id, allPeople]);

  const spouses = useMemo(() => {
    return MOCK_RELATIONSHIPS
      .filter(r => (r.personId === person.id || r.relatedId === person.id) && ['marriage', 'partner'].includes(r.type))
      .map(r => {
        const otherId = r.personId === person.id ? r.relatedId : r.personId;
        return {
          rel: r,
          person: allPeople.find(p => p.id === otherId)
        };
      })
      .filter((item): item is { rel: Relationship; person: Person } => !!item.person);
  }, [person.id, allPeople]);

  const children = useMemo(() => {
    const asParent = MOCK_RELATIONSHIPS
      .filter(r => r.personId === person.id && ['bio_father', 'bio_mother', 'adoptive_father', 'adoptive_mother', 'step_parent', 'guardian'].includes(r.type))
      .map(r => ({
        rel: r,
        person: allPeople.find(p => p.id === r.relatedId)
      }));
    const asChildRel = MOCK_RELATIONSHIPS
      .filter(r => r.personId === person.id && r.type === 'child')
      .map(r => ({
        rel: r,
        person: allPeople.find(p => p.id === r.relatedId)
      }));
    return [...asParent, ...asChildRel].filter((item): item is { rel: Relationship; person: Person } => !!item.person);
  }, [person.id, allPeople]);

  const tabs: { id: ProfileSection; label: string; icon: any; secure?: boolean }[] = [
    { id: 'vital', label: 'Vital', icon: Heart },
    { id: 'family', label: 'Family', icon: Share2 },
    { id: 'story', label: 'Story', icon: FileText },
    { id: 'sources', label: 'Sources', icon: Library },
    { id: 'media', label: 'Media', icon: ImageIcon },
    { id: 'dna', label: 'DNA', icon: Microscope, secure: true },
    { id: 'notes', label: 'Notes', icon: Edit3 },
  ];

  // --- Handlers ---

  const handleUpdateConfidence = (relId: string, confidence: RelationshipConfidence) => {
    setRelConfidences(prev => ({ ...prev, [relId]: confidence }));
  };

  const handleUpdateEvent = (id: string, field: keyof PersonEvent, value: any) => {
    setEvents(events.map(e => e.id === id ? { ...e, [field]: value } : e));
  };

  const handleAddEvent = () => {
    const newEvent: PersonEvent = {
      id: Math.random().toString(36).substr(2, 9),
      type: 'Residence',
      date: '',
      place: '',
      description: ''
    };
    setEvents([...events, newEvent]);
  };

  const handleAddSource = (linkedEvent?: string) => {
    const newSource: Source = {
      id: Math.random().toString(36).substr(2, 9),
      title: 'New Source Record',
      type: 'Unknown',
      citationDate: new Date().getFullYear().toString(),
      reliability: 1,
      actualText: '',
      event: linkedEvent || 'General'
    };
    setSources([newSource, ...sources]);
    setActiveSection('sources');
  };

  const handleAddNote = (linkedEvent?: string) => {
    const newNote: Note = {
      id: Math.random().toString(36).substr(2, 9),
      text: '',
      type: 'Generic',
      event: linkedEvent || 'General',
      date: new Date().toISOString().split('T')[0]
    };
    setNotes([newNote, ...notes]);
    setActiveSection('notes');
  };

  const handleAddAltName = () => {
    const newAlt: AlternateName = {
      type: 'Nickname',
      firstName: '',
      lastName: '',
    };
    setAltNames([...altNames, newAlt]);
  };

  const handleUpdateAltName = (index: number, field: keyof AlternateName, value: string) => {
    const updated = [...altNames];
    updated[index] = { ...updated[index], [field]: value };
    setAltNames(updated);
  };

  const handleLinkMedia = () => {
    const newMedia: MediaItem = {
      id: Math.random().toString(36).substr(2, 9),
      url: '',
      type: 'image',
      source: 'remote',
      category: 'Other',
      caption: 'New Media Link',
      linkedPersonIds: [person.id]
    };
    setMediaItems([newMedia, ...mediaItems]);
    setActiveSection('media');
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onloadend = () => {
      const newMedia: MediaItem = {
        id: Math.random().toString(36).substr(2, 9),
        url: reader.result as string,
        type: file.type.startsWith('audio/') ? 'audio' : file.type.startsWith('video/') ? 'video' : 'image',
        source: 'local',
        category: 'Portrait',
        caption: file.name,
        linkedPersonIds: [person.id]
      };
      setMediaItems([newMedia, ...mediaItems]);
      setActiveSection('media');
    };
    reader.readAsDataURL(file);
  };

  const handleAddDNATest = () => {
    const newTest: DNATest = {
      id: Math.random().toString(36).substr(2, 9),
      type: 'Autosomal',
      vendor: 'AncestryDNA',
      isPrivate: false,
      testDate: new Date().getFullYear().toString()
    };
    setDnaTests([...dnaTests, newTest]);
    setActiveSection('dna');
  };

  const getMediaTypeIcon = (type: MediaType) => {
    switch (type) {
      case 'audio': return Music;
      case 'video': return Video;
      case 'document': return File;
      default: return ImageIcon;
    }
  };

  const getEventIcon = (type: string) => {
    switch (type.toLowerCase()) {
      case 'residence': return Home;
      case 'education': return GraduationCap;
      case 'military service': return Sword;
      case 'immigration': return PlaneLanding;
      case 'emigration': return PlaneTakeoff;
      case 'baptism':
      case 'christening': return Heart;
      default: return Calendar;
    }
  };

  const getConfidenceStyle = (level: RelationshipConfidence) => {
    switch (level) {
      case 'Confirmed': return { bg: 'bg-emerald-50', text: 'text-emerald-700', border: 'border-emerald-200', icon: CheckCircle };
      case 'Probable': return { bg: 'bg-blue-50', text: 'text-blue-700', border: 'border-blue-200', icon: Info };
      case 'Assumed': return { bg: 'bg-indigo-50', text: 'text-indigo-700', border: 'border-indigo-200', icon: Target };
      case 'Speculative': return { bg: 'bg-amber-50', text: 'text-amber-700', border: 'border-amber-200', icon: HelpCircle };
      default: return { bg: 'bg-slate-50', text: 'text-slate-500', border: 'border-slate-200', icon: Search };
    }
  };

  const RelationCard: React.FC<{ item: { person: Person; rel: Relationship }; label: string }> = ({ item, label }) => {
    const confidence = relConfidences[item.rel.id] || 'Unknown';
    const style = getConfidenceStyle(confidence);
    const StatusIcon = style.icon;

    return (
      <div className="p-4 bg-white border border-slate-100 rounded-[32px] hover:border-slate-300 transition-all cursor-pointer group space-y-4 shadow-sm hover:shadow-md">
        <div className="flex items-center justify-between">
           <div className="flex items-center gap-4">
              <img src={item.person.photoUrl || `https://ui-avatars.com/api/?name=${item.person.firstName}`} className="w-12 h-12 rounded-2xl object-cover shadow-sm bg-slate-100" />
              <div>
                 <p className="text-sm font-bold text-slate-900 group-hover:text-blue-600 transition-colors">{item.person.firstName} {item.person.lastName}</p>
                 <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">{label}</p>
              </div>
           </div>
           <ChevronRight className="w-4 h-4 text-slate-300 group-hover:translate-x-1 transition-transform" />
        </div>
        
        <div className={`px-4 py-2.5 rounded-2xl border ${style.bg} ${style.border} flex items-center justify-between group/conf`}>
           <div className="flex items-center gap-2">
              <StatusIcon className={`w-3.5 h-3.5 ${style.text}`} />
              <span className={`text-[10px] font-black uppercase tracking-widest ${style.text}`}>{confidence}</span>
           </div>
           <select 
              value={confidence} 
              onClick={(e) => e.stopPropagation()}
              onChange={(e) => handleUpdateConfidence(item.rel.id, e.target.value as RelationshipConfidence)}
              className="bg-transparent border-none text-[9px] font-bold text-slate-500 uppercase tracking-widest outline-none cursor-pointer hover:text-slate-900"
           >
              {CONFIDENCE_LEVELS.map(level => <option key={level} value={level}>{level}</option>)}
           </select>
        </div>
      </div>
    );
  };

  return (
    <div className="bg-white h-full overflow-hidden border-l border-slate-200 w-full lg:w-[500px] flex flex-col shadow-2xl animate-in slide-in-from-right duration-300">
      <input type="file" ref={fileInputRef} className="hidden" accept="image/*,audio/*,video/*" onChange={handleFileUpload} />
      
      {/* Header with Photo & Name */}
      <div className="z-30 shrink-0">
        <div className="relative bg-slate-900 pt-12 pb-6 px-8 text-white shadow-lg">
          <button onClick={onClose} className="absolute top-4 right-6 p-2 bg-white/10 hover:bg-white/20 rounded-full transition-all text-white z-20"><X className="w-5 h-5" /></button>
          <div className="relative z-10 flex items-center gap-6">
            <div className="w-24 h-24 rounded-3xl overflow-hidden ring-4 ring-white shadow-2xl relative group bg-slate-800">
              <img src={person.photoUrl || `https://ui-avatars.com/api/?name=${person.firstName}+${person.lastName}&background=0f172a&color=fff&size=128`} className="w-full h-full object-cover" />
            </div>
            <div>
              <h3 className="text-3xl font-serif font-bold tracking-tight leading-tight">
                {firstName} {lastName}
              </h3>
              {maidenName && <p className="text-slate-400 font-serif italic text-sm mt-0.5">née {maidenName}</p>}
              {isDNAMatch && (
                <div className="mt-2 flex items-center gap-1.5 px-3 py-1 bg-blue-500/20 backdrop-blur-md rounded-full border border-blue-400/40 w-fit">
                   <ShieldCheck className="w-3.5 h-3.5 text-blue-300" />
                   <span className="text-[10px] font-black uppercase tracking-widest text-blue-200">Verified DNA Match</span>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Tab Navigation */}
        <nav className="flex bg-white border-b border-slate-200 px-4 pt-3 overflow-x-auto no-scrollbar shadow-sm">
          {tabs.map((tab) => (
            <button 
              key={tab.id} 
              onClick={() => setActiveSection(tab.id)} 
              className={`flex flex-col items-center gap-1 px-4 pb-3 text-[10px] font-black uppercase tracking-[0.2em] border-b-2 whitespace-nowrap transition-all ${activeSection === tab.id ? 'border-slate-900 text-slate-900' : 'border-transparent text-slate-400 hover:text-slate-600'}`}
            >
              <tab.icon className={`w-4 h-4 mb-0.5 ${tab.secure && !canAccessDNA ? 'opacity-20' : ''}`} />
              {tab.label}
            </button>
          ))}
        </nav>
      </div>

      {/* Main Content Area - Each section is a separate "page" */}
      <div className="flex-1 overflow-y-auto p-8 bg-slate-50/30 no-scrollbar pb-32">
        {activeSection === 'vital' && (
          <div className="space-y-12 animate-in fade-in slide-in-from-bottom-2 duration-300">
             {/* Identity Section */}
             <div className="space-y-6">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-blue-50 text-blue-500 rounded-2xl flex items-center justify-center shadow-sm">
                      <Fingerprint className="w-6 h-6" />
                    </div>
                    <p className="text-[11px] font-black text-slate-400 uppercase tracking-[0.25em]">Identity Profile</p>
                  </div>
                  <button onClick={handleAddAltName} className="text-[9px] font-black text-blue-600 uppercase tracking-widest flex items-center gap-1.5 hover:translate-x-1 transition-all">
                    <Plus className="w-4 h-4" /> Add Identity
                  </button>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <DetailEdit label="First Name" value={firstName} onChange={setFirstName} />
                  <DetailEdit label="Surname" value={lastName} onChange={setLastName} />
                </div>
                <DetailEdit label="Maiden Name" value={maidenName} onChange={setMaidenName} placeholder="née..." />

                {altNames.length > 0 && (
                  <div className="space-y-4 pt-2">
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">Alternate Identities</p>
                    {altNames.map((alt, idx) => (
                      <div key={idx} className="p-4 bg-white border border-slate-100 rounded-3xl space-y-3 relative group/alt shadow-sm transition-all hover:shadow-md">
                        <button onClick={() => setAltNames(altNames.filter((_, i) => i !== idx))} className="absolute top-4 right-4 text-slate-300 hover:text-rose-500 opacity-0 group-hover/alt:opacity-100 transition-all"><Trash2 className="w-4 h-4" /></button>
                        <select 
                          value={alt.type} 
                          onChange={(e) => handleUpdateAltName(idx, 'type', e.target.value as AlternateNameType)}
                          className="text-[10px] font-black bg-slate-50 border border-slate-200 rounded-lg px-3 py-1.5 uppercase tracking-widest text-slate-900 shadow-sm outline-none cursor-pointer"
                        >
                          {ALT_NAME_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                        </select>
                        <div className="grid grid-cols-2 gap-3">
                          <DetailEdit label="First Name" value={alt.firstName} onChange={(v) => handleUpdateAltName(idx, 'firstName', v)} />
                          <DetailEdit label="Surname" value={alt.lastName} onChange={(v) => handleUpdateAltName(idx, 'lastName', v)} />
                        </div>
                      </div>
                    ))}
                  </div>
                )}
             </div>

             {/* Birth & Death Sections */}
             <div className="space-y-8 pt-6 border-t border-slate-200/60">
                <p className="text-[11px] font-black text-slate-400 uppercase tracking-[0.25em]">Vitals: Arrival & Departure</p>
                <div className="space-y-10">
                   <div className="space-y-4">
                      <div className="flex items-center justify-between px-1">
                        <div className="flex items-center gap-2 text-[10px] font-black uppercase text-blue-600 tracking-widest"><Plus className="w-3.5 h-3.5" /> Birth Record</div>
                        <div className="flex gap-2">
                           <button onClick={() => handleAddSource('Birth')} className="text-[9px] font-black text-slate-400 hover:text-blue-600 uppercase tracking-widest flex items-center gap-1 transition-colors"><Library className="w-3 h-3" /> Link Source</button>
                        </div>
                      </div>
                      <div className="bg-white p-6 rounded-[36px] border border-slate-100 shadow-sm space-y-5">
                         <FluentDateInput label="Date" value={birthDate} onChange={setBirthDate} />
                         <PlaceInput label="Location" value={birthPlace} onChange={setBirthPlace} />
                      </div>
                   </div>

                   <div className="space-y-4">
                      <div className="flex items-center justify-between px-1">
                        <div className="flex items-center gap-2 text-[10px] font-black uppercase text-slate-600 tracking-widest"><Skull className="w-3.5 h-3.5" /> Death Record</div>
                        <div className="flex gap-2">
                           <button onClick={() => handleAddSource('Death')} className="text-[9px] font-black text-slate-400 hover:text-slate-600 uppercase tracking-widest flex items-center gap-1 transition-colors"><Library className="w-3 h-3" /> Link Source</button>
                        </div>
                      </div>
                      <div className="bg-slate-900/5 p-6 rounded-[36px] border border-slate-200/60 space-y-5">
                         <FluentDateInput label="Date" value={deathDate} onChange={setDeathDate} />
                         <PlaceInput label="Place of Death (e.g. Hospital)" value={deathPlace} onChange={setDeathPlace} />
                         <PlaceInput label="Residence at Death (e.g. Home)" value={residenceAtDeath} onChange={setResidenceAtDeath} />
                         <DetailEdit label="Cause of Death" value={deathCause} onChange={setDeathCause} />
                         <div className="space-y-1.5">
                            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">Death Category</label>
                            <select value={deathCategory} onChange={e => setDeathCategory(e.target.value as DeathCauseCategory)} className="w-full px-4 py-2.5 bg-white border border-slate-200 rounded-xl text-sm font-medium outline-none cursor-pointer">
                              {DEATH_CATEGORIES.map(cat => <option key={cat} value={cat}>{cat}</option>)}
                            </select>
                         </div>
                      </div>
                   </div>
                </div>
             </div>

             {/* Chronology Section */}
             <div className="space-y-6 pt-6 border-t border-slate-200/60">
                <div className="flex items-center justify-between">
                  <p className="text-[11px] font-black text-slate-400 uppercase tracking-[0.25em]">Life Chronology</p>
                  <button onClick={handleAddEvent} className="text-[9px] font-black text-blue-600 uppercase tracking-widest flex items-center gap-1.5 hover:translate-x-1 transition-all"><Plus className="w-4 h-4" /> Add Event</button>
                </div>
                <div className="space-y-6">
                   {events.map((ev) => {
                      const EvIcon = getEventIcon(ev.type);
                      const eventLabel = ev.date ? `${ev.type} (${ev.date})` : ev.type;
                      return (
                        <div key={ev.id} className="p-6 bg-white border border-slate-100 rounded-[36px] shadow-sm space-y-4 group/event relative transition-all hover:shadow-md">
                           <div className="flex items-center justify-between mb-2">
                              <div className="flex items-center gap-3">
                                 <div className="p-2 bg-slate-50 text-slate-900 rounded-xl shadow-sm">
                                    <EvIcon className="w-4 h-4" />
                                 </div>
                                 <select 
                                    value={ev.type} 
                                    onChange={(e) => handleUpdateEvent(ev.id, 'type', e.target.value)}
                                    className="text-[10px] font-black bg-slate-50 border border-slate-200 rounded-lg px-3 py-1.5 uppercase tracking-widest text-slate-900 shadow-sm outline-none cursor-pointer"
                                  >
                                    {EVENT_TYPES.map(type => <option key={type} value={type}>{type}</option>)}
                                  </select>
                              </div>
                              <div className="flex items-center gap-3">
                                 <button onClick={() => handleAddSource(eventLabel)} className="text-[9px] font-black text-slate-400 hover:text-blue-600 uppercase tracking-widest flex items-center gap-1 transition-colors"><Library className="w-3 h-3" /> Citations</button>
                                 <button onClick={() => setEvents(events.filter(e => e.id !== ev.id))} className="text-slate-300 hover:text-rose-500 transition-all"><Trash2 className="w-4 h-4" /></button>
                              </div>
                           </div>
                           <FluentDateInput label="Date" value={ev.date || ''} onChange={(v) => handleUpdateEvent(ev.id, 'date', v)} />
                           <PlaceInput label="Location" value={ev.place || ''} onChange={(v) => handleUpdateEvent(ev.id, 'place', v)} />
                           <div className="space-y-1.5">
                              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">Historical Context / Notes</label>
                              <textarea 
                                 value={ev.description || ''} 
                                 onChange={(e) => handleUpdateEvent(ev.id, 'description', e.target.value)}
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
                        <p className="text-xs text-slate-400 italic">No custom chronological events recorded. Add residences, military service, or educational records to build a complete life story.</p>
                     </div>
                   )}
                </div>
             </div>
          </div>
        )}

        {activeSection === 'family' && (
          <div className="space-y-10 animate-in fade-in slide-in-from-bottom-2 duration-300">
            <p className="text-[11px] font-black text-slate-400 uppercase tracking-[0.25em]">Kinship Map & Confidence</p>
            <div className="space-y-8">
               <div className="space-y-4">
                  <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest ml-1">Parental Connections</p>
                  {parents.map(item => <RelationCard key={item.rel.id} item={item} label="Ancestral Link" />)}
                  {parents.length === 0 && <p className="text-xs text-slate-400 italic p-4">No parental records found.</p>}
               </div>
               <div className="space-y-4">
                  <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest ml-1">Spousal Unions</p>
                  {spouses.map(item => <RelationCard key={item.rel.id} item={item} label="Partner Link" />)}
                  {spouses.length === 0 && <p className="text-xs text-slate-400 italic p-4">No partner records found.</p>}
               </div>
               <div className="space-y-4">
                  <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest ml-1">Descendant Links</p>
                  {children.map(item => <RelationCard key={item.rel.id} item={item} label="Offspring Link" />)}
                  {children.length === 0 && <p className="text-xs text-slate-400 italic p-4">No child records found.</p>}
               </div>
            </div>
          </div>
        )}

        {activeSection === 'story' && (
          <div className="space-y-8 animate-in fade-in slide-in-from-bottom-2 duration-300">
            <div className="flex items-center justify-between">
              <p className="text-[11px] font-black text-slate-400 uppercase tracking-[0.25em]">Narrative Archive</p>
              <button className="text-[9px] font-black text-blue-600 uppercase tracking-widest flex items-center gap-1.5"><Sparkles className="w-3.5 h-3.5" /> AI Rewrite</button>
            </div>
            <div className="prose prose-slate prose-lg max-w-none text-slate-700 leading-relaxed font-serif whitespace-pre-wrap first-letter:text-6xl first-letter:font-bold first-letter:mr-3 first-letter:float-left first-letter:text-slate-900 bg-white p-8 rounded-[40px] border border-slate-100 shadow-sm">
              {person.bio || 'Ancestral biography text has not yet been transcribed into the digital archive.'}
            </div>
          </div>
        )}

        {activeSection === 'sources' && (
          <div className="space-y-10 animate-in fade-in slide-in-from-bottom-2 duration-300">
             <div className="flex items-center justify-between">
                <p className="text-[11px] font-black text-slate-400 uppercase tracking-[0.25em]">Documentary Evidence</p>
                <button onClick={() => handleAddSource()} className="text-[9px] font-black text-blue-600 uppercase tracking-widest flex items-center gap-1.5 hover:translate-x-1 transition-all"><Plus className="w-4 h-4" /> Add Record</button>
             </div>
             
             <div className="space-y-6">
                {sources.map((source) => (
                  <div key={source.id} className="p-6 bg-white rounded-[32px] border border-slate-100 shadow-sm transition-all hover:shadow-md space-y-4">
                     <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <select 
                            value={source.type} 
                            onChange={(e) => setSources(sources.map(s => s.id === source.id ? { ...s, type: e.target.value as SourceType } : s))}
                            className="px-2 py-0.5 bg-slate-900 text-white text-[9px] font-black uppercase rounded-lg border-none outline-none cursor-pointer"
                          >
                            {SOURCE_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                          </select>
                          <div className="flex items-center gap-1.5 px-2 py-0.5 bg-blue-100/50 rounded-lg">
                            <Link className="w-2.5 h-2.5 text-blue-600" />
                            <select 
                              value={source.event || 'General'} 
                              onChange={(e) => setSources(sources.map(s => s.id === source.id ? { ...s, event: e.target.value } : s))}
                              className="bg-transparent text-[10px] text-blue-600 font-black uppercase tracking-widest border-none outline-none cursor-pointer"
                            >
                              {availableEvents.map(ev => <option key={ev} value={ev}>{ev}</option>)}
                            </select>
                          </div>
                        </div>
                        <button onClick={() => setSources(sources.filter(s => s.id !== source.id))} className="text-slate-300 hover:text-rose-500"><Trash2 className="w-4 h-4" /></button>
                     </div>
                     <input 
                       value={source.title} 
                       onChange={(e) => setSources(sources.map(s => s.id === source.id ? { ...s, title: e.target.value } : s))}
                       className="w-full font-bold text-slate-900 border-none outline-none bg-transparent text-lg font-serif" 
                       placeholder="Record Title..."
                     />
                     <div className="grid grid-cols-2 gap-3">
                        <DetailEdit label="Citation Date" value={source.citationDate} onChange={(v) => setSources(sources.map(s => s.id === source.id ? { ...s, citationDate: v } : s))} />
                        <DetailEdit label="URL / Link" value={source.url} onChange={(v) => setSources(sources.map(s => s.id === source.id ? { ...s, url: v } : s))} />
                     </div>
                     <textarea 
                       value={source.actualText || ''} 
                       onChange={(e) => setSources(sources.map(s => s.id === source.id ? { ...s, actualText: e.target.value } : s))}
                       className="w-full text-xs text-slate-500 italic border-none outline-none bg-slate-50 rounded-xl p-3 min-h-[60px]"
                       placeholder="Transcription of the record contents..."
                     />
                  </div>
                ))}
                {sources.length === 0 && <p className="text-center py-20 text-xs text-slate-400 italic">No source documents linked to this profile.</p>}
             </div>
          </div>
        )}

        {activeSection === 'media' && (
          <div className="space-y-10 animate-in fade-in slide-in-from-bottom-2 duration-300">
             <div className="flex items-center justify-between">
                <p className="text-[11px] font-black text-slate-400 uppercase tracking-[0.25em]">Visual & Audio Archive</p>
                <div className="flex gap-2">
                   <button onClick={() => fileInputRef.current?.click()} className="text-[9px] font-black text-slate-600 uppercase tracking-widest flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 rounded-xl hover:bg-slate-200 transition-all">
                      <UploadIcon className="w-3.5 h-3.5" /> Upload
                   </button>
                   <button onClick={handleLinkMedia} className="text-[9px] font-black text-blue-600 uppercase tracking-widest flex items-center gap-1.5 px-3 py-1.5 bg-blue-50 rounded-xl hover:bg-blue-100 transition-all">
                      <Link2 className="w-3.5 h-3.5" /> Link URL
                   </button>
                </div>
             </div>
             
             <div className="grid grid-cols-1 gap-6">
                {mediaItems.map(m => {
                  const TypeIcon = getMediaTypeIcon(m.type);
                  return (
                    <div key={m.id} className="group bg-white border border-slate-100 rounded-[40px] overflow-hidden shadow-sm hover:shadow-xl transition-all p-4 space-y-4">
                       <div className="flex items-center justify-between">
                          <div className="flex items-center gap-3">
                             <div className="w-10 h-10 bg-slate-100 rounded-2xl flex items-center justify-center text-slate-500">
                                <TypeIcon className="w-5 h-5" />
                             </div>
                             <div>
                                <select 
                                  value={m.type}
                                  onChange={(e) => setMediaItems(mediaItems.map(mi => mi.id === m.id ? { ...mi, type: e.target.value as any } : mi))}
                                  className="text-[10px] font-black uppercase tracking-widest text-slate-400 bg-transparent border-none outline-none cursor-pointer"
                                >
                                  {['image', 'audio', 'video', 'document'].map(t => <option key={t} value={t}>{t}</option>)}
                                </select>
                                <p className="text-[10px] font-bold text-blue-600 uppercase tracking-tight">{m.source === 'local' ? 'Local File' : 'External Link'}</p>
                             </div>
                          </div>
                          <button onClick={() => setMediaItems(mediaItems.filter(mi => mi.id !== m.id))} className="text-slate-300 hover:text-rose-500 p-2"><Trash2 className="w-4 h-4" /></button>
                       </div>

                       {m.type === 'image' && m.url && (
                          <div className="aspect-video rounded-[28px] overflow-hidden bg-slate-50 border border-slate-100">
                             <img src={m.url} className="w-full h-full object-contain" />
                          </div>
                       )}

                       <div className="space-y-3 px-2">
                          <input 
                            value={m.caption} 
                            onChange={(e) => setMediaItems(mediaItems.map(mi => mi.id === m.id ? { ...mi, caption: e.target.value } : mi))}
                            placeholder="Add a descriptive caption..."
                            className="w-full font-bold text-slate-900 border-none outline-none bg-transparent"
                          />
                          <div className="flex items-center gap-4">
                             <select 
                                value={m.category}
                                onChange={(e) => setMediaItems(mediaItems.map(mi => mi.id === m.id ? { ...mi, category: e.target.value as any } : mi))}
                                className="text-[10px] font-black text-slate-500 uppercase tracking-widest bg-slate-50 px-3 py-1.5 rounded-xl border border-slate-100 outline-none cursor-pointer"
                             >
                                {['Portrait', 'Family', 'Location', 'Document', 'Event', 'Other'].map(c => <option key={c} value={c}>{c}</option>)}
                             </select>
                             <div className="flex-1">
                                {m.source === 'remote' && (
                                   <div className="relative group/url">
                                      <Globe className="absolute left-3 top-1/2 -translate-y-1/2 w-3 h-3 text-slate-400" />
                                      <input 
                                         value={m.url} 
                                         onChange={(e) => setMediaItems(mediaItems.map(mi => mi.id === m.id ? { ...mi, url: e.target.value } : mi))}
                                         placeholder="Paste URL..."
                                         className="w-full pl-8 pr-3 py-1.5 bg-slate-50 border border-slate-100 rounded-xl text-[10px] font-medium outline-none"
                                      />
                                   </div>
                                )}
                             </div>
                          </div>
                       </div>
                    </div>
                  );
                })}
             </div>
          </div>
        )}

        {activeSection === 'dna' && (
          <div className="space-y-10 animate-in fade-in slide-in-from-bottom-2 duration-300">
             <div className="flex items-center justify-between">
                <p className="text-[11px] font-black text-slate-400 uppercase tracking-[0.25em]">Genetic Archive</p>
                <button onClick={handleAddDNATest} className="text-[9px] font-black text-blue-600 uppercase tracking-widest flex items-center gap-1.5"><Plus className="w-4 h-4" /> Log Result</button>
             </div>
             {!canAccessDNA ? (
                <div className="py-24 text-center space-y-4">
                  <Lock className="w-12 h-12 text-slate-200 mx-auto" />
                  <p className="text-[11px] text-slate-400 font-bold uppercase tracking-[0.2em]">Restricted Access Record</p>
                  <p className="text-xs text-slate-400 max-w-[200px] mx-auto italic">Genetic data is only available to project administrators and verified descendants.</p>
                </div>
             ) : (
                <div className="space-y-6">
                   {dnaTests.map((test) => (
                     <div key={test.id} className="bg-slate-900 rounded-[40px] p-8 text-white relative overflow-hidden group/dna shadow-2xl">
                        <button onClick={() => setDnaTests(dnaTests.filter(t => t.id !== test.id))} className="absolute top-4 right-6 text-white/20 hover:text-rose-400 opacity-0 group-hover/dna:opacity-100 transition-all"><Trash2 className="w-4 h-4" /></button>
                        <h4 className="text-2xl font-serif font-bold mb-6 flex items-center gap-3">
                           <Dna className="w-7 h-7 text-blue-400" /> 
                           <select 
                             value={test.vendor} 
                             onChange={(e) => setDnaTests(dnaTests.map(t => t.id === test.id ? { ...t, vendor: e.target.value as DNAVendor } : t))}
                             className="bg-transparent border-none outline-none font-serif text-white cursor-pointer"
                           >
                              {DNA_VENDORS.map(v => <option key={v} value={v} className="text-slate-900">{v}</option>)}
                           </select>
                        </h4>
                        <div className="grid grid-cols-2 gap-4">
                           <div className="p-4 bg-white/5 border border-white/10 rounded-3xl">
                              <p className="text-[10px] text-slate-400 font-black uppercase mb-1">Test Type</p>
                              <select 
                                 value={test.type} 
                                 onChange={(e) => setDnaTests(dnaTests.map(t => t.id === test.id ? { ...t, type: e.target.value as DNATestType } : t))}
                                 className="bg-transparent border-none text-lg font-serif font-bold text-white outline-none w-full cursor-pointer"
                              >
                                 {DNA_TEST_TYPES.map(tt => <option key={tt} value={tt} className="text-slate-900">{tt}</option>)}
                              </select>
                           </div>
                           <div className="p-4 bg-white/5 border border-white/10 rounded-3xl">
                              <p className="text-[10px] text-slate-400 font-black uppercase mb-1">Haplogroup</p>
                              <input 
                                 value={test.haplogroup || ''} 
                                 onChange={(e) => setDnaTests(dnaTests.map(t => t.id === test.id ? { ...t, haplogroup: e.target.value } : t))}
                                 placeholder="e.g. R-M269"
                                 className="bg-transparent border-none text-lg font-serif font-bold text-white outline-none w-full"
                              />
                           </div>
                        </div>
                        <div className="mt-4 p-4 bg-white/5 border border-white/10 rounded-3xl">
                           <p className="text-[10px] text-slate-400 font-black uppercase mb-1">Internal Notes</p>
                           <textarea 
                             value={test.notes || ''} 
                             onChange={(e) => setDnaTests(dnaTests.map(t => t.id === test.id ? { ...t, notes: e.target.value } : t))}
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
        )}

        {activeSection === 'notes' && (
          <div className="space-y-10 animate-in fade-in slide-in-from-bottom-2 duration-300">
             <div className="flex items-center justify-between">
                <p className="text-[11px] font-black text-slate-400 uppercase tracking-[0.25em]">Researcher Ledger</p>
                <button onClick={() => handleAddNote()} className="text-[9px] font-black text-blue-600 uppercase tracking-widest flex items-center gap-1.5"><Plus className="w-4 h-4" /> Add Entry</button>
             </div>
             <div className="space-y-6">
                {notes.map((note) => (
                  <div key={note.id} className="p-6 bg-white rounded-[32px] border border-slate-100 shadow-sm transition-all hover:shadow-md space-y-4">
                     <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <select 
                            value={note.type} 
                            onChange={(e) => setNotes(notes.map(n => n.id === note.id ? { ...n, type: e.target.value as NoteType } : n))}
                            className="px-2 py-0.5 bg-amber-100 text-amber-700 text-[9px] font-black uppercase rounded-lg border-none outline-none cursor-pointer"
                          >
                             {NOTE_TYPES.map(nt => <option key={nt} value={nt}>{nt}</option>)}
                          </select>
                          <div className="flex items-center gap-1.5 px-2 py-0.5 bg-amber-50 rounded-lg border border-amber-100">
                            <Link className="w-2.5 h-2.5 text-amber-600" />
                            <select 
                              value={note.event || 'General'} 
                              onChange={(e) => setNotes(notes.map(n => n.id === note.id ? { ...n, event: e.target.value } : n))}
                              className="bg-transparent text-[10px] text-amber-600 font-black uppercase tracking-widest border-none outline-none cursor-pointer"
                            >
                              {availableEvents.map(ev => <option key={ev} value={ev}>{ev}</option>)}
                            </select>
                          </div>
                        </div>
                        <div className="flex items-center gap-3">
                          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{note.date || 'Today'}</span>
                          <button onClick={() => setNotes(notes.filter(n => n.id !== note.id))} className="text-slate-300 hover:text-rose-500"><Trash2 className="w-4 h-4" /></button>
                        </div>
                     </div>
                     <textarea 
                       value={note.text} 
                       onChange={(e) => setNotes(notes.map(n => n.id === note.id ? { ...n, text: e.target.value } : n))}
                       className="w-full text-sm text-slate-700 leading-relaxed font-medium border-none outline-none bg-transparent min-h-[100px] resize-none"
                       placeholder="Enter research observations, task lists, or discrepancy reports..."
                     />
                  </div>
                ))}
                {notes.length === 0 && <p className="text-center py-20 text-xs text-slate-400 italic">No entries found in the researcher ledger.</p>}
             </div>
          </div>
        )}
      </div>
    </div>
  );
};

const DetailEdit: React.FC<{ label: string; value?: string; onChange: (v: string) => void; placeholder?: string }> = ({ label, value, onChange, placeholder }) => (
  <div className="space-y-1">
    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest px-1 block">{label}</label>
    <input 
      value={value || ''} 
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className="w-full px-4 py-2.5 bg-white border border-slate-200 rounded-xl text-sm font-medium focus:ring-2 focus:ring-slate-900/5 focus:border-slate-900 outline-none transition-all shadow-sm"
    />
  </div>
);

export default PersonProfile;
