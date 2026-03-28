import React, { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import {
  Person,
  User as UserType,
  AlternateName,
  DeathCauseCategory,
  StructuredPlace,
  Source,
  Note,
  PersonEvent,
  Relationship,
  RelationshipConfidence,
  DNATest,
  MediaItem,
  Citation,
  FamilyLayoutState,
} from '../types';
import { X, Library, Image as ImageIcon, FileText, ShieldCheck, Microscope, Share2, Share, Heart, Edit3, Check } from 'lucide-react';
import { PARENT_LINK_TYPES } from './person-profile/constants';
import FamilyTab from './person-profile/FamilyTab';
import VitalTab from './person-profile/VitalTab';
import StoryTab from './person-profile/StoryTab';
import SourcesTab from './person-profile/SourcesTab';
import MediaTab from './person-profile/MediaTab';
import DNATab from './person-profile/DNATab';
import NotesTab from './person-profile/NotesTab';
import { getAvatarForPerson } from '../lib/avatar';
import { fetchPersonConnections, updatePersonProfile, fetchPersonDetails, updateRelationshipConfidence, updateRelationshipDetails, unlinkRelationship, createPlaceholderParent } from '../services/archive';
import { hasOpenRouterConfig, normalizeDeathCause as requestNormalizedDeathCause } from '../services/gemini';

const serializePlaceValue = (value: string | StructuredPlace) =>
  typeof value === 'string' ? value : JSON.stringify(value ?? '');

const extractMediaItemsFromPerson = (target: Person): MediaItem[] => {
  const metadataMedia = (target.metadata as { mediaItems?: MediaItem[] } | undefined)?.mediaItems;
  if (Array.isArray(metadataMedia)) {
    return metadataMedia;
  }
  return [];
};

const dedupeAlternateNames = (names: AlternateName[] = []) => {
  const seen = new Set<string>();
  return names.filter((entry) => {
    const key = [
      entry.type || '',
      (entry.firstName || '').trim().toLowerCase(),
      (entry.lastName || '').trim().toLowerCase(),
    ].join('|');
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
};

const generateUuid = () => {
  if (typeof globalThis.crypto !== 'undefined' && typeof globalThis.crypto.randomUUID === 'function') {
    return globalThis.crypto.randomUUID();
  }
  const template = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx';
  return template.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
};

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const toUuidOrNull = (...candidates: Array<string | null | undefined>) => {
  for (const candidate of candidates) {
    if (!candidate) continue;
    const normalized = candidate.trim();
    if (UUID_PATTERN.test(normalized)) return normalized;
    const head = normalized.split(':')[0];
    if (UUID_PATTERN.test(head)) return head;
  }
  return null;
};

const resolveLivingState = (target: Person) => {
  if (typeof target.isLiving === 'boolean') {
    return target.isLiving;
  }
  return !target.deathDate;
};

const buildSnapshotFromPerson = (target: Person) =>
  JSON.stringify({
    firstName: target.firstName,
    lastName: target.lastName,
    maidenName: target.maidenName || '',
    birthDate: target.birthDate || '',
    birthPlace: serializePlaceValue(target.birthPlace || ''),
    deathDate: target.deathDate || '',
    deathPlace: serializePlaceValue(target.deathPlace || ''),
    residenceAtDeath: serializePlaceValue(target.residenceAtDeath || ''),
    burialDate: target.burialDate || '',
    burialPlace: serializePlaceValue(target.burialPlace || ''),
    deathCause: target.deathCause || '',
    normalizedDeathCause: target.normalizedDeathCause || '',
    deathCategory: target.deathCauseCategory || 'Unknown',
    altNames: target.alternateNames || [],
    events: target.events || [],
    sources: target.sources || [],
    notes: target.notes || [],
    dnaTests: target.dnaTests || [],
    mediaItems: extractMediaItemsFromPerson(target),
    isLiving: resolveLivingState(target),
    isPrivate: !!target.isPrivate
  });

interface PersonProfileProps {
  person: Person;
  currentUser: UserType | null;
  onClose: () => void;
  onNavigateToPerson?: (person: Person) => void;
  onPersistFamilyLayout?: (personId: string, layout: FamilyLayoutState) => void;
  onPersonUpdated?: (person: Person) => void;
  onOpenTreeFromProfile?: (person: Person) => void;
  onRefreshTreeGraph?: () => Promise<void> | void;
}

type ProfileSection = 'vital' | 'story' | 'family' | 'sources' | 'media' | 'dna' | 'notes';

const PersonProfile: React.FC<PersonProfileProps> = ({
  person,
  currentUser,
  onClose,
  onNavigateToPerson,
  onPersistFamilyLayout,
  onPersonUpdated,
  onOpenTreeFromProfile,
  onRefreshTreeGraph,
}) => {
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
  const [normalizedDeathCause, setNormalizedDeathCause] = useState(person.normalizedDeathCause || '');
  const [deathCategory, setDeathCategory] = useState<DeathCauseCategory>(person.deathCauseCategory || 'Unknown');
  const [altNames, setAltNames] = useState<AlternateName[]>(dedupeAlternateNames(person.alternateNames || []));
  const [events, setEvents] = useState<PersonEvent[]>(person.events || []);
  const isDNAMatch = !!person.isDNAMatch;

  // Dynamic Archive state
  const [sources, setSources] = useState<Source[]>(person.sources || []);
  const [notes, setNotes] = useState<Note[]>(person.notes || []);
  const [dnaTests, setDnaTests] = useState<DNATest[]>(person.dnaTests || []);
  const [mediaItems, setMediaItems] = useState<MediaItem[]>(extractMediaItemsFromPerson(person));
  const [isLiving, setIsLiving] = useState<boolean>(resolveLivingState(person));
  const [isPrivate, setIsPrivate] = useState<boolean>(!!person.isPrivate);

  const [relationshipData, setRelationshipData] = useState<Relationship[]>([]);
  const [relationPeople, setRelationPeople] = useState<Record<string, Person>>({ [person.id]: person });
  const [connectionsLoading, setConnectionsLoading] = useState(false);
  const [connectionsError, setConnectionsError] = useState<string | null>(null);
  const [relConfidences, setRelConfidences] = useState<Record<string, RelationshipConfidence>>({});
  const [baselineSnapshot, setBaselineSnapshot] = useState<string>('');
  const [isDirty, setIsDirty] = useState(false);
  const [saveFeedback, setSaveFeedback] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [normalizingDeathCause, setNormalizingDeathCause] = useState(false);
  const [normalizeDeathCauseError, setNormalizeDeathCauseError] = useState<string | null>(null);
  const [shareFeedback, setShareFeedback] = useState<string>('');
  const [overlayProfile, setOverlayProfile] = useState<Person | null>(null);
  const [pendingParentType, setPendingParentType] = useState<'father' | 'mother' | null>(null);

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
    setNormalizedDeathCause(person.normalizedDeathCause || '');
    setDeathCategory(person.deathCauseCategory || 'Unknown');
    setAltNames(dedupeAlternateNames(person.alternateNames || []));
    setEvents(person.events || []);
    setSources(person.sources || []);
    setNotes(person.notes || []);
    setDnaTests(person.dnaTests || []);
    setMediaItems(extractMediaItemsFromPerson(person));
    setIsLiving(resolveLivingState(person));
    setIsPrivate(!!person.isPrivate);
  }, [person]);

  const applyConnectionData = useCallback(
    (relationshipsResult: Relationship[], peopleResult: Person[]) => {
      setRelationshipData(relationshipsResult);
      const map: Record<string, Person> = {};
      [...peopleResult, person].forEach((entry) => {
        map[entry.id] = entry;
      });
      setRelationPeople(map);
      const nextConf: Record<string, RelationshipConfidence> = {};
      relationshipsResult.forEach((rel) => {
        nextConf[rel.id] = rel.confidence || 'Unknown';
      });
      setRelConfidences(nextConf);
    },
    [person]
  );

  const refreshConnections = useCallback(
    async (opts: { silent?: boolean; isCancelled?: () => boolean } = {}) => {
      if (!opts.silent) setConnectionsLoading(true);
      setConnectionsError(null);
      try {
        const { relationships, people } = await fetchPersonConnections(person.treeId, person.id);
        if (opts.isCancelled?.()) return;
        applyConnectionData(relationships, people);
      } catch (err) {
        if (opts.isCancelled?.()) return;
        console.error('Failed to load relationships', err);
        const message = err instanceof Error ? err.message : 'Unable to load family connections.';
        setConnectionsError(message);
        setRelationshipData([]);
        setRelConfidences({});
        setRelationPeople({ [person.id]: person });
      } finally {
        if (!opts.silent && !opts.isCancelled?.()) {
          setConnectionsLoading(false);
        }
      }
    },
    [person, applyConnectionData]
  );

  useEffect(() => {
    setRelationPeople((prev) => ({ ...prev, [person.id]: person }));
  }, [person]);

  useEffect(() => {
    if (deathDate && isLiving) {
      setIsLiving(false);
    }
  }, [deathDate, isLiving]);

  useEffect(() => {
    let cancelled = false;
    refreshConnections({ isCancelled: () => cancelled });
    return () => {
      cancelled = true;
    };
  }, [refreshConnections]);

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
  const canEditFamily = !!currentUser?.isAdmin;
  const canEditPerson = !!currentUser?.isAdmin;
  const canViewPrivateRelations = !!currentUser?.isAdmin;

  const parents = useMemo(() => {
    return relationshipData
      .filter(r => r.relatedId === person.id && PARENT_LINK_TYPES.includes(r.type))
      .map(r => ({
        rel: r,
        person: relationPeople[r.personId]
      }))
      .filter(
        (item): item is { rel: Relationship; person: Person } =>
          !!item.person && (canViewPrivateRelations || !item.person.isPrivate)
      );
  }, [person.id, relationshipData, relationPeople, canViewPrivateRelations]);

  const spouses = useMemo(() => {
    return relationshipData
      .filter(r => (r.personId === person.id || r.relatedId === person.id) && ['marriage', 'partner'].includes(r.type))
      .map(r => {
        const otherId = r.personId === person.id ? r.relatedId : r.personId;
        return {
          rel: r,
          person: relationPeople[otherId]
        };
      })
      .filter(
        (item): item is { rel: Relationship; person: Person } =>
          !!item.person && (canViewPrivateRelations || !item.person.isPrivate)
      );
  }, [person.id, relationshipData, relationPeople, canViewPrivateRelations]);

  const children = useMemo(() => {
    const asParent = relationshipData
      .filter(r => r.personId === person.id && PARENT_LINK_TYPES.includes(r.type))
      .map(r => ({
        rel: r,
        person: relationPeople[r.relatedId]
      }));
    const asChildRel = relationshipData
      .filter(r => r.personId === person.id && r.type === 'child')
      .map(r => ({
        rel: r,
        person: relationPeople[r.relatedId]
      }));
    return [...asParent, ...asChildRel].filter(
      (item): item is { rel: Relationship; person: Person } =>
        !!item.person && (canViewPrivateRelations || !item.person.isPrivate)
    );
  }, [person.id, relationshipData, relationPeople, canViewPrivateRelations]);

  const siblings = useMemo(() => {
    const parentIds = new Set(
      relationshipData
        .filter((r) => r.relatedId === person.id && PARENT_LINK_TYPES.includes(r.type))
        .map((r) => r.personId)
    );
    if (parentIds.size === 0) return [] as Array<{ rel: Relationship; person: Person }>;
    const siblingByPersonId = new Map<string, { rel: Relationship; person: Person }>();
    relationshipData
      .filter((r) => parentIds.has(r.personId) && PARENT_LINK_TYPES.includes(r.type) && r.relatedId !== person.id)
      .forEach((r) => {
        const siblingPerson = relationPeople[r.relatedId];
        if (!siblingPerson || (!canViewPrivateRelations && siblingPerson.isPrivate)) return;
        if (!siblingByPersonId.has(siblingPerson.id)) {
          siblingByPersonId.set(siblingPerson.id, { rel: r, person: siblingPerson });
        }
      });
    return Array.from(siblingByPersonId.values()).sort((a, b) => {
      const aName = `${a.person.lastName} ${a.person.firstName}`.trim();
      const bName = `${b.person.lastName} ${b.person.firstName}`.trim();
      return aName.localeCompare(bName);
    });
  }, [person.id, relationshipData, relationPeople, canViewPrivateRelations]);

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
    const prevValue = relConfidences[relId] || 'Unknown';
    setRelConfidences((prev) => ({ ...prev, [relId]: confidence }));
    if (!canEditFamily) return;
    updateRelationshipConfidence(relId, confidence, { id: currentUser?.id ?? null, name: currentUser?.name ?? null })
      .catch((err) => {
        const message = err instanceof Error ? err.message : 'Failed to update relationship.';
        setConnectionsError(message);
        setRelConfidences((prev) => ({ ...prev, [relId]: prevValue }));
      });
  };

  const handleUpdateRelationshipDetails = useCallback(
    async (
      relId: string,
      updates: { dateText?: string | null; placeText?: string | null; status?: Relationship['status'] | null; notes?: string | null }
    ) => {
      if (!canEditFamily) return;
      try {
        await updateRelationshipDetails(
          relId,
          {
            dateText: updates.dateText ?? null,
            placeText: updates.placeText ?? null,
            status: updates.status ?? null,
            notes: updates.notes ?? null,
          },
          { id: currentUser?.id ?? null, name: currentUser?.name ?? null }
        );
        await refreshConnections({ silent: true });
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to update relationship details.';
        setConnectionsError(message);
        throw err;
      }
    },
    [canEditFamily, currentUser, refreshConnections]
  );

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
      id: generateUuid(),
      type: 'Residence',
      date: '',
      place: '',
      description: ''
    };
    setEvents([...events, newEvent]);
  };

  const handleAddSource = (linkedEvent?: string) => {
    const newSource: Source = {
      id: generateUuid(),
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
      id: generateUuid(),
      text: '',
      type: 'Generic',
      event: linkedEvent || 'General',
      date: new Date().toISOString().split('T')[0]
    };
    setNotes([newNote, ...notes]);
    setActiveSection('notes');
  };

  const handleUpdateSource = (id: string, updates: Partial<Source>) => {
    setSources((prev) => prev.map((source) => (source.id === id ? { ...source, ...updates } : source)));
  };

  const handleRemoveSource = (id: string) => {
    setSources((prev) => prev.filter((source) => source.id !== id));
  };

  const handleUpdateMediaItem = (id: string, updates: Partial<MediaItem>) => {
    setMediaItems((prev) => prev.map((item) => (item.id === id ? { ...item, ...updates } : item)));
  };

  const handleRemoveMediaItem = (id: string) => {
    setMediaItems((prev) => prev.filter((item) => item.id !== id));
  };

  const handleUpdateDnaTest = (id: string, updates: Partial<DNATest>) => {
    setDnaTests((prev) => prev.map((test) => (test.id === id ? { ...test, ...updates } : test)));
  };

  const handleRemoveDnaTest = (id: string) => {
    setDnaTests((prev) => prev.filter((test) => test.id !== id));
  };

  const handleUpdateNoteEntry = (id: string, updates: Partial<Note>) => {
    setNotes((prev) => prev.map((note) => (note.id === id ? { ...note, ...updates } : note)));
  };

  const handleRemoveNoteEntry = (id: string) => {
    setNotes((prev) => prev.filter((note) => note.id !== id));
  };

  const confirmDiscard = (message: string) => {
    if (!isDirty) return true;
    return window.confirm(message);
  };

  const resolvePlaceText = (value: string | StructuredPlace) => {
    if (!value) return null;
    if (typeof value === 'string') return value;
    return value.fullText || null;
  };

  const buildProfilePayload = () => {
    const metadataPatch: Record<string, unknown> = {};
    if (birthPlace && typeof birthPlace !== 'string') {
      metadataPatch.structured_birth_place = birthPlace;
    }
    if (deathPlace && typeof deathPlace !== 'string') {
      metadataPatch.structured_death_place = deathPlace;
    }
    if (residenceAtDeath && typeof residenceAtDeath !== 'string') {
      metadataPatch.structured_residence_at_death = residenceAtDeath;
    }
    if (burialPlace && typeof burialPlace !== 'string') {
      metadataPatch.structured_burial_place = burialPlace;
    }
    return {
      first_name: firstName || person.firstName,
      last_name: lastName || person.lastName,
      maiden_name: maidenName || null,
      birth_date_text: birthDate || null,
      birth_place_text: resolvePlaceText(birthPlace),
      death_date_text: deathDate || null,
      death_place_text: resolvePlaceText(deathPlace),
      residence_at_death_text: resolvePlaceText(residenceAtDeath),
      burial_date_text: burialDate || null,
      burial_place_text: resolvePlaceText(burialPlace),
      death_cause: deathCause || null,
      death_cause_category: deathCategory || null,
      alternate_names: altNames,
      is_living: isLiving,
      is_private: isPrivate,
      metadata: {
        ...metadataPatch,
        normalized_death_cause: normalizedDeathCause || null
      }
    };
  };

  const eventsPayload = () =>
    events.map((event) => {
      const placeText =
        typeof event.place === 'string'
          ? event.place
          : (event.place as StructuredPlace | undefined)?.fullText ?? null;
      const structured =
        typeof event.place === 'object' && event.place
          ? (event.place as StructuredPlace)
          : null;
      const baseMetadata = event.metadata && typeof event.metadata === 'object' ? event.metadata : {};
      return {
        id: event.id,
        type: event.type,
        date: event.date || null,
        place: placeText,
        description: event.description || null,
        employer: event.employer || null,
        metadata: structured ? { ...baseMetadata, structured_place: structured } : baseMetadata
      };
    });

  const notesPayload = () =>
    notes.map((note) => ({
      id: toUuidOrNull(note.id) ?? generateUuid(),
      body: note.text || '',
      type: note.type || 'Generic',
      event_label: note.event || null,
      note_date_text: note.date || null,
      is_private: note.isPrivate ?? false
    }));

  const sourcesPayload = () =>
    sources.map((source) => ({
      id: toUuidOrNull(source.externalId, source.id) ?? generateUuid(),
      title: source.title || 'Untitled Record',
      type: source.type || 'Unknown',
      repository: source.repository || null,
      url: source.url || null,
      citation_date_text: source.citationDate || null,
      page: source.page || null,
      abbreviation: source.abbreviation || null,
      call_number: source.callNumber || null,
      reliability: source.reliability ?? null,
      actual_text: source.actualText || null,
      notes: source.notes || null,
      label: source.title || null,
      event_label: source.event || null,
      quality: source.reliability ? source.reliability.toString() : null
    }));

  const handleSave = async () => {
    if (!canEditPerson || saving || !isDirty) return;
    setSaving(true);
    setSaveError(null);
    try {
      await updatePersonProfile(person.id, {
        actorId: currentUser?.id ?? null,
        actorName: currentUser?.name ?? undefined,
        profile: buildProfilePayload(),
        events: eventsPayload(),
        notes: notesPayload(),
        sources: sourcesPayload(),
        dnaTests
      });
      await onRefreshTreeGraph?.();
      const refreshed = await fetchPersonDetails(person.id);
      onPersonUpdated?.(refreshed);
      setBaselineSnapshot(buildSnapshotFromPerson(refreshed));
      setIsDirty(false);
      setSaveFeedback('Saved');
      setTimeout(() => setSaveFeedback(''), 2000);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to save changes.';
      setSaveError(message);
      setSaveFeedback('Save failed');
      setTimeout(() => setSaveFeedback(''), 3000);
    } finally {
      setSaving(false);
    }
  };

  const handleAttemptClose = () => {
    if (!confirmDiscard('Discard unsaved changes before closing?')) return;
    onClose();
  };

  const handleNavigateRequest = (target: Person) => {
    if (!confirmDiscard('Discard changes before navigating to another profile?')) return;
    onNavigateToPerson?.(target);
  };

  const handleUnlinkRelationship = async (relId: string) => {
    if (!canEditFamily) return;
    try {
      await unlinkRelationship(relId, { id: currentUser?.id ?? null, name: currentUser?.name ?? null });
      await refreshConnections({ silent: true });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to unlink relationship.';
      setConnectionsError(message);
    }
  };

  const draftSnapshot = useMemo(
    () =>
      JSON.stringify({
        firstName,
        lastName,
        maidenName,
        birthDate,
        birthPlace: serializePlaceValue(birthPlace),
        deathDate,
        deathPlace: serializePlaceValue(deathPlace),
        residenceAtDeath: serializePlaceValue(residenceAtDeath),
        burialDate,
        burialPlace: serializePlaceValue(burialPlace),
        deathCause,
        normalizedDeathCause,
        deathCategory,
        altNames,
        events,
        sources,
        notes,
        dnaTests,
        mediaItems,
        isLiving,
        isPrivate
      }),
    [
      firstName,
      lastName,
      maidenName,
      birthDate,
      birthPlace,
      deathDate,
      deathPlace,
      residenceAtDeath,
      burialDate,
      burialPlace,
      deathCause,
      normalizedDeathCause,
      deathCategory,
      altNames,
      events,
      sources,
      notes,
      dnaTests,
      mediaItems,
      isLiving,
      isPrivate
    ]
  );

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
    setNormalizedDeathCause(person.normalizedDeathCause || '');
    setDeathCategory(person.deathCauseCategory || 'Unknown');
    setAltNames(person.alternateNames || []);
    setEvents(person.events || []);
    setSources(person.sources || []);
    setNotes(person.notes || []);
    setDnaTests(person.dnaTests || []);
    setMediaItems(extractMediaItemsFromPerson(person));
    setActiveSection('vital');
  }, [person]);

  useEffect(() => {
    setBaselineSnapshot(buildSnapshotFromPerson(person));
    setIsDirty(false);
  }, [person]);

  useEffect(() => {
    setIsDirty(draftSnapshot !== baselineSnapshot);
  }, [draftSnapshot, baselineSnapshot]);

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

  const handleRemoveAltName = (index: number) => {
    setAltNames((prev) => prev.filter((_, i) => i !== index));
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

  const handleNormalizeDeathCause = async () => {
    if (!canEditPerson || !deathCause.trim() || normalizingDeathCause) return;
    setNormalizingDeathCause(true);
    setNormalizeDeathCauseError(null);
    try {
      const normalized = await requestNormalizedDeathCause(deathCause);
      setNormalizedDeathCause(normalized.normalizedCause);
      if (deathCategory === 'Unknown' && normalized.category !== 'Unknown') {
        setDeathCategory(normalized.category);
      }
    } catch (err) {
      setNormalizeDeathCauseError(
        err instanceof Error ? err.message : 'Failed to normalize cause of death.'
      );
    } finally {
      setNormalizingDeathCause(false);
    }
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

  const handleRemoveEvent = (id: string) => {
    setEvents((prev) => prev.filter((event) => event.id !== id));
  };

  const handleAddDNATest = () => {
    const newTest: DNATest = {
      id: generateUuid(),
      type: 'Autosomal',
      vendor: 'AncestryDNA',
      isPrivate: false,
      testDate: new Date().getFullYear().toString()
    };
    setDnaTests([...dnaTests, newTest]);
    setActiveSection('dna');
  };

  const handleRequestAddParent = useCallback(
    async (parentType: 'father' | 'mother') => {
      if (!canEditFamily || pendingParentType) return;
      setPendingParentType(parentType);
      try {
        const newParent = await createPlaceholderParent({
          treeId: person.treeId,
          childId: person.id,
          parentType,
          actor: currentUser
            ? {
                id: currentUser.id,
                name: currentUser.name,
              }
            : null,
        });
        setRelationPeople((prev) => ({ ...prev, [newParent.id]: newParent }));
        await refreshConnections({ silent: true });
        setOverlayProfile(newParent);
      } catch (err) {
        console.error('Failed to create parent placeholder', err);
        setConnectionsError((prev) => prev || 'Could not create parent record.');
      } finally {
        setPendingParentType(null);
      }
    },
    [canEditFamily, pendingParentType, person, currentUser, refreshConnections]
  );

  return (
    <>
      <div
        className="fixed inset-0 z-40 bg-slate-900/40 backdrop-blur-sm lg:hidden"
        onClick={handleAttemptClose}
      />
      <div className="fixed inset-0 z-50 flex flex-col bg-white h-full w-full overflow-hidden shadow-2xl animate-in slide-in-from-bottom duration-300 lg:relative lg:inset-auto lg:z-auto lg:border-l lg:border-slate-200 lg:w-[500px] lg:slide-in-from-right">
      <input type="file" ref={fileInputRef} className="hidden" accept="image/*,audio/*,video/*" onChange={handleFileUpload} />
      
      {/* Header with Photo & Name */}
      <div className="z-30 shrink-0">
        <div
          className="relative bg-slate-900 pt-12 pb-6 px-8 text-white shadow-lg"
          style={{ paddingTop: 'calc(3rem + env(safe-area-inset-top, 0px))' }}
        >
          <div
            className="absolute right-6 flex items-center gap-3 z-20"
            style={{ top: 'calc(1rem + env(safe-area-inset-top, 0px))' }}
          >
            {canEditPerson && (
              <button
                onClick={handleSave}
                disabled={!isDirty || saving}
                className={`px-3 py-1 rounded-full text-[11px] font-black uppercase tracking-[0.2em] ${
                  isDirty && !saving
                    ? 'bg-emerald-400 text-emerald-900 hover:bg-emerald-300 transition'
                    : 'bg-slate-200 text-slate-400 cursor-not-allowed'
                }`}
              >
                {saving ? 'Saving…' : 'Save'}
              </button>
            )}
            {saveFeedback && (
              <span className="text-[10px] font-bold text-emerald-300">{saveFeedback}</span>
            )}
            {onOpenTreeFromProfile && (
              <button
                onClick={() => onOpenTreeFromProfile(person)}
                className="p-2 bg-white/10 hover:bg-white/20 rounded-full transition-all text-white"
                aria-label="Open in interactive tree"
                title="Open in tree"
              >
                <Share2 className="w-5 h-5" />
              </button>
            )}
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
                <Share className="w-5 h-5" />
              </button>
              {shareFeedback && (
                <span className="absolute -bottom-7 left-1/2 -translate-x-1/2 text-[10px] font-bold text-white bg-slate-900/60 px-2 py-0.5 rounded-full">
                  {shareFeedback}
                </span>
              )}
            </div>
            <button onClick={handleAttemptClose} className="p-2 bg-white/10 hover:bg-white/20 rounded-full transition-all text-white"><X className="w-5 h-5" /></button>
          </div>
          <div className="relative z-10 flex items-center gap-6">
            <div className="w-24 h-24 rounded-3xl overflow-hidden ring-4 ring-white shadow-2xl relative group bg-slate-800">
              <img src={getAvatarForPerson(person)} className="w-full h-full object-cover" />
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
              {canEditPerson && (
                <div className="mt-4 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => canEditPerson && !deathDate && setIsLiving((prev) => !prev)}
                    disabled={!canEditPerson || !!deathDate}
                    className={`flex items-center gap-2 px-3 py-1.5 rounded-full border text-[10px] font-black uppercase tracking-[0.2em] transition ${
                      isLiving
                        ? 'bg-emerald-400/20 border-emerald-300 text-emerald-100'
                        : 'border-white/20 text-white/60'
                    } ${
                      canEditPerson && !deathDate ? 'hover:bg-white/10' : 'opacity-60 cursor-not-allowed'
                    }`}
                  >
                    <Check className={`w-3 h-3 ${isLiving ? 'text-emerald-200' : 'text-white/40'}`} />
                    <span>Living</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => canEditPerson && setIsPrivate((prev) => !prev)}
                    disabled={!canEditPerson}
                    className={`flex items-center gap-2 px-3 py-1.5 rounded-full border text-[10px] font-black uppercase tracking-[0.2em] transition ${
                      isPrivate
                        ? 'bg-rose-500/20 border-rose-300 text-rose-100'
                        : 'border-white/20 text-white/60'
                    } ${canEditPerson ? 'hover:bg-white/10' : 'opacity-60 cursor-not-allowed'}`}
                  >
                    <Check className={`w-3 h-3 ${isPrivate ? 'text-rose-200' : 'text-white/40'}`} />
                    <span>Private</span>
                  </button>
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
      <div
        className="flex-1 overflow-y-auto p-8 bg-slate-50/30 no-scrollbar pb-32"
        style={{ paddingBottom: 'calc(8rem + env(safe-area-inset-bottom, 0px))' }}
      >
        {saveError && (
          <div className="mb-4 rounded-2xl border border-rose-200 bg-rose-50/80 px-4 py-3 text-sm text-rose-700">
            {saveError}
          </div>
        )}
        {activeSection === 'vital' && (
          <VitalTab
            canEdit={canEditPerson}
            firstName={firstName}
            lastName={lastName}
            maidenName={maidenName}
            onFirstNameChange={setFirstName}
            onLastNameChange={setLastName}
            onMaidenNameChange={setMaidenName}
            altNames={altNames}
            onAddAltName={handleAddAltName}
            onUpdateAltName={handleUpdateAltName}
            onRemoveAltName={handleRemoveAltName}
            birthDate={birthDate}
            onBirthDateChange={setBirthDate}
            birthPlace={birthPlace}
            onBirthPlaceChange={setBirthPlace}
            deathDate={deathDate}
            onDeathDateChange={setDeathDate}
            deathPlace={deathPlace}
            onDeathPlaceChange={setDeathPlace}
            residenceAtDeath={residenceAtDeath}
            onResidenceAtDeathChange={setResidenceAtDeath}
            deathCause={deathCause}
            onDeathCauseChange={setDeathCause}
            normalizedDeathCause={normalizedDeathCause}
            onNormalizedDeathCauseChange={setNormalizedDeathCause}
            onNormalizeDeathCause={handleNormalizeDeathCause}
            isNormalizingDeathCause={normalizingDeathCause}
            normalizeDeathCauseError={normalizeDeathCauseError}
            aiAvailable={hasOpenRouterConfig()}
            deathCategory={deathCategory}
            onDeathCategoryChange={setDeathCategory}
            burialDate={burialDate}
            onBurialDateChange={setBurialDate}
            burialPlace={burialPlace}
            onBurialPlaceChange={setBurialPlace}
            events={events}
            onAddEvent={handleAddEvent}
            onUpdateEvent={handleUpdateEvent}
            onRemoveEvent={handleRemoveEvent}
            onAddSource={handleAddSource}
            onNotesBadgeClick={handleNotesBadgeClick}
            getSourceCountForEvent={getSourceCountForEvent}
            getNoteCountForEvent={getNoteCountForEvent}
            getMediaCountForEvent={getMediaCountForEvent}
          />
        )}

        {activeSection === 'family' && (
          <FamilyTab
            parents={parents}
            spouses={spouses}
            children={children}
            siblings={siblings}
            person={person}
            relationships={relationshipData}
            relConfidences={relConfidences}
            onUpdateConfidence={handleUpdateConfidence}
            onNavigateToPerson={handleNavigateRequest}
            familyLayout={person.metadata?.familyLayout as FamilyLayoutState | undefined}
            onPersistFamilyLayout={onPersistFamilyLayout}
            canEdit={canEditFamily}
            loading={connectionsLoading}
            error={connectionsError}
            onUnlinkRelationship={handleUnlinkRelationship}
            onUpdateRelationshipDetails={handleUpdateRelationshipDetails}
            onRequestAddParent={handleRequestAddParent}
            pendingParentType={pendingParentType}
          />
        )}

        {activeSection === 'story' && (
          <StoryTab bio={person.bio} />
        )}

        {activeSection === 'sources' && (
          <SourcesTab
            canEdit={canEditPerson}
            sources={sources}
            availableEvents={availableEvents}
            onAddSource={() => handleAddSource()}
            onUpdateSource={handleUpdateSource}
            onRemoveSource={handleRemoveSource}
            citationMap={citationMap}
          />
        )}

        {activeSection === 'media' && (
          <MediaTab
            canEdit={canEditPerson}
            mediaItems={mediaItems}
            onUploadClick={() => fileInputRef.current?.click()}
            onLinkMedia={handleLinkMedia}
            onUpdateMedia={handleUpdateMediaItem}
            onRemoveMedia={handleRemoveMediaItem}
          />
        )}

        {activeSection === 'dna' && (
          <DNATab
            personId={person.id}
            personNameCandidates={[
              [firstName, lastName].filter(Boolean).join(' ').trim(),
              [firstName, maidenName].filter(Boolean).join(' ').trim(),
              [person.firstName, person.lastName].filter(Boolean).join(' ').trim(),
              [person.firstName, person.maidenName].filter(Boolean).join(' ').trim(),
            ].filter(Boolean)}
            dnaTests={dnaTests}
            canAccessDNA={canAccessDNA}
            onAddTest={handleAddDNATest}
            onUpdateTest={handleUpdateDnaTest}
            onRemoveTest={handleRemoveDnaTest}
          />
        )}

        {activeSection === 'notes' && (
          <NotesTab
            canEdit={canEditPerson}
            notes={notes}
            availableEvents={availableEvents}
            onAddNote={() => handleAddNote()}
            onUpdateNote={handleUpdateNoteEntry}
            onRemoveNote={handleRemoveNoteEntry}
          />
        )}
      </div>
    </div>
    {overlayProfile && (
      <PersonProfile
        person={overlayProfile}
        currentUser={currentUser}
        onClose={() => {
          setOverlayProfile(null);
          refreshConnections();
        }}
        onNavigateToPerson={(target) => setOverlayProfile(target)}
        onPersistFamilyLayout={onPersistFamilyLayout}
        onPersonUpdated={(updated) => {
          if (overlayProfile && updated.id === overlayProfile.id) {
            setOverlayProfile(updated);
          }
          onPersonUpdated?.(updated);
        }}
        onOpenTreeFromProfile={onOpenTreeFromProfile}
      />
    )}
    </>
  );
};

export default PersonProfile;
