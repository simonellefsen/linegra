import React, { useState, useRef, useEffect } from 'react';
import { 
  Upload, 
  Download, 
  AlertCircle, 
  CheckCircle2, 
  Loader2, 
  Wifi
} from 'lucide-react';
import { Person, Relationship, PersonEvent, Source, Citation, StructuredPlace, AlternateName } from '../types';

interface ImportExportProps {
  people: Person[];
  relationships: Relationship[];
  onImport: (data: { people: Person[]; relationships: Relationship[] }) => void;
  activeTreeName?: string;
  showGedcomSection?: boolean;
}

type ParsedPerson = Partial<Person> & {
  events?: PersonEvent[];
  sourceIds?: string[];
  inlineSources?: Source[];
  citations?: Citation[];
  metadata?: Record<string, any>;
};

const GEDCOM_EVENT_MAP: Record<string, PersonEvent['type']> = {
  RESI: 'Residence',
  OCCU: 'Occupation',
  IMMI: 'Immigration',
  EMIG: 'Emigration',
  NATU: 'Naturalization',
  MILI: 'Military Service',
  EDUC: 'Education',
  BAPM: 'Baptism',
  CHR: 'Christening',
  CONF: 'Confirmation',
  BURI: 'Burial',
  CREM: 'Cremation',
  PROB: 'Probate',
  ADOP: 'Adoption',
  EVEN: 'Other'
};

const GEDCOM_EVENT_LABELS: Record<string, string> = {
  BIRT: 'Birth',
  DEAT: 'Death',
  BURI: 'Burial',
  CREM: 'Cremation',
  CHR: 'Christening',
  ADOP: 'Adoption',
  PROB: 'Probate',
  RESI: 'Residence',
  OCCU: 'Occupation',
  IMMI: 'Immigration',
  EMIG: 'Emigration',
  NATU: 'Naturalization',
  MILI: 'Military Service',
  EDUC: 'Education',
  BAPM: 'Baptism',
  CONF: 'Confirmation',
  EVEN: 'Other'
};

