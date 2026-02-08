import React, { useState, useMemo, useRef, useEffect, useCallback } from 'react';
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
  MediaType,
  Citation,
  FamilyLayoutState
} from '../types';
import { FluentDateInput } from './FluentDate';
import { PlaceInput } from './PlaceInput';
import { 
  X, Library, Image as ImageIcon, FileText, Plus, Info, Lock, ShieldCheck, 
  Target, Microscope, Dna, Share2, Search, Link2, 
  Skull, Heart, Trash2, Calendar,
  CheckCircle, HelpCircle, Edit3, Link, Music, Video, File,
  Upload as UploadIcon, Globe, Fingerprint, Sparkles, Home, GraduationCap, Sword, PlaneLanding, PlaneTakeoff,
  History, Unlink as UnlinkIcon, GripVertical
} from 'lucide-react';

interface PersonProfileProps {
  person: Person;
  relationships: Relationship[];
  currentUser: UserType | null;
  onClose: () => void;
  allPeople: Person[];
  onNavigateToPerson?: (person: Person) => void;
  onPersistFamilyLayout?: (personId: string, layout: FamilyLayoutState) => void;
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
  'Occupation',
  'Baptism', 
  'Christening', 
  'Confirmation', 
  'Naturalization', 
  'Probate', 
  'Will', 
  'Retirement', 
  'Burial',
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

const parentLinkTypes = ['bio_father','bio_mother','adoptive_father','adoptive_mother','step_parent','guardian'];

const formatYear = (input?: string) => {
  if (!input) return null;
  const match = input.match(/(\d{4})/);
  return match ? match[1] : input;
};

const PersonProfile: React.FC<PersonProfileProps> = ({ person, relationships, currentUser, onClose, allPeople, onNavigateToPerson, onPersistFamilyLayout }) => {
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
  const [burialDate, setBurialDate] = useState(person.burialDate || '');
  const [burialPlace, setBurialPlace] = useState<string | StructuredPlace>(person.burialPlace || '');
  const [deathCause, setDeathCause] = useState(person.deathCause || '');
  const [deathCategory, setDeathCategory] = useState<DeathCauseCategory>(person.deathCauseCategory || 'Unknown');
  const [altNames, setAltNames] = useState<AlternateName[]>(person.alternateNames || []);
  const [events, setEvents] = useState<PersonEvent[]>(person.events || []);
  const isDNAMatch = !!person.isDNAMatch;

  // Dynamic Archive state
  const [sources, setSources] = useState<Source[]>(person.sources || []);
  const [notes, setNotes] = useState<Note[]>(person.notes || []);
  const [dnaTests, setDnaTests] = useState<DNATest[]>(person.dnaTests || []);
  const extractMediaItems = (target: Person): MediaItem[] => {
    const metadataMedia = (target.metadata as { mediaItems?: MediaItem[] } | undefined)?.mediaItems;
    if (Array.isArray(metadataMedia)) {
      return metadataMedia;
    }
    return [];
  };
  const [mediaItems, setMediaItems] = useState<MediaItem[]>(extractMediaItems(person));

  const [relConfidences, setRelConfidences] = useState<Record<string, RelationshipConfidence>>(
    relationships.reduce((acc, r) => ({ ...acc, [r.id]: r.confidence || 'Unknown' }), {})
  );
  const [shareFeedback, setShareFeedback] = useState<string>('');

  const getSourceCountForEvent = (eventLabel: string) => {
    return sources.filter((source) => (source.event || 'General') === eventLabel).length;
  };

  const getNoteCountForEvent = (eventLabel: string) => {
    return notes.filter((note) => (note.event || 'General') === eventLabel).length;
  };

  const getMediaCountForEvent = (eventLabel: string) => {
    return mediaItems.filter((media) => (media.linkedEventLabel || 'General') === eventLabel).length;
  };

  // Expanded available events list for dropdowns, including specific event instances if they have identifiers
  const availableEvents = useMemo(() => {
    const list = ['General', 'Birth', 'Death', 'Burial'];
    events.forEach(e => {
      const label = e.date ? `${e.type} (${e.date})` : e.type;
      if (!list.includes(label)) list.push(label);
    });
    return list;
  }, [events]);

  const citationMap = useMemo(() => {
    const map: Record<string, Citation[]> = {};
    (person.citations || []).forEach((citation) => {
      const key = citation.sourceId;
      if (!key) return;
      (map[key] || (map[key] = [])).push(citation);
    });
    return map;
  }, [person.citations]);

  const canAccessDNA = !!currentUser?.isAdmin;

  const parents = useMemo(() => {
    return relationships
      .filter(r => r.relatedId === person.id && parentLinkTypes.includes(r.type))
      .map(r => ({
        rel: r,
        person: allPeople.find(p => p.id === r.personId)
      }))
      .filter((item): item is { rel: Relationship; person: Person } => !!item.person);
  }, [person.id, allPeople, relationships]);

  const spouses = useMemo(() => {
    return relationships
      .filter(r => (r.personId === person.id || r.relatedId === person.id) && ['marriage', 'partner'].includes(r.type))
      .map(r => {
        const otherId = r.personId === person.id ? r.relatedId : r.personId;
        return {
          rel: r,
          person: allPeople.find(p => p.id === otherId)
        };
      })
      .filter((item): item is { rel: Relationship; person: Person } => !!item.person);
  }, [person.id, allPeople, relationships]);

  const children = useMemo(() => {
    const asParent = relationships
      .filter(r => r.personId === person.id && parentLinkTypes.includes(r.type))
      .map(r => ({
        rel: r,
        person: allPeople.find(p => p.id === r.relatedId)
      }));
    const asChildRel = relationships
      .filter(r => r.personId === person.id && r.type === 'child')
      .map(r => ({
        rel: r,
        person: allPeople.find(p => p.id === r.relatedId)
      }));
    return [...asParent, ...asChildRel].filter((item): item is { rel: Relationship; person: Person } => !!item.person);
  }, [person.id, allPeople, relationships]);

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

  const handleNotesBadgeClick = (eventLabel: string) => {
    if (getNoteCountForEvent(eventLabel) > 0) {
      setActiveSection('notes');
    }
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
      event: linkedEvent || 'General',
      abbreviation: '',
      callNumber: ''
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

  // Sync local editable state whenever the selected person changes
  useEffect(() => {
    setFirstName(person.firstName);
    setLastName(person.lastName);
    setMaidenName(person.maidenName || '');
    setBirthDate(person.birthDate || '');
    setBirthPlace(person.birthPlace || '');
    setDeathDate(person.deathDate || '');
    setDeathPlace(person.deathPlace || '');
    setResidenceAtDeath(person.residenceAtDeath || '');
    setBurialDate(person.burialDate || '');
    setBurialPlace(person.burialPlace || '');
    setDeathCause(person.deathCause || '');
    setDeathCategory(person.deathCauseCategory || 'Unknown');
    setAltNames(person.alternateNames || []);
    setEvents(person.events || []);
    setSources(person.sources || []);
    setNotes(person.notes || []);
    setDnaTests(person.dnaTests || []);
    setMediaItems(extractMediaItems(person));
    setRelConfidences(relationships.reduce((acc, r) => ({ ...acc, [r.id]: r.confidence || 'Unknown' }), {}));
    setActiveSection('vital');
  }, [person, relationships]);

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
      case 'burial': return Home;
      case 'probate': return FileText;
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

  const RelationCard: React.FC<{ item: { person: Person; rel: Relationship }; label: string; metadata?: string | null }> = ({ item, label, metadata }) => {
    const confidence = relConfidences[item.rel.id] || 'Unknown';
    const style = getConfidenceStyle(confidence);
    const StatusIcon = style.icon;

    const initials = `${item.person.firstName?.[0] ?? ''}${item.person.lastName?.[0] ?? ''}`.toUpperCase() || '??';

    return (
      <button
        type="button"
        onClick={() => onNavigateToPerson?.(item.person)}
        className="w-full text-left p-4 bg-white border border-slate-100 rounded-3xl hover:border-slate-300 transition-all group shadow-sm hover:shadow-md focus:outline-none"
      >
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-2xl bg-slate-100 text-slate-500 flex items-center justify-center font-black tracking-widest">
              {item.person.photoUrl ? (
                <img src={item.person.photoUrl} className="w-full h-full object-cover rounded-2xl" />
              ) : (
                initials
              )}
            </div>
            <div>
              <p className="text-sm font-bold text-slate-900 group-hover:text-blue-600 transition-colors">
                {item.person.firstName} {item.person.lastName}
              </p>
              <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">{label}</p>
              {metadata && <p className="text-[10px] text-slate-400 mt-1">{metadata}</p>}
            </div>
          </div>
          <div className={`flex items-center gap-2 px-3 py-1 rounded-2xl border ${style.bg} ${style.border}`} onClick={(e) => e.stopPropagation()}>
            <StatusIcon className={`w-3.5 h-3.5 ${style.text}`} />
            <select
              value={confidence}
              onChange={(e) => handleUpdateConfidence(item.rel.id, e.target.value as RelationshipConfidence)}
              className={`bg-transparent border-none text-[9px] font-black uppercase tracking-widest ${style.text} outline-none cursor-pointer`}
            >
              {CONFIDENCE_LEVELS.map(level => <option key={level} value={level}>{level}</option>)}
            </select>
          </div>
        </div>
      </button>
    );
  };

  return (
    <div className="bg-white h-full overflow-hidden border-l border-slate-200 w-full lg:w-[500px] flex flex-col shadow-2xl animate-in slide-in-from-right duration-300">
      <input type="file" ref={fileInputRef} className="hidden" accept="image/*,audio/*,video/*" onChange={handleFileUpload} />
      
      {/* Header with Photo & Name */}
      <div className="z-30 shrink-0">
        <div className="relative bg-slate-900 pt-12 pb-6 px-8 text-white shadow-lg">
          <div className="absolute top-4 right-6 flex items-center gap-3 z-20">
            <div className="relative">
              <button
                onClick={async () => {
                const currentUrl = typeof window !== 'undefined' ? new URL(window.location.href) : null;
                if (currentUrl) {
                  currentUrl.searchParams.set('person', person.id);
                }
                const shareUrl = currentUrl ? currentUrl.toString() : '';
                const shareData = {
                  title: `${person.firstName} ${person.lastName} · Linegra`,
                  text: `Linegra profile for ${person.firstName} ${person.lastName}`,
                  url: shareUrl
                };
                try {
                  if (navigator.share) {
                    await navigator.share(shareData);
                    setShareFeedback('Shared');
                  } else if (shareUrl) {
                    await navigator.clipboard?.writeText(shareUrl);
                    setShareFeedback('Link copied');
                  }
                } catch {
                    if (shareUrl) {
                      await navigator.clipboard?.writeText(shareUrl);
                      setShareFeedback('Link copied');
                    } else {
                      setShareFeedback('Unable to share');
                    }
                  } finally {
                    setTimeout(() => setShareFeedback(''), 2500);
                  }
                }}
                className="p-2 bg-white/10 hover:bg-white/20 rounded-full transition-all text-white"
                aria-label="Share profile"
              >
                <Share2 className="w-5 h-5" />
              </button>
              {shareFeedback && (
                <span className="absolute -bottom-7 left-1/2 -translate-x-1/2 text-[10px] font-bold text-white bg-slate-900/60 px-2 py-0.5 rounded-full">
                  {shareFeedback}
                </span>
              )}
            </div>
            <button onClick={onClose} className="p-2 bg-white/10 hover:bg-white/20 rounded-full transition-all text-white"><X className="w-5 h-5" /></button>
          </div>
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
                           <button
                             onClick={() => handleAddSource('Birth')}
                             aria-label="Link birth source"
                             className="relative p-2 rounded-full text-rose-500 hover:bg-rose-50 transition-colors"
                           >
                             <Library className="w-4 h-4" />
                             {getSourceCountForEvent('Birth') > 0 && (
                               <span className="absolute -top-1 -right-1 bg-rose-500 text-white text-[9px] font-black rounded-full px-1">
                                 {getSourceCountForEvent('Birth')}
                               </span>
                             )}
                           </button>
                           <button
                             aria-label="View birth notes"
                             onClick={() => handleNotesBadgeClick('Birth')}
                             className={`relative p-2 rounded-full transition-colors ${getNoteCountForEvent('Birth') > 0 ? 'text-emerald-500 hover:bg-emerald-50' : 'text-slate-300 cursor-default'}`}
                           >
                             <FileText className="w-4 h-4" />
                             {getNoteCountForEvent('Birth') > 0 && (
                               <span className="absolute -top-1 -right-1 bg-emerald-500 text-white text-[9px] font-black rounded-full px-1">
                                 {getNoteCountForEvent('Birth')}
                               </span>
                             )}
                           </button>
                           <button
                             aria-label="View birth media"
                             className="relative p-2 rounded-full text-sky-600 hover:bg-sky-50 transition-colors"
                           >
                             <ImageIcon className="w-4 h-4" />
                             {getMediaCountForEvent('Birth') > 0 && (
                               <span className="absolute -top-1 -right-1 bg-sky-600 text-white text-[9px] font-black rounded-full px-1">
                                 {getMediaCountForEvent('Birth')}
                               </span>
                             )}
                           </button>
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
                           <button
                             onClick={() => handleAddSource('Death')}
                             aria-label="Link death source"
                             className="relative p-2 rounded-full text-rose-500 hover:bg-rose-50 transition-colors"
                           >
                             <Library className="w-4 h-4" />
                             {getSourceCountForEvent('Death') > 0 && (
                               <span className="absolute -top-1 -right-1 bg-rose-500 text-white text-[9px] font-black rounded-full px-1">
                                 {getSourceCountForEvent('Death')}
                               </span>
                             )}
                           </button>
                           <button
                             aria-label="View death notes"
                             onClick={() => handleNotesBadgeClick('Death')}
                             className={`relative p-2 rounded-full transition-colors ${getNoteCountForEvent('Death') > 0 ? 'text-emerald-500 hover:bg-emerald-50' : 'text-slate-300 cursor-default'}`}
                           >
                             <FileText className="w-4 h-4" />
                             {getNoteCountForEvent('Death') > 0 && (
                               <span className="absolute -top-1 -right-1 bg-emerald-500 text-white text-[9px] font-black rounded-full px-1">
                                 {getNoteCountForEvent('Death')}
                               </span>
                             )}
                           </button>
                           <button
                             aria-label="View death media"
                             className="relative p-2 rounded-full text-sky-600 hover:bg-sky-50 transition-colors"
                           >
                             <ImageIcon className="w-4 h-4" />
                             {getMediaCountForEvent('Death') > 0 && (
                               <span className="absolute -top-1 -right-1 bg-sky-600 text-white text-[9px] font-black rounded-full px-1">
                                 {getMediaCountForEvent('Death')}
                               </span>
                             )}
                           </button>
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

                   <div className="space-y-4">
                      <div className="flex items-center justify-between px-1">
                        <div className="flex items-center gap-2 text-[10px] font-black uppercase text-slate-600 tracking-widest"><Home className="w-3.5 h-3.5" /> Burial Record</div>
                        <div className="flex gap-2">
                           <button
                             onClick={() => handleAddSource('Burial')}
                             aria-label="Link burial source"
                             className="relative p-2 rounded-full text-rose-500 hover:bg-rose-50 transition-colors"
                           >
                             <Library className="w-4 h-4" />
                             {getSourceCountForEvent('Burial') > 0 && (
                               <span className="absolute -top-1 -right-1 bg-rose-500 text-white text-[9px] font-black rounded-full px-1">
                                 {getSourceCountForEvent('Burial')}
                               </span>
                             )}
                           </button>
                           <button
                             aria-label="View burial notes"
                             onClick={() => handleNotesBadgeClick('Burial')}
                             className={`relative p-2 rounded-full transition-colors ${getNoteCountForEvent('Burial') > 0 ? 'text-emerald-500 hover:bg-emerald-50' : 'text-slate-300 cursor-default'}`}
                           >
                             <FileText className="w-4 h-4" />
                             {getNoteCountForEvent('Burial') > 0 && (
                               <span className="absolute -top-1 -right-1 bg-emerald-500 text-white text-[9px] font-black rounded-full px-1">
                                 {getNoteCountForEvent('Burial')}
                               </span>
                             )}
                           </button>
                           <button
                             aria-label="View burial media"
                             className="relative p-2 rounded-full text-sky-600 hover:bg-sky-50 transition-colors"
                           >
                             <ImageIcon className="w-4 h-4" />
                             {getMediaCountForEvent('Burial') > 0 && (
                               <span className="absolute -top-1 -right-1 bg-sky-600 text-white text-[9px] font-black rounded-full px-1">
                                 {getMediaCountForEvent('Burial')}
                               </span>
                             )}
                           </button>
                        </div>
                      </div>
                      <div className="bg-white p-6 rounded-[36px] border border-slate-100 shadow-sm space-y-5">
                         <FluentDateInput label="Date" value={burialDate} onChange={setBurialDate} />
                         <PlaceInput label="Burial Location (e.g. Cemetery)" value={burialPlace} onChange={setBurialPlace} />
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
                      const sourceCount = getSourceCountForEvent(ev.type || eventLabel);
                      const noteCount = getNoteCountForEvent(ev.type || eventLabel);
                      const mediaCount = getMediaCountForEvent(ev.type || eventLabel);
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
                              <div className="flex items-center gap-2">
                                 <button
                                   onClick={() => handleAddSource(ev.type || eventLabel)}
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
                                   onClick={() => handleNotesBadgeClick(ev.type || eventLabel)}
                                   className={`relative p-2 rounded-full transition-colors ${noteCount > 0 ? 'text-emerald-500 hover:bg-emerald-50' : 'text-slate-300 cursor-default'}`}
                                 >
                                   <FileText className="w-4 h-4" />
                                   {noteCount > 0 && (
                                     <span className="absolute -top-1 -right-1 bg-emerald-500 text-white text-[9px] font-black rounded-full px-1">
                                       {noteCount}
                                     </span>
                                   )}
                                 </button>
                                 <button
                                   className="relative p-2 rounded-full text-sky-600 hover:bg-sky-50 transition-colors"
                                 >
                                   <ImageIcon className="w-4 h-4" />
                                   {mediaCount > 0 && (
                                     <span className="absolute -top-1 -right-1 bg-sky-600 text-white text-[9px] font-black rounded-full px-1">
                                       {mediaCount}
                                     </span>
                                   )}
                                 </button>
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
                  {parents.map(item => {
                    const meta = item.rel.notes || formatYear(item.rel.date) ? `Linked ${formatYear(item.rel.date) || ''}`.trim() : null;
                    return <RelationCard key={item.rel.id} item={item} label="Ancestral Link" metadata={meta || undefined} />;
                  })}
                  {parents.length === 0 && <p className="text-xs text-slate-400 italic p-4">No parental records found.</p>}
               </div>
               <FamilyGroups
                 personId={person.id}
                 spouses={spouses}
                 children={children}
                 relationships={relationships}
                 initialLayout={person.metadata?.familyLayout as FamilyLayoutState | undefined}
                 onNavigate={onNavigateToPerson}
                 onPersist={onPersistFamilyLayout}
                 renderRelationCard={(item, label, metadata) => (
                   <RelationCard item={item} label={label} metadata={metadata || undefined} />
                 )}
               />
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
                       value={source.title || source.abbreviation || source.externalId || ''}
                       onChange={(e) => setSources(sources.map(s => s.id === source.id ? { ...s, title: e.target.value } : s))}
                       className="w-full font-bold text-slate-900 border-none outline-none bg-transparent text-lg font-serif" 
                       placeholder="Record Title..."
                     />
                     {source.abbreviation && (
                       <p className="text-xs text-slate-500 italic">{source.abbreviation}</p>
                     )}
                     <div className="grid grid-cols-2 gap-3">
                        <DetailEdit label="Citation Date" value={source.citationDate} onChange={(v) => setSources(sources.map(s => s.id === source.id ? { ...s, citationDate: v } : s))} />
                        <DetailEdit label="URL / Link" value={source.url} onChange={(v) => setSources(sources.map(s => s.id === source.id ? { ...s, url: v } : s))} />
                        <DetailEdit label="Short Title / Abbreviation" value={source.abbreviation || ''} onChange={(v) => setSources(sources.map(s => s.id === source.id ? { ...s, abbreviation: v } : s))} />
                        <DetailEdit label="Call Number" value={source.callNumber || ''} onChange={(v) => setSources(sources.map(s => s.id === source.id ? { ...s, callNumber: v } : s))} />
                     </div>
                     <textarea 
                       value={source.actualText || ''} 
                       onChange={(e) => setSources(sources.map(s => s.id === source.id ? { ...s, actualText: e.target.value } : s))}
                       className="w-full text-xs text-slate-500 italic border-none outline-none bg-slate-50 rounded-xl p-3 min-h-[60px]"
                       placeholder="Transcription of the record contents..."
                     />
                     {(() => {
                       const citationKey = source.externalId || source.id;
                       const linkedCitations = citationKey ? citationMap[citationKey] || [] : [];
                       if (!linkedCitations.length) return null;
                       return (
                         <div className="space-y-3 bg-slate-50 rounded-2xl p-4 border border-slate-100">
                           {linkedCitations.map((citation) => (
                             <div key={citation.id} className="text-xs text-slate-600 space-y-1">
                               <p className="font-semibold text-slate-800 flex items-center gap-2">
                                 <Library className="w-3 h-3 text-slate-500" />
                                 {(citation.eventLabel || 'General')}{citation.dataDate ? ` • ${citation.dataDate}` : ''}
                               </p>
                               {citation.page && <p className="text-[10px] uppercase tracking-[0.3em] text-slate-400">Page {citation.page}</p>}
                               {citation.dataText && (
                                 <p className="whitespace-pre-line text-slate-500">
                                   {citation.dataText}
                                 </p>
                               )}
                               {citation.quality && (
                                 <p className="text-[10px] uppercase tracking-[0.3em] text-slate-400">Quality: {citation.quality}</p>
                               )}
                             </div>
                           ))}
                         </div>
                       );
                     })()}
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

interface FamilyGroupProps {
  personId: string;
  spouses: Array<{ person: Person; rel: Relationship }>;
  children: Array<{ person: Person; rel: Relationship }>;
  relationships: Relationship[];
  onNavigate?: (person: Person) => void;
  initialLayout?: FamilyLayoutState;
  onPersist?: (layout: FamilyLayoutState) => void;
  renderRelationCard: (item: { person: Person; rel: Relationship }, label: string, metadata?: string | null) => React.ReactNode;
}

const FamilyGroups: React.FC<FamilyGroupProps> = ({ personId, spouses, children, relationships, initialLayout, onPersist, renderRelationCard }) => {
  const layoutSeed = useMemo(() => {
    const baseAssignments: Record<string, string | null> = {};
    const spouseIds = new Set(spouses.map((sp) => sp.rel.id));
    const childIds = new Set(children.map((child) => child.rel.id));
    children.forEach((child) => {
      const linkedSpouse = spouses.find((spouse) =>
        relationships.some(
          (rel) => rel.personId === spouse.person.id && rel.relatedId === child.person.id && parentLinkTypes.includes(rel.type)
        )
      );
      baseAssignments[child.rel.id] = linkedSpouse?.rel.id ?? null;
    });

    const layoutAssignments = (initialLayout?.assignments ?? {}) as Record<string, string | null>;
    Object.entries(layoutAssignments).forEach(([childId, spouseId]) => {
      if (childIds.has(childId) && (!spouseId || spouseIds.has(spouseId))) {
        baseAssignments[childId] = spouseId;
      }
    });

    const manualOrders: Record<string, string[]> = {};
    const layoutOrders = (initialLayout?.manualOrders ?? {}) as Record<string, string[]>;
    Object.entries(layoutOrders).forEach(([key, order]) => {
      const filtered = order.filter((childId) => childIds.has(childId));
      if (filtered.length) manualOrders[key] = filtered;
    });

    return {
      assignments: baseAssignments,
      manualOrders,
      removedSpouses: new Set(((initialLayout?.removedSpouseIds ?? []) as string[]).filter((id) => spouseIds.has(id))),
      removedChildren: new Set(((initialLayout?.removedChildIds ?? []) as string[]).filter((id) => childIds.has(id)))
    };
  }, [children, spouses, relationships, initialLayout]);

  const [assignments, setAssignments] = useState<Record<string, string | null>>(layoutSeed.assignments);
  const [manualOrders, setManualOrders] = useState<Record<string, string[]>>(layoutSeed.manualOrders);
  const [removedSpouseIds, setRemovedSpouseIds] = useState<Set<string>>(layoutSeed.removedSpouses);
  const [removedChildIds, setRemovedChildIds] = useState<Set<string>>(layoutSeed.removedChildren);
  const hydratingRef = useRef(false);
  const [dragContext, setDragContext] = useState<{ childId: string; groupKey: string } | null>(null);
  const [hoverGroup, setHoverGroup] = useState<string | null>(null);
  const lastPersistedRef = useRef<string>(JSON.stringify({
    assignments: layoutSeed.assignments,
    manualOrders: layoutSeed.manualOrders,
    removedSpouseIds: Array.from(layoutSeed.removedSpouses),
    removedChildIds: Array.from(layoutSeed.removedChildren)
  }));

  useEffect(() => {
    hydratingRef.current = true;
    setAssignments(layoutSeed.assignments);
    setManualOrders(layoutSeed.manualOrders);
    setRemovedSpouseIds(new Set(layoutSeed.removedSpouses));
    setRemovedChildIds(new Set(layoutSeed.removedChildren));
    lastPersistedRef.current = JSON.stringify({
      assignments: layoutSeed.assignments,
      manualOrders: layoutSeed.manualOrders,
      removedSpouseIds: Array.from(layoutSeed.removedSpouses),
      removedChildIds: Array.from(layoutSeed.removedChildren)
    });
    const timer = setTimeout(() => {
      hydratingRef.current = false;
    }, 0);
    return () => clearTimeout(timer);
  }, [personId, layoutSeed]);

  const keyForGroup = (groupId: string | null) => groupId ?? 'unassigned';

  const parseBirthValue = (value?: string) => {
    if (!value) return Number.MAX_SAFE_INTEGER;
    const match = value.match(/(\d{4})/);
    return match ? Number(match[1]) : Number.MAX_SAFE_INTEGER;
  };

  const activeSpouses = spouses.filter((sp) => !removedSpouseIds.has(sp.rel.id));
  const activeChildren = children.filter((child) => !removedChildIds.has(child.rel.id));

  const getBaseChildren = useCallback(
    (groupId: string | null): Array<{ person: Person; rel: Relationship }> => {
      return activeChildren
        .filter((child) => keyForGroup(assignments[child.rel.id] ?? null) === keyForGroup(groupId))
        .sort((a, b) => {
          const aVal = parseBirthValue(a.person.birthDate);
          const bVal = parseBirthValue(b.person.birthDate);
          if (aVal !== bVal) return aVal - bVal;
          return `${a.person.lastName}${a.person.firstName}`.localeCompare(`${b.person.lastName}${b.person.firstName}`);
        });
    },
    [activeChildren, assignments]
  );

  const getDisplayChildren = useCallback(
    (groupId: string | null): Array<{ person: Person; rel: Relationship }> => {
      const base = getBaseChildren(groupId);
      const manual = manualOrders[keyForGroup(groupId)];
      if (!manual || manual.length === 0) return base;
      const remaining = new Map<string, { person: Person; rel: Relationship }>(
        base.map((child) => [child.rel.id, child])
      );
      const ordered: Array<{ person: Person; rel: Relationship }> = [];
      manual.forEach((relId) => {
        const child = remaining.get(relId);
        if (child) {
          ordered.push(child);
          remaining.delete(relId);
        }
      });
      return ordered.concat(Array.from(remaining.values()));
    },
    [getBaseChildren, manualOrders]
  );

  const scrubChildFromManualOrders = (childRelId: string) => {
    setManualOrders((prev) => {
      const next = { ...prev };
      Object.keys(next).forEach((key) => {
        const filtered = next[key].filter((id) => id !== childRelId);
        if (filtered.length === 0) {
          delete next[key];
        } else {
          next[key] = filtered;
        }
      });
      return next;
    });
  };

  const persistLayout = useCallback(() => {
    if (hydratingRef.current || !onPersist) return;
    const payload: FamilyLayoutState = {
      assignments,
      manualOrders,
      removedSpouseIds: Array.from(removedSpouseIds),
      removedChildIds: Array.from(removedChildIds)
    };
    const snapshot = JSON.stringify(payload);
    if (snapshot === lastPersistedRef.current) return;
    lastPersistedRef.current = snapshot;
    onPersist(personId, payload);
  }, [assignments, manualOrders, removedSpouseIds, removedChildIds, onPersist, personId]);

  const beginDrag = (event: React.DragEvent, childId: string, groupId: string | null) => {
    event.stopPropagation();
    event.dataTransfer.effectAllowed = 'move';
    setDragContext({ childId, groupKey: keyForGroup(groupId) });
  };

  const endDrag = () => {
    setDragContext(null);
  };

  const handleDragOver = (event: React.DragEvent, groupId: string | null) => {
    if (!dragContext) return;
    const canonical = keyForGroup(groupId);
    if (dragContext.groupKey !== canonical) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
    setHoverGroup(canonical);
  };

  const normalizeGroupKey = (groupKey: string) => (groupKey === 'unassigned' ? null : groupKey);

  const insertChildInOrder = (order: string[], childId: string, targetChildId: string | null) => {
    const filtered = order.filter((id) => id !== childId);
    if (targetChildId && filtered.includes(targetChildId)) {
      const targetIndex = filtered.indexOf(targetChildId);
      filtered.splice(targetIndex, 0, childId);
    } else {
      filtered.push(childId);
    }
    return filtered;
  };

  const reorderWithinGroup = (targetChildId: string | null, groupId: string | null) => {
    if (!dragContext) return false;
    const canonical = keyForGroup(groupId);
    if (dragContext.groupKey !== canonical) return false;
    const normalized = normalizeGroupKey(canonical);
    const orderedIds = getDisplayChildren(normalized).map((child) => child.rel.id);
    const newOrder = insertChildInOrder(orderedIds, dragContext.childId, targetChildId);
    setManualOrders((prev) => ({ ...prev, [canonical]: newOrder }));
    return true;
  };

  const moveChildToGroup = (targetChildId: string | null, groupId: string | null) => {
    if (!dragContext) return;
    const targetKey = keyForGroup(groupId);
    const sourceKey = dragContext.groupKey;
    if (sourceKey === targetKey) {
      reorderWithinGroup(targetChildId, groupId);
      endDrag();
      return;
    }
    const normalizedTarget = normalizeGroupKey(targetKey);
    setAssignments((prev) => ({ ...prev, [dragContext.childId]: normalizedTarget }));
    scrubChildFromManualOrders(dragContext.childId);
    setManualOrders((prev) => {
      const next = { ...prev };
      const base = next[targetKey] ? next[targetKey].filter((id) => id !== dragContext.childId) : [];
      next[targetKey] = insertChildInOrder(base, dragContext.childId, targetChildId);
      return next;
    });
    endDrag();
  };

  const handleDropOnChild = (event: React.DragEvent, childId: string, groupId: string | null) => {
    event.preventDefault();
    moveChildToGroup(childId, groupId);
    setHoverGroup(null);
  };

  const handleDropOnGroup = (event: React.DragEvent, groupId: string | null) => {
    event.preventDefault();
    moveChildToGroup(null, groupId);
    setHoverGroup(null);
  };

  const handleDragLeave = (event: React.DragEvent, groupId: string | null) => {
    const canonical = keyForGroup(groupId);
    if (hoverGroup === canonical) {
      setHoverGroup(null);
    }
  };

  useEffect(() => {
    if (hydratingRef.current) return;
    const debounce = setTimeout(() => {
      persistLayout();
    }, 500);
    return () => clearTimeout(debounce);
  }, [assignments, manualOrders, removedSpouseIds, removedChildIds, persistLayout]);

  const handleReassignChild = (childRelId: string, targetValue: string) => {
    const targetId = targetValue === 'unassigned' ? null : targetValue;
    setAssignments((prev) => ({ ...prev, [childRelId]: targetId }));
    scrubChildFromManualOrders(childRelId);
  };

  const handleUnlinkChild = (childRelId: string) => {
    setRemovedChildIds((prev) => new Set(prev).add(childRelId));
    setAssignments((prev) => {
      const next = { ...prev };
      delete next[childRelId];
      return next;
    });
    scrubChildFromManualOrders(childRelId);
  };

  const handleUnlinkSpouse = (spouseId: string) => {
    setRemovedSpouseIds((prev) => {
      const next = new Set(prev);
      next.add(spouseId);
      return next;
    });
    setAssignments((prev) => {
      const next = { ...prev };
      Object.keys(next).forEach((childRelId) => {
        if (next[childRelId] === spouseId) {
          next[childRelId] = null;
        }
      });
      return next;
    });
    setManualOrders((prev) => {
      const next = { ...prev };
      delete next[keyForGroup(spouseId)];
      return next;
    });
  };

  const availableSpouseOptions = activeSpouses.map((sp) => ({
    id: sp.rel.id,
    name: `${sp.person.firstName} ${sp.person.lastName}`
  }));

  const renderChildRow = (child: { person: Person; rel: Relationship }) => {
    const assignment = assignments[child.rel.id] ?? null;
    const selectedValue = assignment ?? 'unassigned';
    return (
      <div
        key={child.rel.id}
        className={`p-4 bg-white rounded-2xl border flex flex-col gap-3 shadow-sm transition ${
          hoverGroup === keyForGroup(assignment) ? 'border-blue-400 bg-blue-50/40' : 'border-slate-100'
        }`}
        onDragOver={(event) => handleDragOver(event, assignment)}
        onDragLeave={(event) => handleDragLeave(event, assignment)}
        onDrop={(event) => handleDropOnChild(event, child.rel.id, assignment)}
      >
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <button
              type="button"
              draggable
              onDragStart={(event) => beginDrag(event, child.rel.id, assignment)}
              onDragEnd={endDrag}
              className="p-1 text-slate-400 hover:text-slate-900 cursor-grab active:cursor-grabbing"
              aria-label="Drag to reorder child"
            >
              <GripVertical className="w-4 h-4" />
            </button>
            <p className="text-sm font-semibold text-slate-900">{child.person.firstName} {child.person.lastName}</p>
            {child.person.birthDate && (
              <p className="text-[10px] text-slate-400">Born {formatYear(child.person.birthDate)}</p>
            )}
          </div>
          <div className="flex items-center gap-2" />
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <select
            value={selectedValue}
            onChange={(e) => handleReassignChild(child.rel.id, e.target.value)}
            className="px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-[10px] font-black uppercase tracking-widest"
          >
            <option value="unassigned">Unassigned</option>
            {availableSpouseOptions.map((option) => (
              <option key={option.id} value={option.id}>{option.name}</option>
            ))}
          </select>
          <div className="flex-1" />
          <button
            type="button"
            onClick={() => handleUnlinkChild(child.rel.id)}
            className="p-2 rounded-full border border-rose-200 text-rose-500 hover:bg-rose-50 transition"
            aria-label="Unlink child from family"
          >
            <UnlinkIcon className="w-4 h-4" />
          </button>
        </div>
      </div>
    );
  };

  const unassignedChildren = getDisplayChildren(null);

  return (
    <div className="space-y-6">
      {activeSpouses.length === 0 && (
        <div className="space-y-4">
          <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest ml-1">Spousal Unions</p>
          <p className="text-xs text-slate-400 italic p-4">No partner records found.</p>
        </div>
      )}
      {activeSpouses.map((spouse) => {
        const metaBits: string[] = [];
        if (spouse.rel.date) metaBits.push(`Since ${formatYear(spouse.rel.date)}`);
        if (spouse.rel.status) metaBits.push(spouse.rel.status.replace(/_/g, ' '));
        const childrenForSpouse = getDisplayChildren(spouse.rel.id);
        return (
          <div key={spouse.rel.id} className="space-y-3">
            <div className="flex items-center justify-between">
              {renderRelationCard(spouse, 'Spousal Link', metaBits.join(' • ') || undefined)}
              <button
                className="text-[9px] font-black uppercase tracking-[0.3em] text-rose-500 hover:text-rose-600"
                onClick={() => handleUnlinkSpouse(spouse.rel.id)}
              >
                Unlink Spouse
              </button>
            </div>
            <div
              className={`ml-4 border-l pl-4 space-y-3 transition ${
                hoverGroup === spouse.rel.id ? 'border-blue-300 bg-blue-50/30 rounded-2xl' : 'border-slate-200'
              }`}
              onDragOver={(event) => handleDragOver(event, spouse.rel.id)}
              onDragLeave={(event) => handleDragLeave(event, spouse.rel.id)}
              onDrop={(event) => handleDropOnGroup(event, spouse.rel.id)}
            >
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Children of this union</p>
              {childrenForSpouse.length > 0 ? (
                <>
                  {childrenForSpouse.map((child) => renderChildRow(child))}
                  <div className="border border-dashed border-slate-200 rounded-xl text-[10px] text-slate-400 uppercase tracking-widest text-center py-2">
                    Drag here to place last
                  </div>
                </>
              ) : (
                <p className="text-xs text-slate-400 italic">No children linked to this spouse.</p>
              )}
            </div>
         </div>
       );
     })}

      {unassignedChildren.length > 0 && (
        <div
          className={`space-y-3 transition ${
            hoverGroup === 'unassigned' ? 'border border-dashed border-blue-300 rounded-2xl bg-blue-50/30 p-3' : ''
          }`}
          onDragOver={(event) => handleDragOver(event, null)}
          onDragLeave={(event) => handleDragLeave(event, null)}
          onDrop={(event) => handleDropOnGroup(event, null)}
        >
          <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest ml-1">Unassigned Descendants</p>
          {unassignedChildren.map((child) => renderChildRow(child))}
          <div className="border border-dashed border-slate-200 rounded-xl text-[10px] text-slate-400 uppercase tracking-widest text-center py-2">
            Drag here to place last
          </div>
        </div>
      )}
    </div>
  );
};
