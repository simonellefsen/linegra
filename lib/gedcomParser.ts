import { Person, Relationship, PersonEvent, Source, Citation, StructuredPlace, AlternateName } from '../types';
import { isImplausiblyOld } from './lifespan';
import { tokenizeGedcom, VOID_POINTER } from './gedcomTokenizer';
import { parseQuay } from './sourceQuality';

export interface GedcomParseResult {
  people: Person[];
  relationships: Relationship[];
  warnings: string[];
  /** HEAD.GEDC.VERS of the imported file, e.g. "5.5.1" or "7.0"; null if absent. */
  version: string | null;
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

/**
 * GEDCOM 7.x models a couple only as a FAM/HUSB/WIFE record with a MARR event — there is no
 * dedicated "cohabiting partner" union. A marriage that was not formalized is conventionally marked
 * with a free-text `MARR.TYPE` (e.g. COMMON LAW, PARTNERS). We map those to our own `partner`
 * relationship type so a cohabiting couple round-trips and is worded correctly in biographies; any
 * other (or absent) MARR.TYPE is a formal marriage. The set is matched case-insensitively and also
 * catches Scandinavian "sambo(er)" used by some localized exports.
 */
const PARTNERSHIP_MARR_TYPE_RE =
  /\b(common[\s-]*law|partner|partnership|cohabit|unmarried|not\s+married|sambo|registered\s+partner)\b/i;

const deriveUnionType = (marrType?: string | null): 'marriage' | 'partner' => {
  if (!marrType) return 'marriage';
  return PARTNERSHIP_MARR_TYPE_RE.test(marrType.trim()) ? 'partner' : 'marriage';
};

/** The canonical MARR.TYPE we emit for a cohabiting `partner` union on export. */
const PARTNER_MARR_TYPE = 'COMMON LAW';

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

export const parseGedcom = (text: string): GedcomParseResult => {
    const { version, lines: gedLines } = tokenizeGedcom(text);
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
    // Whether this export uses the `_LIVING` convention (TNG-style). When it does, a person
    // without a `_LIVING Y` tag is treated as deceased rather than defaulting to living.
    let usesLivingTag = false;

    let currentId = '';
    let currentType: 'INDI' | 'FAM' | 'SOUR' | null = null;
    let currentTag = '';
    let currentEvent: PersonEvent | null = null;
    // The most-recent EXID/REFN identifier captured on this INDI — a following level-2 TYPE attaches
    // to it (EXID.TYPE / REFN TYPE). Cleared when a new level-1 identifier or event is seen.
    let currentIdentifier: { value: string; type?: string } | null = null;
    const supportedIndividualTags = new Set([
      'NAME',
      'SEX',
      'GIVN',
      'SURN',
      'BIRT',
      'DEAT',
      'SOUR',
      'RESN',
      'UID',
      '_LIVING',
      '_PRIVATE',
      '_AKA',
      '_MARNM',
      'TITL',
      'RFN',
      'EXID',
      'REFN',
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

    gedLines.forEach((tok) => {
      const level = tok.level;
      const pointerToken = tok.xref;        // record id "@I1@" form, or undefined
      const tag = tok.tag;                  // already upper-cased
      // Trim only outer whitespace — CONT-merged values keep their internal newlines.
      const value = tok.value === VOID_POINTER ? '' : tok.value.trim();

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
        } else if (tag === 'UID') {
          // GEDCOM 7 persistent record id — preserve verbatim for lossless round-trip (H/P1).
          if (value) ensureMetadata(p).gedcomUid = value;
          currentIdentifier = null;
        } else if (tag === 'EXID') {
          // External id (+ optional EXID.TYPE). GEDCOM 7. May repeat.
          const exids: Array<{ value: string; type?: string }> = ensureMetadata(p).exids || (ensureMetadata(p).exids = []);
          if (value) {
            const entry = { value };
            exids.push(entry);
            currentIdentifier = entry;
          } else {
            currentIdentifier = null;
          }
        } else if (tag === 'REFN') {
          // User reference number (+ optional TYPE). GEDCOM 5.5.1/7. May repeat.
          const refns: Array<{ value: string; type?: string }> = ensureMetadata(p).refns || (ensureMetadata(p).refns = []);
          if (value) {
            const entry = { value };
            refns.push(entry);
            currentIdentifier = entry;
          } else {
            currentIdentifier = null;
          }
        } else if (tag === 'SUBM') {
          const metadata = ensureMetadata(p);
          const submitters: string[] = metadata.submitterIds || (metadata.submitterIds = []);
          if (value && !submitters.includes(value.replace(/@/g, ''))) {
            submitters.push(value.replace(/@/g, ''));
          }
        } else if (tag === 'BIRT') {
          currentTag = 'BIRT';
          currentEvent = null;
          currentIdentifier = null;
          currentEventLabel = GEDCOM_EVENT_LABELS[tag];
        } else if (tag === 'DEAT') {
          currentTag = 'DEAT';
          currentEvent = null;
          currentIdentifier = null;
          currentEventLabel = GEDCOM_EVENT_LABELS[tag];
        } else if (tag === 'BURI') {
          currentTag = 'BURI';
          currentEvent = null;
          currentIdentifier = null;
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
          // TNG (and similar) only emit `_LIVING Y` for people they consider living, and omit
          // the tag entirely for the deceased. Remember that this export uses the tag so we can
          // treat its absence as "deceased" below.
          usesLivingTag = true;
          p.isLiving = value.trim().toUpperCase() === 'Y';
        } else if (tag === '_PRIVATE') {
          p.isPrivate = value.trim().toUpperCase() === 'Y';
        } else if (tag === 'RESN') {
          // Standard GEDCOM 7 restriction notice (a List of CONFIDENTIAL/LOCKED/PRIVACY); 5.5.1
          // used lower-case. PRIVACY or CONFIDENTIAL means hide from public view.
          const flags = value.toUpperCase().split(/[,\s]+/).filter(Boolean);
          if (flags.includes('PRIVACY') || flags.includes('CONFIDENTIAL')) {
            p.isPrivate = true;
          }
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
          const quay = parseQuay(value);
          if (quay != null) currentCitation.quay = quay;
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
        } else if (tag === 'TYPE' && level === 2 && currentIdentifier && value) {
          // EXID.TYPE / REFN TYPE — attaches to the most-recent identifier (H/P1).
          currentIdentifier.type = value;
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
      // Resolve living status with two downgrade rules (never force someone to "living"):
      //  1. TNG-style exports only tag living people with `_LIVING Y`, so in such a file a
      //     person without an explicit `isLiving === true` is deceased.
      //  2. Common sense: a birth year with no death/burial but an implausibly old age is deceased.
      let isLiving = p.isLiving;
      if (usesLivingTag && isLiving !== true) {
        isLiving = false;
      }
      if (isLiving !== false && !p.deathDate && !p.burialDate && isImplausiblyOld(p.birthDate)) {
        isLiving = false;
      }
      return {
        ...p,
        isLiving,
        events: (p.events || []).filter((evt) => !['Birth', 'Death', 'Burial'].includes(evt.type || '')),
        sources: mergedSources,
        citations: p.citations || [],
        metadata: p.metadata || {}
      } as Person;
    });

    const finalRelationships: Relationship[] = [];

    Object.entries(parsedFamilies).forEach(([familyId, f], idx) => {
      if (f.husb && f.wife) {
        const unionType = deriveUnionType(f.type);
        const noteParts: string[] = [];
        // Keep the original MARR.TYPE in the notes only when it isn't already captured structurally
        // as a `partner` union, so a cohabiting couple doesn't get "COMMON LAW" echoed into the prose.
        if (f.type && unionType !== 'partner') noteParts.push(f.type);
        if (f.marriageNotes?.length) noteParts.push(...f.marriageNotes);
        if (f.generalNotes?.length) noteParts.push(...f.generalNotes);
        if (f.divorceDate) {
          noteParts.push(`Divorce: ${f.divorceDate}`);
          if (f.divorceNotes) noteParts.push(f.divorceNotes);
        }
        finalRelationships.push({
          id: `rel-m-${idx}`,
          treeId: 'imported',
          type: unionType,
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

    return { people: finalPeople, relationships: dedupedRelationships, warnings, version };
  };

// URI for our one extension tag, declared in HEAD.SCHMA per the GEDCOM 7 extension mechanism.
const LIVING_EXTENSION_URI = 'https://linegra.app/terms/v1/LIVING';

const placeText = (place?: string | StructuredPlace): string =>
  typeof place === 'string' ? place : place?.fullText || '';

// GEDCOM 7 SEX enumeration is M / F / X / U; our internal 'O' (default/other) maps to U (unknown).
const toGedcom7Sex = (gender?: string): 'M' | 'F' | 'X' | 'U' =>
  gender === 'M' ? 'M' : gender === 'F' ? 'F' : gender === 'X' ? 'X' : 'U';

// GEDCOM 7 dates use upper-case month abbreviations and keywords (e.g. "9 JUL 1903", "ABT 1807",
// "BEF 1850"). Our stored date text is often title-case, so normalize on export.
const toGedcom7Date = (raw: string): string => raw.toUpperCase();

// A leading @ in a line value must be doubled (GEDCOM 7 §lineStr).
const escapeLineVal = (value: string): string => (value.startsWith('@') ? `@${value}` : value);

// Emit a text structure, splitting embedded newlines into CONT continuation lines (7.0 has no CONC).
const emitText = (out: string[], level: number, tag: string, value?: string | null): void => {
  if (value == null || value === '') {
    out.push(`${level} ${tag}`);
    return;
  }
  const parts = String(value).split('\n');
  out.push(`${level} ${tag} ${escapeLineVal(parts[0])}`);
  for (let i = 1; i < parts.length; i += 1) out.push(`${level + 1} CONT ${escapeLineVal(parts[i])}`);
};

const emitPlace = (out: string[], level: number, place?: string | StructuredPlace): void => {
  const text = placeText(place);
  const hasCoords =
    typeof place === 'object' && place != null &&
    typeof place.lat === 'number' && Number.isFinite(place.lat) &&
    typeof place.lng === 'number' && Number.isFinite(place.lng);
  if (!text && !hasCoords) return;
  emitText(out, level, 'PLAC', text);
  if (hasCoords) {
    const { lat, lng } = place as StructuredPlace & { lat: number; lng: number };
    out.push(`${level + 1} MAP`);
    out.push(`${level + 2} LATI ${lat >= 0 ? 'N' : 'S'}${Math.abs(lat)}`);
    out.push(`${level + 2} LONG ${lng >= 0 ? 'E' : 'W'}${Math.abs(lng)}`);
  }
};

// A citation's event label → vital event tag, when it refers to a built-in vital (Birth/Death/Burial
// + a few common synonyms incl. Scandinavian). Non-vital labels stay at the person level.
const VITAL_LABEL_PATTERNS: Array<{ re: RegExp; tag: string }> = [
  { re: /^(birth|birt|fødsel|fodsel)$/i, tag: 'BIRT' },
  { re: /^(death|deat|død|dod|bortgang)$/i, tag: 'DEAT' },
  { re: /^(burial|buri|begrav)/i, tag: 'BURI' },
  { re: /^(christen|chr|dåb|daab|dop)/i, tag: 'CHR' },
];
const vitalTagForLabel = (label?: string): string | null => {
  if (!label) return null;
  const match = VITAL_LABEL_PATTERNS.find((p) => p.re.test(label.trim()));
  return match ? match.tag : null;
};

// Emit a source-citation reference (`n SOUR @x@` + PAGE/DATA/QUAY), mirroring the import parser.
const emitSourceCitation = (
  out: string[],
  level: number,
  xref: string,
  citation: { page?: string | null; dataDate?: string | null; dataText?: string | null; quality?: string | null }
): void => {
  out.push(`${level} SOUR ${xref}`);
  if (citation.page) emitText(out, level + 1, 'PAGE', citation.page);
  if (citation.dataDate || citation.dataText) {
    out.push(`${level + 1} DATA`);
    if (citation.dataDate) emitText(out, level + 2, 'DATE', citation.dataDate);
    if (citation.dataText) emitText(out, level + 2, 'TEXT', citation.dataText);
  }
  if (citation.quality) out.push(`${level + 1} QUAY ${citation.quality}`);
};

/**
 * Serialize people + relationships to a **GEDCOM 7.0** document (the only export format).
 *
 * Emits a UTF-8 BOM, `GEDC.VERS 7.0`, a `SCHMA` declaration for our `_LIVING` extension, valid
 * sequential xref ids (`@I1@`/`@F1@` — UUIDs contain hyphens, which are illegal xref characters),
 * a `UID` per person to preserve internal identity, structured `NAME` parts, `SEX` M/F/X/U, `RESN
 * PRIVACY` for private records, and marriage families with children. Multi-line values use `CONT`.
 * The browser-download wrapper lives in components/ImportExport.tsx.
 */
export const serializeGedcom = (people: Person[], relationships: Relationship[]): string => {
  const out: string[] = [];

  // Stable, valid xref ids (document-local). Internal UUIDs are preserved via per-record UID.
  const personXref = new Map<string, string>();
  people.forEach((p, i) => personXref.set(p.id, `@I${i + 1}@`));

  // Deduped source registry: one xref per source document, shared across everyone who cites it (so
  // a single dødsannonce cited for both a death and a burial yields ONE `0 @S1@ SOUR` record).
  const sourceRegistry = new Map<string, { xref: string; source: Source }>();
  let sourceIndex = 0;
  const sourceKey = (s: { id?: string; externalId?: string }) => s.externalId || s.id || '';
  const registerSource = (s: Source): string | null => {
    const key = sourceKey(s);
    if (!key) return null;
    const existing = sourceRegistry.get(key);
    if (existing) return existing.xref;
    const xref = `@S${++sourceIndex}@`;
    sourceRegistry.set(key, { xref, source: s });
    return xref;
  };
  const xrefForSourceId = (id?: string): string | null => (id ? sourceRegistry.get(id)?.xref ?? null : null);
  people.forEach((p) => (p.sources || []).forEach((s) => registerSource(s)));

  // Emit a vital event (BIRT/DEAT/BURI) with any citations whose event label maps to it.
  const emitVital = (
    tag: string,
    date: string | undefined,
    place: string | StructuredPlace | undefined,
    personCitations: Citation[]
  ): void => {
    const hasEvent = !!date || !!placeText(place) || (typeof place === 'object' && place?.lat != null);
    const matching = personCitations.filter((c) => vitalTagForLabel(c.eventLabel) === tag);
    if (!hasEvent && matching.length === 0) return;
    out.push(`1 ${tag}`);
    if (date) emitText(out, 2, 'DATE', toGedcom7Date(date));
    emitPlace(out, 2, place);
    matching.forEach((c) => {
      const x = xrefForSourceId(c.sourceId);
      if (x) emitSourceCitation(out, 2, x, c);
    });
  };

  // ---- Header ----
  out.push('0 HEAD');
  out.push('1 GEDC');
  out.push('2 VERS 7.0');
  out.push('1 SCHMA');
  out.push(`2 TAG _LIVING ${LIVING_EXTENSION_URI}`);
  out.push('1 SOUR Linegra');
  out.push('2 NAME Linegra');

  // ---- Source records (one per document, shared tree-wide) ----
  // Emitted before the individuals so the single-pass import parser has already resolved each
  // `@Sn@` by the time it meets a `2 SOUR @Sn@` reference. Field mapping mirrors the SOUR-record
  // parser: AUTH→repository, NOTE/PUBL→notes, so it round-trips.
  [...sourceRegistry.values()].forEach(({ xref, source }) => {
    out.push(`0 ${xref} SOUR`);
    if (source.title) emitText(out, 1, 'TITL', source.title);
    if (source.abbreviation) emitText(out, 1, 'ABBR', source.abbreviation);
    if (source.repository) emitText(out, 1, 'AUTH', source.repository);
    if (source.url) emitText(out, 1, 'URL', source.url);
    if (source.citationDate) emitText(out, 1, 'DATE', source.citationDate);
    if (source.callNumber) emitText(out, 1, 'CALN', source.callNumber);
    if (source.actualText) emitText(out, 1, 'TEXT', source.actualText);
    if (source.notes) emitText(out, 1, 'NOTE', source.notes);
  });

  // ---- Individuals ----
  people.forEach((p) => {
    out.push(`0 ${personXref.get(p.id)} INDI`);
    // Preserve the original source UID when we captured one (lossless round-trip); otherwise mint a
    // UID from the internal id. Then re-emit EXID (+TYPE) and REFN (+TYPE) if present (H/P1).
    const personMeta = (p.metadata as Record<string, unknown> | undefined) ?? {};
    const gedcomUid = typeof personMeta.gedcomUid === 'string' ? personMeta.gedcomUid : undefined;
    if (gedcomUid) out.push(`1 UID ${gedcomUid}`);
    else if (p.id) out.push(`1 UID ${p.id}`);
    if (Array.isArray(personMeta.exids)) {
      (personMeta.exids as Array<{ value: string; type?: string }>).forEach((exid) => {
        emitText(out, 1, 'EXID', exid.value);
        if (exid.type) emitText(out, 2, 'TYPE', exid.type);
      });
    }
    if (Array.isArray(personMeta.refns)) {
      (personMeta.refns as Array<{ value: string; type?: string }>).forEach((refn) => {
        emitText(out, 1, 'REFN', refn.value);
        if (refn.type) emitText(out, 2, 'TYPE', refn.type);
      });
    }
    emitText(out, 1, 'NAME', `${p.firstName || ''} /${p.lastName || ''}/`.trim());
    if (p.firstName) emitText(out, 2, 'GIVN', p.firstName);
    if (p.lastName) emitText(out, 2, 'SURN', p.lastName);
    if (p.maidenName) {
      emitText(out, 1, 'NAME', `/${p.maidenName}/`);
      out.push('2 TYPE MAIDEN');
    }
    out.push(`1 SEX ${toGedcom7Sex(p.gender)}`);
    if (p.isPrivate) out.push('1 RESN PRIVACY');
    if (p.isLiving === true) out.push('1 _LIVING Y');
    const personCitations = p.citations || [];
    emitVital('BIRT', p.birthDate, p.birthPlace, personCitations);
    emitVital('DEAT', p.deathDate, p.deathPlace, personCitations);
    emitVital('BURI', p.burialDate, p.burialPlace, personCitations);
    // Sources cited only at the vital-event level above are already referenced; any remaining source
    // (or every source when citations aren't loaded) is attached at the person level.
    const vitalCitedSourceIds = new Set(
      personCitations.filter((c) => vitalTagForLabel(c.eventLabel)).map((c) => c.sourceId)
    );
    (p.sources || []).forEach((s) => {
      const key = sourceKey(s);
      if (key && !vitalCitedSourceIds.has(key)) {
        const x = xrefForSourceId(key);
        if (x) out.push(`1 SOUR ${x}`);
      }
    });
  });

  // ---- Families (from marriage relationships) ----
  const processedFamilies = new Set<string>();
  let familyIndex = 0;
  relationships.forEach((r) => {
    if (r.type !== 'marriage' && r.type !== 'partner') return;
    const familyKey = [r.personId, r.relatedId].sort().join('-');
    if (processedFamilies.has(familyKey)) return;
    processedFamilies.add(familyKey);

    const husbXref = personXref.get(r.personId);
    const wifeXref = personXref.get(r.relatedId);
    out.push(`0 @F${++familyIndex}@ FAM`);
    if (husbXref) out.push(`1 HUSB ${husbXref}`);
    if (wifeXref) out.push(`1 WIFE ${wifeXref}`);
    out.push('1 MARR');
    // GEDCOM 7.x has no dedicated partner union; mark a cohabiting couple via MARR.TYPE so it
    // round-trips back to a `partner` relationship on re-import.
    if (r.type === 'partner') emitText(out, 2, 'TYPE', PARTNER_MARR_TYPE);
    if (r.date) emitText(out, 2, 'DATE', toGedcom7Date(r.date));
    emitPlace(out, 2, r.place);
    if (r.notes) emitText(out, 2, 'NOTE', r.notes);

    relationships
      .filter(
        (childRel) =>
          (childRel.type === 'bio_father' && childRel.personId === r.personId) ||
          (childRel.type === 'bio_mother' && childRel.personId === r.relatedId),
      )
      .forEach((childRel) => {
        const childXref = personXref.get(childRel.relatedId);
        if (childXref) out.push(`1 CHIL ${childXref}`);
      });
  });

  out.push('0 TRLR');
  // UTF-8 BOM (U+FEFF) + LF line endings, trailing newline.
  return `\uFEFF${out.join('\n')}\n`;
};
