// Pure, dependency-light planning for AI Family Books.
//
// No AI, no Supabase — everything here is deterministic so it can be unit-tested and so a book
// can be planned (and even composed with deterministic fallbacks) without a network key. The
// relationship direction mirrors `lib/pedigreeScope.ts`: parental links are stored parent→child
// (`personId` = parent, `relatedId` = child); spouse/partner links are symmetric.

import {
  Person,
  Relationship,
  RelationshipType,
  StructuredPlace,
  FamilyTree,
  BookChapter,
  BookChapterFacts,
  BookStatistics,
  BookGenerationOptions,
  PersonBiography,
  PersonEvent,
  BookChapterEvent,
} from '../types';
import { extractBirthYear } from './lifespan';
import { bookStrings } from './bookI18n';

export const PARENTAL_TYPES: RelationshipType[] = [
  'bio_father',
  'bio_mother',
  'adoptive_father',
  'adoptive_mother',
  'step_parent',
  'guardian',
];

const SPOUSE_TYPES: RelationshipType[] = ['marriage', 'partner'];

const parentalTypeSet = new Set<RelationshipType>(PARENTAL_TYPES);
const spouseTypeSet = new Set<RelationshipType>(SPOUSE_TYPES);

/** Re-exported year extractor so callers have one import surface for book planning. */
export const extractYear = extractBirthYear;

const placeToText = (place?: string | StructuredPlace | null): string => {
  if (!place) return '';
  if (typeof place === 'string') return place.trim();
  // Most-specific first (street-level detail omitted to keep book prose clean), including the
  // genealogically important parish (sogn) and hundred (herred) when present.
  return [place.placeName, place.city, place.parish, place.hundred, place.county, place.state, place.country]
    .map((part) => (typeof part === 'string' ? part.trim() : ''))
    .filter(Boolean)
    .join(', ') || place.fullText?.trim() || '';
};

/** Display name with maiden name shown parenthetically when it differs from the surname. */
export const fullName = (person: Pick<Person, 'firstName' | 'lastName' | 'maidenName'>): string => {
  const first = (person.firstName || '').trim();
  const last = (person.lastName || '').trim();
  const maiden = (person.maidenName || '').trim();
  const base = [first, last].filter(Boolean).join(' ').trim() || 'Unknown';
  if (maiden && maiden.toLowerCase() !== last.toLowerCase()) {
    return `${base} (née ${maiden})`;
  }
  return base;
};

interface RelationshipMaps {
  /** child id → parental links (link.personId is the parent) */
  parentsByChild: Map<string, Relationship[]>;
  /** parent id → parental links (link.relatedId is the child) */
  childrenByParent: Map<string, Relationship[]>;
  /** person id → spouse/partner links involving them */
  spousesByPerson: Map<string, Relationship[]>;
}

export const buildRelationshipMaps = (relationships: Relationship[]): RelationshipMaps => {
  const parentsByChild = new Map<string, Relationship[]>();
  const childrenByParent = new Map<string, Relationship[]>();
  const spousesByPerson = new Map<string, Relationship[]>();

  const push = (map: Map<string, Relationship[]>, key: string, rel: Relationship) => {
    const list = map.get(key);
    if (list) list.push(rel);
    else map.set(key, [rel]);
  };

  relationships.forEach((rel) => {
    if (parentalTypeSet.has(rel.type)) {
      push(parentsByChild, rel.relatedId, rel); // relatedId = child
      push(childrenByParent, rel.personId, rel); // personId = parent
    } else if (spouseTypeSet.has(rel.type)) {
      push(spousesByPerson, rel.personId, rel);
      push(spousesByPerson, rel.relatedId, rel);
    }
  });

  return { parentsByChild, childrenByParent, spousesByPerson };
};

const peopleIn = (people: Person[], ids: string[]): Person[] => {
  const set = new Set(ids);
  return people.filter((p) => set.has(p.id));
};