const ImportExport: React.FC<ImportExportProps> = ({
  people,
  relationships,
  onImport,
  activeTreeName,
  showGedcomSection = true
}) => {
  const LARGE_IMPORT_THRESHOLD = 250;
  const [isImporting, setIsImporting] = useState(false);
  const [status, setStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const [importStats, setImportStats] = useState({ people: 0, relationships: 0 });
  const [importWarnings, setImportWarnings] = useState<string[]>([]);
  const [pendingImport, setPendingImport] = useState<{ data: { people: Person[]; relationships: Relationship[] }; fileName: string } | null>(null);
  const [showProgressBanner, setShowProgressBanner] = useState(false);
  const [progressValue, setProgressValue] = useState(0);
  const progressIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  
  const fileInputRef = useRef<HTMLInputElement>(null);

  const clearProgressInterval = () => {
    if (progressIntervalRef.current) {
      clearInterval(progressIntervalRef.current);
      progressIntervalRef.current = null;
    }
  };

  const beginProgress = () => {
    setShowProgressBanner(true);
    setProgressValue(5);
    clearProgressInterval();
    progressIntervalRef.current = setInterval(() => {
      setProgressValue((prev) => {
        const next = prev + Math.random() * 8;
        return next >= 92 ? 92 : next;
      });
    }, 700);
  };

  const finishProgress = () => {
    clearProgressInterval();
    setProgressValue(100);
    setTimeout(() => {
      setShowProgressBanner(false);
      setProgressValue(0);
    }, 1200);
  };

  useEffect(() => {
    return () => {
      clearProgressInterval();
    };
  }, []);

  const parseGEDCOM = (text: string) => {
    const lines = text.split(/\r?\n/);
    const parsedPeople: Record<string, ParsedPerson> = {};
    const parsedFamilies: Record<string, { 
      husb?: string; 
      wife?: string; 
      children: string[]; 
      date?: string; 
      place?: string; 
      type?: string; 
      marriageNotes?: string[];
      generalNotes?: string[];
      divorceDate?: string; 
      divorceNotes?: string; 
      updatedAt?: string 
    }> = {};
    const parsedSources: Record<string, Source & { abbreviation?: string; callNumber?: string }> = {};
    const familyChildRoles: Record<string, Record<string, { father?: string; mother?: string; overall?: string }>> = {};
    const warnings: string[] = [];
    
    let currentId = '';
    let currentType: 'INDI' | 'FAM' | 'SOUR' | null = null;
    let currentTag = '';
    let currentEvent: PersonEvent | null = null;
    const supportedIndividualTags = new Set([
      'NAME',
      'SEX',
      'GIVN',
      'SURN',
      'BIRT',
      'DEAT',
      'SOUR',
      '_LIVING',
      '_PRIVATE',
      '_AKA',
      '_MARNM',
      'TITL',
      'RFN',
      'EMAIL',
      'SUBM',
      'ADDR',
      'ADR1',
      'ADR2',
      'CITY',
      'STAE',
      'STATE',
      'CTRY',
      'POST',
      'POSTAL',
      'POSTCODE',
      'ZIP',
      ...Object.keys(GEDCOM_EVENT_MAP),
      'CHAN',
      'BURI',
      'FAMC',
      'FAMS'
    ]);
    const supportedFamilyTags = new Set(['HUSB', 'WIFE', 'CHIL', 'MARR', 'DIV', 'CHAN', 'NOTE', 'DATE', 'PLAC', 'TYPE', 'ADDR', 'CITY', 'CTRY', 'STAE', 'STATE']);
    const lineRegex = /^(\d+)\s+(?:(@[^@]+@)\s+)?([A-Z0-9_]+)(?:\s+(.*))?$/i;
    let currentEventLabel = '';
    let currentEventSource: Source | null = null;
    let currentEventSourceLevel = 0;
    let currentCitation: Citation | null = null;
    let currentCitationLevel = 0;
    let currentCitationDataLevel = 0;
    let lastCitationTextTarget: Citation | null = null;
    let currentPlaceRef: StructuredPlace | null = null;
    let currentPlaceLevel = -1;
    let currentNameLevel = -1;
    let primaryNameCaptured = false;
    let currentNameContext: { target: 'primary' | 'alternate'; index?: number } | null = null;
    let currentFamcRef: string | null = null;
    let currentAdopFamId: string | null = null;
    let pendingAdoption: { familyId: string; childId: string } | null = null;

    const ensureMetadata = (person: ParsedPerson) => {
      if (!person.metadata) person.metadata = {};
      return person.metadata;
    };

    const parseNameValue = (raw: string) => {
      if (!raw) return { firstName: '', lastName: '' };
      if (raw.includes('/')) {
        const parts = raw.split('/');
        return { firstName: (parts[0] || '').trim(), lastName: (parts[1] || '').trim() };
      }
      const tokens = raw.trim().split(/\s+/);
      if (tokens.length === 1) return { firstName: tokens[0], lastName: '' };
      const lastName = tokens.pop() || '';
      return { firstName: tokens.join(' '), lastName };
    };

    const ensureAlternateNames = (person: ParsedPerson) => person.alternateNames || (person.alternateNames = []);

    const ensureStructuredPlace = (value?: string | StructuredPlace, seed?: string): StructuredPlace => {
      if (!value) {
        return { fullText: seed || '' };
      }
      if (typeof value === 'string') {
        return { fullText: seed || value };
      }
      if (seed && !value.fullText) {
        value.fullText = seed;
      }
      return value;
    };

    const assignPlaceToContext = (
      person: ParsedPerson,
      level: number,
      value: string,
      options: { treatAsAddress?: boolean; allowPersonAddress?: boolean } = {}
    ) => {
      let targetPlace: StructuredPlace | null = null;
      if (currentEvent) {
        const placeObj = ensureStructuredPlace(currentEvent.place as StructuredPlace | string | undefined, value);
        if (value) {
          if (options.treatAsAddress) placeObj.placeName = value;
          else placeObj.fullText = value;
        }
        currentEvent.place = placeObj;
        targetPlace = placeObj;
      } else if (currentTag === 'BIRT') {
        const placeObj = ensureStructuredPlace(person.birthPlace as StructuredPlace | string | undefined, value);
        if (value) {
          if (options.treatAsAddress) placeObj.placeName = value;
          else placeObj.fullText = value;
        }
        person.birthPlace = placeObj;
        targetPlace = placeObj;
      } else if (currentTag === 'DEAT') {
        const placeObj = ensureStructuredPlace(person.deathPlace as StructuredPlace | string | undefined, value);
        if (value) {
          if (options.treatAsAddress) placeObj.placeName = value;
          else placeObj.fullText = value;
        }
        person.deathPlace = placeObj;
        targetPlace = placeObj;
      } else if (currentTag === 'BURI') {
        const placeObj = ensureStructuredPlace(person.burialPlace as StructuredPlace | string | undefined, value);
        if (value) {
          if (options.treatAsAddress) placeObj.placeName = value;
          else placeObj.fullText = value;
        }
        person.burialPlace = placeObj;
        targetPlace = placeObj;
      } else if (options.allowPersonAddress) {
        const metadata = ensureMetadata(person);
        const list: StructuredPlace[] = metadata.contactAddresses || (metadata.contactAddresses = []);
        const placeObj: StructuredPlace = { fullText: value || '', placeName: value || undefined };
        list.push(placeObj);
        targetPlace = placeObj;
      }
      if (targetPlace) {
        currentPlaceRef = targetPlace;
        currentPlaceLevel = level;
      }
    };

    const assignPlaceDetail = (tag: string, value: string) => {
      if (!currentPlaceRef || !value) return;
      switch (tag) {
        case 'ADR1':
          currentPlaceRef.street = value;
          break;
        case 'ADR2':
        case 'ADR3':
          currentPlaceRef.notes = currentPlaceRef.notes ? `${currentPlaceRef.notes}\n${value}` : value;
          break;
        case 'CITY':
          currentPlaceRef.city = value;
          break;
        case 'STAE':
        case 'STATE':
          currentPlaceRef.state = value;
          break;
        case 'CTRY':
          currentPlaceRef.country = value;
          break;
        case 'POST':
        case 'POSTAL':
        case 'POSTCODE':
        case 'ZIP':
          currentPlaceRef.zip = value;
          break;
        default:
          break;
      }
    };

    const addressTags = new Set(['ADDR', 'ADR1', 'ADR2', 'ADR3', 'CITY', 'STAE', 'STATE', 'CTRY', 'POST', 'POSTAL', 'POSTCODE', 'ZIP']);

    const markChildRole = (
      familyId: string,
      childId: string,
      role: string,
      side: 'father' | 'mother' | 'both' = 'both'
    ) => {
      if (!familyId || !childId || !role) return;
      const bucket = familyChildRoles[familyId] || (familyChildRoles[familyId] = {});
      const entry = bucket[childId] || (bucket[childId] = {});
      const normalized = role.toLowerCase();
      if (side === 'father' || side === 'both') entry.father = normalized;
      if (side === 'mother' || side === 'both') entry.mother = normalized;
      if (!entry.overall) entry.overall = normalized;
    };

    const deriveParentRelationshipType = (
      roleValue: string | undefined,
      defaultType: Relationship['type']
    ): Relationship['type'] => {
      if (!roleValue) return defaultType;
      const normalized = roleValue.toLowerCase();
      if (/(adopt|sealed|legal)/.test(normalized)) {
        return defaultType === 'bio_father' ? 'adoptive_father' : 'adoptive_mother';
      }
      if (/(foster|guardian|custod|ward|care)/.test(normalized)) {
        return 'guardian';
      }
      if (/(step|half)/.test(normalized)) {
        return 'step_parent';
      }
      if (/(birth|bio|natural|blood|genetic)/.test(normalized)) {
        return defaultType;
      }
      return defaultType;
    };

    lines.forEach((line) => {
      const match = line.match(lineRegex);
      if (!match) return;

      const [, levelStr, pointerToken, tagRaw, rest] = match;
      const level = parseInt(levelStr, 10);
      const tag = tagRaw.toUpperCase();
      const value = (rest ?? '').trim();

      if (currentPlaceRef && level <= currentPlaceLevel && !addressTags.has(tag)) {
        currentPlaceRef = null;
        currentPlaceLevel = -1;
      }
      if (currentNameContext && level <= currentNameLevel && tag !== 'GIVN' && tag !== 'SURN' && tag !== '_MARNM' && tag !== '_AKA') {
        currentNameContext = null;
        currentNameLevel = -1;
      }
      if (currentEventSource && level <= currentEventSourceLevel) {
        currentEventSource = null;
        currentEventSourceLevel = 0;
      }
      if (currentCitation && level <= currentCitationLevel && tag !== 'CONT') {
        currentCitation = null;
        currentCitationDataLevel = 0;
        lastCitationTextTarget = null;
      }

      if (level === 0) {
        currentEvent = null;
        const pointerId = pointerToken ? pointerToken.replace(/@/g, '') : '';
        if (pointerToken && tag === 'INDI') {
          currentId = pointerId;
          currentType = 'INDI';
          parsedPeople[currentId] = { id: currentId, firstName: '', lastName: '', updatedAt: new Date().toISOString(), events: [], sourceIds: [], inlineSources: [] };
          primaryNameCaptured = false;
          currentNameContext = null;
          currentNameLevel = -1;
          currentPlaceRef = null;
          currentPlaceLevel = -1;
        } else if (pointerToken && tag === 'FAM') {
          currentId = pointerId;
          currentType = 'FAM';
          parsedFamilies[currentId] = parsedFamilies[currentId] || { children: [] };
        } else if (pointerToken && tag === 'SOUR') {
          currentId = pointerId;
          currentType = 'SOUR';
          parsedSources[currentId] = {
            id: currentId,
            title: '',
            type: 'Unknown',
            reliability: 1,
            actualText: ''
          };
        } else {
          currentType = null;
        }
      } else if (currentType === 'INDI' && parsedPeople[currentId]) {
        const p = parsedPeople[currentId];
        const appendNote = (text: string, label: string) => {
          const notesArr = p.notes || (p.notes = []);
          notesArr.push({
            id: `note-${currentId}-${notesArr.length + 1}`,
            text,
            type: 'Research Note',
            event: label || 'General'
          });
        };
        if (level === 1 && tag !== 'DATE' && tag !== 'PLAC' && tag !== 'NOTE') {
          currentEvent = null;
          currentTag = '';
          currentEventLabel = GEDCOM_EVENT_LABELS[tag] || '';
          if (tag !== 'FAMC') currentFamcRef = null;
          if (tag !== 'ADOP') {
            currentAdopFamId = null;
            pendingAdoption = null;
          }
        }
        if (tag === 'NAME' && level === 1) {
          const { firstName, lastName } = parseNameValue(value);
          if (!primaryNameCaptured) {
            if (firstName) p.firstName = firstName;
            if (lastName) p.lastName = lastName;
            primaryNameCaptured = true;
            currentNameContext = { target: 'primary' };
          } else {
            const names = ensureAlternateNames(p);
            const existingIndex = names.findIndex(
              (alt) => alt.firstName === firstName && alt.lastName === lastName
            );
            if (existingIndex >= 0) {
              currentNameContext = { target: 'alternate', index: existingIndex };
            } else {
              const alt: AlternateName = {
                type: 'Also Known As',
                firstName: firstName || p.firstName || '',
                lastName: lastName || p.lastName || ''
              };
              names.push(alt);
              currentNameContext = { target: 'alternate', index: names.length - 1 };
            }
          }
          currentNameLevel = level;
        } else if ((tag === 'GIVN' || tag === 'SURN') && currentNameContext && level > currentNameLevel) {
          if (currentNameContext.target === 'primary') {
            if (tag === 'GIVN') p.firstName = value;
            else p.lastName = value;
          } else if (currentNameContext.index !== undefined) {
            const names = ensureAlternateNames(p);
            const alt = names[currentNameContext.index];
            if (alt) {
              if (tag === 'GIVN') alt.firstName = value;
              else alt.lastName = value;
            }
          }
        } else if (tag === '_AKA' && value) {
          const { firstName, lastName } = parseNameValue(value);
          const names = ensureAlternateNames(p);
          names.push({
            type: 'Alias',
            firstName: firstName || p.firstName || '',
            lastName: lastName || p.lastName || ''
          });
        } else if (tag === '_MARNM' && value) {
          const names = ensureAlternateNames(p);
          const baseFirst =
            currentNameContext?.target === 'alternate' && currentNameContext.index !== undefined
              ? names[currentNameContext.index!]?.firstName || p.firstName || ''
              : p.firstName || '';
          names.push({
            type: 'Married Name',
            firstName: baseFirst,
            lastName: value
          });
        } else if (tag === 'TITL') {
          p.title = value;
        } else if (tag === 'SEX') {
          p.gender = value === 'F' ? 'F' : (value === 'M' ? 'M' : 'O');
        } else if (tag === 'EMAIL') {
          const metadata = ensureMetadata(p);
          const emails: string[] = metadata.emails || (metadata.emails = []);
          if (value && !emails.includes(value)) emails.push(value);
        } else if (tag === 'RFN') {
          const metadata = ensureMetadata(p);
          const rfns: string[] = metadata.recordFileNumbers || (metadata.recordFileNumbers = []);
          if (value && !rfns.includes(value)) rfns.push(value);
        } else if (tag === 'SUBM') {
          const metadata = ensureMetadata(p);
          const submitters: string[] = metadata.submitterIds || (metadata.submitterIds = []);
          if (value && !submitters.includes(value.replace(/@/g, ''))) {
            submitters.push(value.replace(/@/g, ''));
          }
        } else if (tag === 'BIRT') {
          currentTag = 'BIRT';
          currentEvent = null;
          currentEventLabel = GEDCOM_EVENT_LABELS[tag];
        } else if (tag === 'DEAT') {
          currentTag = 'DEAT';
          currentEvent = null;
          currentEventLabel = GEDCOM_EVENT_LABELS[tag];
        } else if (tag === 'BURI') {
          currentTag = 'BURI';
          currentEvent = null;
          currentEventLabel = GEDCOM_EVENT_LABELS[tag];
        } else if (tag === 'FAMC') {
          const famId = value.replace(/@/g, '');
          if (!famId) {
            currentFamcRef = null;
          }
          if (currentTag === 'ADOP' && level >= 2) {
            currentAdopFamId = famId;
            pendingAdoption = famId ? { familyId: famId, childId: currentId } : null;
          } else if (famId) {
            if (!parsedFamilies[famId]) {
              parsedFamilies[famId] = { children: [] };
            }
            if (!parsedFamilies[famId].children.includes(currentId)) {
              parsedFamilies[famId].children.push(currentId);
            }
            currentFamcRef = famId;
          }
        } else if (tag === 'FAMS') {
          const famId = value.replace(/@/g, '');
          if (famId) {
            if (!parsedFamilies[famId]) {
              parsedFamilies[famId] = { children: [] };
            }
            const fam = parsedFamilies[famId];
            if (p.gender === 'F') {
              fam.wife = fam.wife || currentId;
            } else if (p.gender === 'M') {
              fam.husb = fam.husb || currentId;
            } else {
              if (!fam.husb) fam.husb = currentId;
              else if (!fam.wife) fam.wife = currentId;
            }
          }
        } else if (tag === 'CHAN') {
          currentTag = 'CHAN';
          currentEventLabel = '';
        } else if (tag === '_LIVING') {
          p.isLiving = value.trim().toUpperCase() === 'Y';
        } else if (tag === '_PRIVATE') {
          p.isPrivate = value.trim().toUpperCase() === 'Y';
        } else if (tag === 'PEDI' && currentFamcRef) {
          markChildRole(currentFamcRef, currentId, value || 'adopted');
        } else if (tag === 'ADOP' && level > 1 && currentAdopFamId) {
          const adopChildId =
            (pendingAdoption && pendingAdoption.familyId === currentAdopFamId
              ? pendingAdoption.childId
              : currentId) || currentId;
          if (adopChildId) {
            const normalizedValue = (value || '').toLowerCase();
            let side: 'father' | 'mother' | 'both' = 'both';
            if (normalizedValue.includes('husb') || normalizedValue.includes('father')) {
              side = 'father';
            } else if (normalizedValue.includes('wife') || normalizedValue.includes('mother')) {
              side = 'mother';
            }
            const roleToken =
              normalizedValue && !['husb', 'wife', 'mother', 'father', 'both'].includes(normalizedValue)
                ? normalizedValue
                : 'adopted';
            markChildRole(currentAdopFamId, adopChildId, roleToken || 'adopted', side);
          }
        } else if (GEDCOM_EVENT_MAP[tag]) {
          currentTag = tag;
          const events = p.events || (p.events = []);
          currentEvent = {
            id: `evt-${currentId}-${events.length + 1}`,
            type: GEDCOM_EVENT_MAP[tag],
            date: '',
            place: '',
            description: value
          };
          events.push(currentEvent);
          currentEventLabel = GEDCOM_EVENT_LABELS[tag] || tag;
        } else if (tag === 'DATE' && level === 2) {
          if (currentTag === 'BIRT') p.birthDate = value;
          if (currentTag === 'DEAT') p.deathDate = value;
          if (currentTag === 'BURI') p.burialDate = value;
          if (currentEvent) currentEvent.date = value;
          if (currentTag === 'CHAN') {
            const parsed = Date.parse(value);
            p.updatedAt = Number.isNaN(parsed) ? value : new Date(parsed).toISOString();
          }
        } else if (tag === 'PLAC' && level === 2) {
          assignPlaceToContext(p, level, value);
        } else if (tag === 'ADDR') {
          assignPlaceToContext(p, level, value, { treatAsAddress: true, allowPersonAddress: level === 1 });
        } else if (addressTags.has(tag) && tag !== 'ADDR') {
          assignPlaceDetail(tag, value);
        } else if (tag === 'NOTE' && ['BIRT', 'DEAT', 'BURI'].includes(currentTag)) {
          appendNote(value, GEDCOM_EVENT_LABELS[currentTag] || currentEventLabel || 'General');
        } else if (tag === 'NOTE' && currentEvent && level === 2) {
          currentEvent.description = `${currentEvent.description || ''}\nNote: ${value}`.trim();
        } else if (tag === 'PAGE') {
          if (currentEventSource) {
            currentEventSource.page = value;
          }
          if (currentCitation) {
            currentCitation.page = value;
          }
        } else if (tag === 'QUAY' && currentCitation) {
          currentCitation.quality = value;
          currentCitation.extra = { ...(currentCitation.extra || {}), quality: value };
        } else if (tag === 'DATA' && currentCitation) {
          currentCitationDataLevel = level;
        } else if (tag === 'DATE' && currentCitation && currentCitationDataLevel && level > currentCitationDataLevel) {
          currentCitation.dataDate = value;
          currentCitation.extra = { ...(currentCitation.extra || {}), data_date: value };
        } else if (tag === 'TEXT' && currentCitation) {
          const existing = currentCitation.dataText || currentCitation.extra?.data_text || '';
          const combined = existing ? `${existing}\n${value}` : value;
          currentCitation.dataText = combined;
          currentCitation.extra = { ...(currentCitation.extra || {}), data_text: combined };
          lastCitationTextTarget = currentCitation;
        } else if (tag === 'CONT' && lastCitationTextTarget) {
          const existing = lastCitationTextTarget.dataText || lastCitationTextTarget.extra?.data_text || '';
          const combined = existing ? `${existing}\n${value}` : value;
          lastCitationTextTarget.dataText = combined;
          lastCitationTextTarget.extra = { ...(lastCitationTextTarget.extra || {}), data_text: combined };
        } else if (tag === 'NOTE' && currentEventSource && level > currentEventSourceLevel) {
          currentEventSource.notes = `${currentEventSource.notes || ''}\n${value}`.trim();
        } else if (tag === 'SOUR' && level >= 1) {
          const personSources = p.sources || (p.sources = []);
          const eventLabel = GEDCOM_EVENT_LABELS[currentTag] || currentEventLabel || 'General';
          const pointerId = value.startsWith('@') ? value.replace(/@/g, '') : '';
          const nextId = `source-${currentId}-${personSources.length + 1}`;
          let sourceEntry: Source;
          if (pointerId) {
            const base = parsedSources[pointerId];
            sourceEntry = {
              id: nextId,
              externalId: pointerId,
              title: base?.title || `Source ${pointerId}`,
              type: base?.type || 'Unknown',
              repository: base?.repository,
              page: base?.page,
              citationDate: base?.citationDate,
              actualText: base?.actualText,
              event: eventLabel,
              url: base?.url,
              reliability: base?.reliability as 1 | 2 | 3 | undefined
            };
          } else {
            sourceEntry = {
              id: nextId,
              externalId: nextId,
              title: value || `${eventLabel} Source`,
              type: 'Unknown',
              actualText: value,
              event: eventLabel
            };
          }
          personSources.push(sourceEntry);
          currentEventSource = sourceEntry;
          currentEventSourceLevel = level;
          const citationList = p.citations || (p.citations = []);
          const citationId = `cite-${currentId}-${citationList.length + 1}`;
          const citation: Citation = {
            id: citationId,
            sourceId: sourceEntry.id || pointerId || nextId,
            eventLabel,
            label: sourceEntry.title || sourceEntry.abbreviation || eventLabel,
            page: sourceEntry.page,
            extra: {}
          };
          citationList.push(citation);
          currentCitation = citation;
          currentCitationLevel = level;
          currentCitationDataLevel = 0;
          lastCitationTextTarget = null;
        } else if (tag === 'NOTE' && currentEvent) {
          currentEvent.description = `${currentEvent.description || ''}\nNote: ${value}`.trim();
        } else if (tag === 'TYPE' && currentEvent) {
          const typeText = value;
          if (currentTag === 'EVEN' && typeText) {
            currentEvent.type = typeText;
          }
          currentEvent.description = currentEvent.description
            ? `${currentEvent.description}\nType: ${typeText}`
            : `Type: ${typeText}`;
        } else if (tag === 'NOTE' && level === 1) {
          appendNote(value, currentEventLabel || 'General');
        } else if (level === 1 && !supportedIndividualTags.has(tag)) {
          warnings.push(`Ignored individual tag "${tag}" on record ${currentId}`);
        }
      } else if (currentType === 'FAM' && parsedFamilies[currentId]) {
        const f = parsedFamilies[currentId];
        if (tag === 'HUSB') f.husb = value.replace(/@/g, '');
        else if (tag === 'WIFE') f.wife = value.replace(/@/g, '');
        else if (tag === 'CHIL') f.children.push(value.replace(/@/g, ''));
        else if (tag === 'MARR') currentTag = 'MARR';
        else if (tag === 'DIV') currentTag = 'DIV';
        else if (tag === 'CHAN') currentTag = 'CHAN';
        else if (tag === 'DATE' && level === 2 && currentTag === 'MARR') f.date = value;
        else if (tag === 'DATE' && level === 2 && currentTag === 'DIV') f.divorceDate = value;
        else if (tag === 'DATE' && level === 2 && currentTag === 'CHAN') f.updatedAt = value;
        else if (tag === 'PLAC' && level === 2 && currentTag === 'MARR') f.place = value;
        else if (tag === 'TYPE' && level === 2 && currentTag === 'MARR') f.type = value;
        else if (tag === 'NOTE' && level >= 2 && currentTag === 'MARR') {
          if (!f.marriageNotes) f.marriageNotes = [];
          f.marriageNotes.push(value);
        }
        else if (tag === 'NOTE' && level >= 2 && currentTag === 'DIV') {
          f.divorceNotes = f.divorceNotes ? `${f.divorceNotes}\n${value}` : value;
        } else if (tag === 'NOTE' && level === 1) {
          if (!f.generalNotes) f.generalNotes = [];
          f.generalNotes.push(value);
        } else if (level === 1 && !supportedFamilyTags.has(tag)) {
          warnings.push(`Ignored family tag "${tag}" on record ${currentId}`);
        }
      } else if (currentType === 'SOUR' && parsedSources[currentId]) {
        const source = parsedSources[currentId];
        switch (tag) {
          case 'TITL':
            source.title = value;
            break;
          case 'AUTH':
            source.repository = value;
            break;
          case 'PUBL':
            source.notes = value;
            break;
          case 'TEXT':
            source.actualText = value;
            break;
          case 'PAGE':
            source.page = value;
            break;
          case 'NOTE':
            source.notes = `${source.notes || ''}\n${value}`.trim();
            break;
          case 'URL':
            source.url = value;
            break;
          case 'DATE':
            source.citationDate = value;
            break;
          case 'ABBR':
            source.abbreviation = value;
            break;
          case 'CALN':
            source.callNumber = value;
            break;
          default:
            warnings.push(`Ignored source tag "${tag}" on source ${currentId}`);
        }
      }
    });

    Object.entries(parsedFamilies).forEach(([famId, fam]) => {
      if (!fam.husb && !fam.wife && fam.children.length) {
        warnings.push(
          `Family ${famId} lists ${fam.children.length} child(ren) but no parents. The GEDCOM export omitted HUSB/WIFE or matching FAMS tags.`
        );
      }
    });

    const finalPeople: Person[] = Object.values(parsedPeople).map((p) => {
      const mergedSources: Source[] = [];
      (p.sourceIds || []).forEach((id) => {
        const src = parsedSources[id];
        if (src) {
          mergedSources.push({
            ...src,
            id: `source-${p.id}-ref-${mergedSources.length + 1}`,
            externalId: id,
            event: src.event || 'General'
          });
        } else {
          warnings.push(`Person ${p.id} referenced missing source ${id}`);
        }
      });
      (p.inlineSources || []).forEach((src) => mergedSources.push(src));
      (p.sources || []).forEach((src) => mergedSources.push(src));
      return {
        ...p,
        events: (p.events || []).filter((evt) => !['Birth', 'Death', 'Burial'].includes(evt.type || '')),
        sources: mergedSources,
        citations: p.citations || [],
        metadata: p.metadata || {}
      } as Person;
    });

    const finalRelationships: Relationship[] = [];

    Object.entries(parsedFamilies).forEach(([familyId, f], idx) => {
      if (f.husb && f.wife) {
        const noteParts: string[] = [];
        if (f.type) noteParts.push(f.type);
        if (f.marriageNotes?.length) noteParts.push(...f.marriageNotes);
        if (f.generalNotes?.length) noteParts.push(...f.generalNotes);
        if (f.divorceDate) {
          noteParts.push(`Divorce: ${f.divorceDate}`);
          if (f.divorceNotes) noteParts.push(f.divorceNotes);
        }
        finalRelationships.push({
          id: `rel-m-${idx}`,
          treeId: 'imported',
          type: 'marriage',
          personId: f.husb,
          relatedId: f.wife,
          date: f.date,
          place: f.place,
          notes: noteParts.length ? noteParts.join('\n') : undefined,
          confidence: 'Confirmed',
          metadata: { familyId }
        });
      }
      f.children.forEach((childId, cIdx) => {
        const roleEntry = familyChildRoles[familyId]?.[childId];
        const fatherRole = roleEntry?.father || roleEntry?.overall;
        const motherRole = roleEntry?.mother || roleEntry?.overall;
        if (f.husb) {
          const parentType = deriveParentRelationshipType(fatherRole, 'bio_father');
          const metadata: Record<string, unknown> = { familyId, parentSide: 'father' };
          if (fatherRole) metadata.childRole = fatherRole;
          finalRelationships.push({
            id: `rel-f-${idx}-${cIdx}`,
            treeId: 'imported',
            type: parentType,
            personId: f.husb,
            relatedId: childId,
            confidence: 'Confirmed',
            metadata
          });
        }
        if (f.wife) {
          const parentType = deriveParentRelationshipType(motherRole, 'bio_mother');
          const metadata: Record<string, unknown> = { familyId, parentSide: 'mother' };
          if (motherRole) metadata.childRole = motherRole;
          finalRelationships.push({
            id: `rel-mo-${idx}-${cIdx}`,
            treeId: 'imported',
            type: parentType,
            personId: f.wife,
            relatedId: childId,
            confidence: 'Confirmed',
            metadata
          });
        }
      });
    });

    const parentLocks = new Map<string, string>();
    const exclusiveParentTypes: Relationship['type'][] = [
      'bio_father',
      'bio_mother',
      'adoptive_father',
      'adoptive_mother'
    ];
    finalRelationships.forEach((rel) => {
      if (exclusiveParentTypes.includes(rel.type)) {
        const key = `${rel.type}:${rel.relatedId}`;
        if (!parentLocks.has(key)) {
          parentLocks.set(key, rel.personId);
        } else if (parentLocks.get(key) !== rel.personId) {
          const conflictLabel = rel.type.includes('mother') ? 'mother' : 'father';
          warnings.push(
            `Child ${rel.relatedId} already has a ${conflictLabel} link. Converted relationship from ${rel.personId} to guardian.`
          );
          rel.metadata = { ...(rel.metadata || {}), downgradedFrom: rel.type };
          rel.type = 'guardian';
        }
      }
    });

    const seenRelationshipKeys = new Set<string>();
    const dedupedRelationships = finalRelationships.filter((rel) => {
      const key = `${rel.type}:${rel.personId}:${rel.relatedId}`;
      if (seenRelationshipKeys.has(key)) return false;
      seenRelationshipKeys.add(key);
      return true;
    });

    return { people: finalPeople, relationships: dedupedRelationships, warnings };
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsImporting(true);
    setStatus('idle');
    
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const text = event.target?.result as string;
        const data = parseGEDCOM(text);
        
        setImportStats({ people: data.people.length, relationships: data.relationships.length });
        setImportWarnings(data.warnings);
        setPendingImport({ data, fileName: file.name });
        setStatus('idle');
        setIsImporting(false);
        return;
      } catch (err) {
        console.error("Import failed", err);
        setStatus('error');
        setImportWarnings(['Import failed, see console for details.']);
      } finally {
        setIsImporting(false);
      }
    };
    reader.readAsText(file);
  };

  const handleExportGEDCOM = () => {
    let ged = "0 HEAD\n1 SOUR LINEGRA\n1 GEDC\n2 VERS 5.5.1\n2 FORM LINEAGE-LINKED\n1 CHAR UTF-8\n";
    people.forEach(p => {
      ged += `0 @P${p.id}@ INDI\n1 NAME ${p.firstName} /${p.lastName}/\n1 SEX ${p.gender}\n`;
      if (p.birthDate) ged += `1 BIRT\n2 DATE ${p.birthDate}\n2 PLAC ${typeof p.birthPlace === 'string' ? p.birthPlace : p.birthPlace?.fullText || ''}\n`;
      if (p.deathDate) ged += `1 DEAT\n2 DATE ${p.deathDate}\n2 PLAC ${typeof p.deathPlace === 'string' ? p.deathPlace : p.deathPlace?.fullText || ''}\n`;
    });

    const processedFamilies = new Set<string>();
    relationships.forEach((r, idx) => {
      if (r.type === 'marriage') {
        const familyKey = [r.personId, r.relatedId].sort().join('-');
        if (!processedFamilies.has(familyKey)) {
          ged += `0 @F${idx}@ FAM\n1 HUSB @P${r.personId}@\n1 WIFE @P${r.relatedId}@\n`;
          ged += `1 MARR\n`;
          if (r.date) {
            ged += `2 DATE ${r.date}\n`;
          }
          const placeText = typeof r.place === 'string' ? r.place : (typeof r.place === 'object' ? r.place?.fullText : '');
          if (placeText) {
            ged += `2 PLAC ${placeText}\n`;
          }
          if (r.notes) {
            ged += `2 TYPE ${r.notes}\n`;
          }
          // Find children for this marriage
          relationships.filter(childRel => 
            (childRel.type === 'bio_father' && childRel.personId === r.personId) || 
            (childRel.type === 'bio_mother' && childRel.personId === r.relatedId)
          ).forEach(childRel => {
            ged += `1 CHIL @P${childRel.relatedId}@\n`;
          });
          processedFamilies.add(familyKey);
        }
      }
    });

    const blob = new Blob([ged], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `linegra_export_${new Date().toISOString().slice(0,10)}.ged`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  return (
    <div className="space-y-8 max-w-4xl mx-auto pb-20 animate-in fade-in duration-500">
      <input 
        type="file" 
        ref={fileInputRef} 
        onChange={handleFileChange} 
        accept=".ged,.txt" 
        className="hidden" 
      />

      {showGedcomSection && showProgressBanner && (
        <div className="p-5 rounded-[32px] border border-slate-200 bg-white shadow-sm flex flex-col gap-3 animate-in fade-in duration-500">
          <div className="flex items-center justify-between text-sm font-semibold text-slate-700">
            <span>Importing {importStats.people} individuals / {importStats.relationships} links</span>
            <span>{Math.round(progressValue)}%</span>
          </div>
          <div className="h-2 rounded-full bg-slate-100 overflow-hidden">
            <div
              className="h-full bg-slate-900 transition-all duration-300"
              style={{ width: `${Math.min(progressValue, 100)}%` }}
            />
          </div>
          <p className="text-xs text-slate-500">
            Large archives can take a moment while we sync every record into Supabase.
          </p>
        </div>
      )}

      {showGedcomSection && (
        <div className="p-8 rounded-[40px] border-2 bg-white border-emerald-100 shadow-emerald-100/20 shadow-2xl">
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
            <div className="flex gap-5">
              <div className="w-16 h-16 rounded-[22px] flex items-center justify-center shadow-lg bg-emerald-500 text-white">
                <Wifi className="w-8 h-8" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-2xl font-serif font-bold text-slate-900">Archive Synchronized</h3>
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-widest bg-emerald-100 text-emerald-700">
                    Real-time
                  </span>
                </div>
                <p className="text-sm text-slate-500 mt-1 max-w-xl leading-relaxed">
                  {activeTreeName
                    ? `All GEDCOM imports flow directly into the "${activeTreeName}" Supabase tree.`
                    : 'Select a family tree to enable Supabase-backed imports.'}
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {showGedcomSection && (
        <>
      <div className="p-6 bg-amber-50 border border-amber-200 rounded-[32px] space-y-4">
        <div className="flex items-center justify-between text-amber-700">
          <div className="flex items-center gap-2 font-semibold text-sm">
            <AlertCircle className="w-4 h-4" />
            GEDCOM import warnings ({importWarnings.length})
          </div>
          <button
            disabled={!importWarnings.length}
            onClick={() => {
              if (!importWarnings.length) return;
              const log = [`Linegra GEDCOM import log - ${new Date().toISOString()}`, '', ...importWarnings].join('\n');
              const blob = new Blob([log], { type: 'text/plain' });
              const url = URL.createObjectURL(blob);
              const link = document.createElement('a');
              link.href = url;
              link.download = `linegra_gedcom_warnings_${new Date().toISOString().slice(0,10)}.txt`;
              document.body.appendChild(link);
              link.click();
              document.body.removeChild(link);
              URL.revokeObjectURL(url);
            }}
            className={`text-xs font-bold underline ${importWarnings.length ? 'hover:text-amber-800' : 'opacity-50 cursor-not-allowed'}`}
          >
            Download log
          </button>
        </div>
        {importWarnings.length > 0 ? (
          <ul className="list-disc ml-6 text-xs text-amber-800 space-y-1 max-h-48 overflow-auto pr-2">
            {importWarnings.map((warning, idx) => (
              <li key={`${warning}-${idx}`}>{warning}</li>
            ))}
          </ul>
        ) : (
          <p className="text-xs text-amber-700">No warnings recorded yet. Import a GEDCOM to see ignored fields or issues.</p>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        <div className="group bg-white p-8 rounded-[40px] border border-slate-200 shadow-sm hover:shadow-xl transition-all hover:-translate-y-1">
          <div className="w-14 h-14 bg-blue-50 text-blue-600 rounded-2xl flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
            <Upload className="w-7 h-7" />
          </div>
          <h4 className="text-xl font-serif font-bold text-slate-900">GEDCOM Ingestion</h4>
          <p className="text-sm text-slate-500 mt-2 mb-8 leading-relaxed">Import INDI, FAM, and relationships from standard GEDCOM files.</p>
          <button 
            disabled={isImporting}
            className="w-full py-4 bg-slate-50 border border-slate-100 text-slate-900 rounded-2xl font-bold hover:bg-slate-100 transition-all flex items-center justify-center gap-2"
            onClick={() => fileInputRef.current?.click()}
          >
            {isImporting ? <Loader2 className="w-5 h-5 animate-spin" /> : "Choose GEDCOM File"}
          </button>
        </div>

        <div className="group bg-white p-8 rounded-[40px] border border-slate-200 shadow-sm hover:shadow-xl transition-all hover:-translate-y-1">
          <div className="w-14 h-14 bg-slate-900 text-white rounded-2xl flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
            <Download className="w-7 h-7" />
          </div>
          <h4 className="text-xl font-serif font-bold text-slate-900">Universal Export</h4>
          <p className="text-sm text-slate-500 mt-2 mb-8 leading-relaxed">Preserve your research offline with a standard GEDCOM 5.5.1 archive backup.</p>
          <button 
            onClick={handleExportGEDCOM}
            className="w-full py-4 bg-slate-900 text-white rounded-2xl font-bold hover:bg-slate-800 transition-all flex items-center justify-center gap-2 shadow-lg"
          >
            Download Archive
          </button>
        </div>
      </div>

      {status === 'success' && (
        <div className="bg-emerald-50 border border-emerald-100 p-5 rounded-3xl flex items-center gap-4 animate-in slide-in-from-top-4 shadow-sm">
          <div className="w-10 h-10 bg-emerald-100 rounded-full flex items-center justify-center">
            <CheckCircle2 className="w-6 h-6 text-emerald-600" />
          </div>
          <div>
            <p className="text-sm text-emerald-900 font-bold leading-none">Import Successful</p>
            <p className="text-xs text-emerald-600 mt-1">
              Parsed {importStats.people} individuals and {importStats.relationships} relationship mappings.
            </p>
          </div>
        </div>
      )}

      {status === 'error' && (
        <div className="bg-rose-50 border border-rose-100 p-5 rounded-3xl flex items-center gap-4 animate-in slide-in-from-top-4 shadow-sm">
          <div className="w-10 h-10 bg-rose-100 rounded-full flex items-center justify-center">
            <AlertCircle className="w-6 h-6 text-rose-600" />
          </div>
          <div>
            <p className="text-sm text-rose-900 font-bold leading-none">Import Failed</p>
            <p className="text-xs text-rose-600 mt-1">The GEDCOM file could not be parsed. Ensure it is a valid format.</p>
          </div>
        </div>
      )}

      {pendingImport && (
        <div className="fixed inset-0 bg-slate-900/70 backdrop-blur-sm flex items-center justify-center z-50 p-6">
          <div className="bg-white rounded-[32px] border border-slate-200 shadow-2xl max-w-lg w-full p-8 space-y-6">
            <div>
              <p className="text-[11px] font-black text-slate-400 uppercase tracking-[0.3em]">Confirm Import</p>
              <h3 className="text-2xl font-serif font-bold text-slate-900 mt-2">Attach GEDCOM to {activeTreeName || 'current tree'}?</h3>
            </div>
            <p className="text-sm text-slate-600 leading-relaxed">
              You are about to ingest <span className="font-bold text-slate-900">{importStats.people}</span> people and <span className="font-bold text-slate-900">{importStats.relationships}</span> relationships from <span className="font-semibold">{pendingImport.fileName}</span> into <span className="font-semibold">{activeTreeName || 'this tree'}</span>.
            </p>
            {!!importWarnings.length && (
              <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 text-sm text-amber-800 space-y-2 max-h-32 overflow-auto">
                <p className="font-semibold">Warnings</p>
                <ul className="list-disc ml-5 space-y-1">
                  {importWarnings.map((warning, idx) => (
                    <li key={`${warning}-${idx}`}>{warning}</li>
                  ))}
                </ul>
              </div>
            )}
            <div className="flex items-center gap-4">
              <button
                onClick={() => {
                  setPendingImport(null);
                  setStatus('idle');
                }}
                className="px-6 py-3 rounded-2xl border border-slate-200 text-slate-500 text-sm font-bold uppercase tracking-widest hover:bg-slate-100 transition-all"
              >
                Cancel
              </button>
              <button
                onClick={async () => {
                  if (!pendingImport) return;
                  const importPayload = pendingImport;
                  const requiresProgress = importStats.people >= LARGE_IMPORT_THRESHOLD || importStats.relationships >= LARGE_IMPORT_THRESHOLD;
                  if (requiresProgress) beginProgress();
                  setIsImporting(true);
                  setPendingImport(null);
                  try {
                    await onImport(importPayload.data);
                    setStatus('success');
                  } catch (err) {
                    console.error('Confirm import failed', err);
                    setStatus('error');
                  } finally {
                    if (requiresProgress) finishProgress();
                    setIsImporting(false);
                  }
                }}
                className="flex-1 px-6 py-3 rounded-2xl bg-slate-900 text-white text-sm font-black uppercase tracking-[0.2em] hover:bg-slate-800 transition-all"
              >
                Confirm Import
              </button>
            </div>
          </div>
        </div>
      )}
        </>
      )}
    </div>
  );
};

export default ImportExport;