export const findParents = (personId: string, people: Person[], maps: RelationshipMaps): Person[] => {
  const links = maps.parentsByChild.get(personId) || [];
  const ids = links.map((l) => l.personId);
  return peopleIn(people, ids);
};

export const findChildren = (personId: string, people: Person[], maps: RelationshipMaps): Person[] => {
  const links = maps.childrenByParent.get(personId) || [];
  const ids = links.map((l) => l.relatedId);
  return peopleIn(people, ids);
};

/**
 * People linked to `personId` by a union of one of the given types. Marriage and partner unions are
 * symmetric, so the counterpart is whichever side of the link the person is not.
 */
const findUnionPartners = (
  personId: string,
  people: Person[],
  maps: RelationshipMaps,
  types: RelationshipType[]
): Person[] => {
  const typeSet = new Set(types);
  const links = (maps.spousesByPerson.get(personId) || []).filter((l) => typeSet.has(l.type));
  const ids = links.map((l) => (l.personId === personId ? l.relatedId : l.personId));
  return peopleIn(people, ids);
};

export const findSpouses = (personId: string, people: Person[], maps: RelationshipMaps): Person[] =>
  findUnionPartners(personId, people, maps, ['marriage']);

/** Unmarried cohabiting partners (the `partner` union type). */
export const findPartners = (personId: string, people: Person[], maps: RelationshipMaps): Person[] =>
  findUnionPartners(personId, people, maps, ['partner']);

export const findSiblings = (personId: string, people: Person[], maps: RelationshipMaps): Person[] => {
  const parents = findParents(personId, people, maps);
  if (!parents.length) return [];
  const siblingIds = new Set<string>();
  parents.forEach((parent) => {
    (maps.childrenByParent.get(parent.id) || []).forEach((link) => {
      if (link.relatedId !== personId) siblingIds.add(link.relatedId);
    });
  });
  return people.filter((p) => siblingIds.has(p.id));
};

/** All descendants of `rootId` (BFS down the parental links), including the root. */
export const collectDescendants = (
  rootId: string,
  maps: RelationshipMaps
): Set<string> => {
  const result = new Set<string>([rootId]);
  const queue: string[] = [rootId];
  while (queue.length) {
    const current = queue.shift()!;
    const links = maps.childrenByParent.get(current) || [];
    links.forEach((link) => {
      if (!result.has(link.relatedId)) {
        result.add(link.relatedId);
        queue.push(link.relatedId);
      }
    });
  }
  return result;
};

/**
 * Reading order for a family-history book: chronological by birth year (earliest ancestors first),
 * with `generation` as a tiebreak when available. People with no dateable anchor sort last,
 * preserving their input order (stable sort).
 */
export const orderPeopleForBook = (people: Person[]): Person[] => {
  const keyed = people.map((person, index) => {
    const birthYear = extractYear(person.birthDate);
    const generation = typeof person.generation === 'number' ? person.generation : null;
    return { person, index, birthYear, generation };
  });
  keyed.sort((a, b) => {
    const ga = a.generation ?? Number.POSITIVE_INFINITY;
    const gb = b.generation ?? Number.POSITIVE_INFINITY;
    if (ga !== gb) return ga - gb;
    const ya = a.birthYear ?? Number.POSITIVE_INFINITY;
    const yb = b.birthYear ?? Number.POSITIVE_INFINITY;
    if (ya !== yb) return ya - yb;
    return a.index - b.index;
  });
  return keyed.map((entry) => entry.person);
};

const topCounts = (values: string[], limit: number): string[] => {
  const counts = new Map<string, number>();
  values.forEach((value) => {
    const key = value.trim();
    if (!key) return;
    counts.set(key, (counts.get(key) || 0) + 1);
  });
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, limit)
    .map(([key]) => key);
};

/** Longest parent→child chain reachable from any person (a rough "generation depth"). Cycle-safe. */
const computeGenerationDepth = (people: Person[], maps: RelationshipMaps): number => {
  const memo = new Map<string, number>();
  const peopleIds = new Set(people.map((p) => p.id));

  const depthFrom = (id: string, visiting: Set<string>): number => {
    if (memo.has(id)) return memo.get(id)!;
    if (visiting.has(id)) return 0; // cycle guard
    visiting.add(id);
    const childLinks = maps.childrenByParent.get(id) || [];
    let best = 0;
    childLinks.forEach((link) => {
      if (peopleIds.has(link.relatedId)) {
        best = Math.max(best, 1 + depthFrom(link.relatedId, visiting));
      }
    });
    visiting.delete(id);
    memo.set(id, best);
    return best;
  };

  let max = 0;
  people.forEach((person) => {
    max = Math.max(max, depthFrom(person.id, new Set()));
  });
  return max;
};

export const summarizeFamily = (people: Person[], relationships: Relationship[]): BookStatistics => {
  const maps = buildRelationshipMaps(relationships);
  const birthYears: number[] = [];
  const deathYears: number[] = [];
  const surnames: string[] = [];
  const places: string[] = [];
  const occupations: string[] = [];

  people.forEach((person) => {
    const by = extractYear(person.birthDate);
    if (by != null) birthYears.push(by);
    const dy = extractYear(person.deathDate) ?? extractYear(person.burialDate);
    if (dy != null) deathYears.push(dy);
    if (person.lastName?.trim()) surnames.push(person.lastName.trim());
    const bp = placeToText(person.birthPlace);
    if (bp) places.push(bp);
    const dp = placeToText(person.deathPlace);
    if (dp) places.push(dp);
    (person.occupations || []).forEach((occupation) => occupations.push(occupation));
  });

  return {
    personCount: people.length,
    earliestBirthYear: birthYears.length ? Math.min(...birthYears) : null,
    latestDeathYear: deathYears.length ? Math.max(...deathYears) : null,
    topSurnames: topCounts(surnames, 5),
    topPlaces: topCounts(places, 6),
    topOccupations: topCounts(occupations, 5),
    generationDepth: people.length ? computeGenerationDepth(people, maps) : 0,
  };
};

const lifespanLabel = (person: Person): string => {
  const by = extractYear(person.birthDate);
  const dy = extractYear(person.deathDate) ?? extractYear(person.burialDate);
  if (by != null && dy != null) return `${by}–${dy}`;
  if (by != null) return `born ${by}`;
  if (dy != null) return `died ${dy}`;
  return '';
};

/** Compact, prompt-friendly summary of a custom life event: "Residence · Copenhagen · 1880". */
const eventLabel = (event: PersonEvent): string => {
  const place = placeToText(event.place);
  const date = event.date?.trim();
  const detail = event.description?.trim() || event.employer?.trim();
  const segments = [event.type || 'Event'];
  if (detail) segments.push(detail);
  if (place) segments.push(place);
  if (date) segments.push(date);
  return segments.join(' · ');
};

/** Map a person's custom life events (capped) into compact chapter events for the prompt. */
const buildChapterEvents = (person: Person): BookChapterEvent[] =>
  (person.events || [])
    .filter((e) => (e.type && e.type.trim()) || e.description?.trim() || placeToText(e.place))
    .slice(0, 8)
    .map((e) => ({ type: (e.type || 'Event').trim(), label: eventLabel(e) }));

/** Structured facts for one person chapter — the non-AI payload that drives the prompt and fallback. */
export const buildChapterFacts = (
  person: Person,
  people: Person[],
  maps: RelationshipMaps
): BookChapterFacts => ({
  birthYear: extractYear(person.birthDate),
  deathYear: extractYear(person.deathDate) ?? extractYear(person.burialDate),
  lifespanLabel: lifespanLabel(person),
  birthPlace: placeToText(person.birthPlace) || undefined,
  deathPlace: placeToText(person.deathPlace) || undefined,
  occupations: (person.occupations || []).filter(Boolean),
  spouseNames: findSpouses(person.id, people, maps).map((s) => fullName(s)),
  partnerNames: findPartners(person.id, people, maps).map((s) => fullName(s)),
  parentNames: findParents(person.id, people, maps).map((p) => fullName(p)),
  childNames: findChildren(person.id, people, maps).map((c) => fullName(c)),
  siblingNames: findSiblings(person.id, people, maps).map((s) => fullName(s)),
  events: buildChapterEvents(person),
  sourceCount: person.sources?.length ?? 0,
});

/**
 * A compact, deterministic "Grounded in: …" summary of the documented facts a biography was built
 * from, so a reader can see the evidence basis and tell documented fact apart from narrative
 * interpolation (decisions/ai-narrative-editing-and-grounding.md, roadmap M11). Pure and testable.
 * Returns '' when nothing is recorded.
 */
export const groundingSummary = (facts: BookChapterFacts): string => {
  const bits: string[] = [];
  if (facts.lifespanLabel) bits.push(facts.lifespanLabel);
  if (facts.birthPlace) bits.push(`born ${facts.birthPlace}`);
  if (facts.deathPlace) bits.push(`died ${facts.deathPlace}`);
  if (facts.occupations?.length) bits.push(facts.occupations.join(', '));
  const relCount =
    (facts.spouseNames?.length ?? 0) + (facts.partnerNames?.length ?? 0) + (facts.childNames?.length ?? 0);
  if (relCount) bits.push(`${relCount} documented relative${relCount === 1 ? '' : 's'}`);
  const eventCount = facts.events?.length ?? 0;
  if (eventCount) bits.push(`${eventCount} life event${eventCount === 1 ? '' : 's'}`);
  if (facts.sourceCount) bits.push(`${facts.sourceCount} source${facts.sourceCount === 1 ? '' : 's'}`);
  return bits.length ? `Grounded in: ${bits.join(' · ')}` : '';
};

// FNV-1a 32-bit — small, fast, dependency-free stable string hash.
const stableHash = (input: string): string => {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i += 1) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(36);
};

/**
 * Content signature for a person's biography. It changes whenever anything the biography is
 * derived from changes — the person's vitals/identity, their facts (places, occupations,
 * relatives), how many media items they have, or the generation options that affect the prose
 * (style / length / language). Stored alongside each saved biography so we can (a) skip
 * regenerating unchanged chapters when re-composing a book, and (b) flag a stale bio on the
 * profile. Adding info, a relative, or a picture to a person flips the signature → the chapter
 * is regenerated; everyone else is reused.
 */
export const personBiographySignature = (
  person: Person,
  facts: BookChapterFacts,
  options: Pick<BookGenerationOptions, 'style' | 'length' | 'language' | 'includeHistoricalContext'>,
  extra?: { mediaCount?: number }
): string => {
  const payload = {
    id: person.id,
    name: [person.firstName || '', person.lastName || '', person.maidenName || '', person.gender || ''],
    vitals: [
      person.birthDate || '', person.deathDate || '', person.burialDate || '',
      person.deathCause || '', person.normalizedDeathCause || '', person.bio || '',
    ],
    facts,
    media: extra?.mediaCount ?? (person.mediaIds?.length ?? 0),
    opts: [options.style, options.length, options.language, options.includeHistoricalContext ?? false],
  };
  return stableHash(JSON.stringify(payload));
};

/**
 * Decide whether a stored biography should be reused as-is when (re)composing a book, instead of
 * regenerating it. A **manual (human-edited)** biography is **always reused** — never silently
 * overwritten by AI — even when the person's facts have changed or the book is force-regenerated.
 * Preserving human work is policy: see wiki/decisions/ai-narrative-editing-and-grounding.md. An
 * AI-authored biography is reused only when its signature still matches the current facts and the
 * caller isn't forcing a full regeneration. `forceRegenerate` and a stale signature never apply to
 * a manual bio.
 */
export const shouldReuseBiography = (
  stored: PersonBiography,
  signature: string,
  forceRegenerate: boolean
): boolean => {
  if (stored.isManual && stored.narrative.trim()) return true;
  return !forceRegenerate && !!stored.narrative.trim() && stored.signature === signature;
};

/**
 * Move the chapter at `index` one slot in the given direction (-1 = up, +1 = down). No-op (returns
 * the same array reference) at the array edges or for an out-of-range index. Used by the book
 * editor's reorder controls; pure so it is unit-testable.
 */
export const moveChapter = (
  chapters: BookChapter[],
  index: number,
  direction: -1 | 1
): BookChapter[] => {
  const target = index + direction;
  if (index < 0 || index >= chapters.length || target < 0 || target >= chapters.length) {
    return chapters;
  }
  const next = chapters.slice();
  [next[index], next[target]] = [next[target], next[index]];
  return next;
};

/** Remove the chapter at `index`. No-op (same reference) for an out-of-range index. */
export const removeChapter = (chapters: BookChapter[], index: number): BookChapter[] => {
  if (index < 0 || index >= chapters.length) return chapters;
  return chapters.filter((_, i) => i !== index);
};

/** A new user-authored chapter (introduction, photo essay, source appendix, …). */
export const createCustomChapter = (title = 'New Chapter'): BookChapter => ({
  kind: 'custom',
  title,
  narrative: '',
});

/** Apply the scope filter (all / descendants-of-proband / explicit selection), then order for reading. */
export const selectPeopleForBook = (
  people: Person[],
  relationships: Relationship[],
  options: BookGenerationOptions
): Person[] => {
  let pool: Person[];
  if (options.scope === 'descendants' && options.probandId) {
    const maps = buildRelationshipMaps(relationships);
    const ids = collectDescendants(options.probandId, maps);
    pool = people.filter((p) => ids.has(p.id));
  } else if (options.scope === 'selected' && options.selectedIds?.length) {
    const ids = new Set(options.selectedIds);
    pool = people.filter((p) => ids.has(p.id));
  } else {
    pool = [...people];
  }
  return orderPeopleForBook(pool);
};

export interface BookPlan {
  title: string;
  subtitle: string;
  statistics: BookStatistics;
  chapters: BookChapter[];
}

/**
 * Assemble a book plan: a default title/subtitle, family statistics, and the chapter list
 * (one overview chapter + one person chapter per selected person). Chapter `narrative` fields are
 * left empty — the AI composer (or its deterministic fallback) fills them in `services/books.ts`.
 * Title/subtitle/overview-heading are localized via `options.language`.
 */
export const planBook = (
  tree: Pick<FamilyTree, 'name'> | null | undefined,
  people: Person[],
  relationships: Relationship[],
  options: BookGenerationOptions
): BookPlan => {
  const selected = selectPeopleForBook(people, relationships, options);
  const maps = buildRelationshipMaps(relationships);
  const statistics = summarizeFamily(selected, relationships);
  const strings = bookStrings(options.language);
  const surname = statistics.topSurnames[0] || '';
  const span = strings.spanPhrase(statistics.earliestBirthYear, statistics.latestDeathYear);

  const title = strings.familyHistory(surname);
  const subtitle = [tree?.name && tree.name !== title ? tree.name : null, span ? strings.narrativeChronicle(span) : null]
    .filter(Boolean)
    .join(' · ');

  const chapters: BookChapter[] = [
    {
      kind: 'overview',
      title: strings.theFamily(surname),
      narrative: '',
    },
    ...selected.map((person) => ({
      kind: 'person' as const,
      title: fullName(person),
      personId: person.id,
      narrative: '',
      facts: buildChapterFacts(person, selected, maps),
    })),
  ];

  return { title, subtitle, statistics, chapters };
};
