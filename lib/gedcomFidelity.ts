// Roadmap E — GEDCOM import fidelity helpers (proband selection, archive summaries for tests).

import { Person, Relationship, RelationshipType } from '../types';

const PARENTAL_TYPES: RelationshipType[] = [
  'bio_father',
  'bio_mother',
  'adoptive_father',
  'adoptive_mother',
  'step_parent',
  'guardian',
];
const parentalSet = new Set<RelationshipType>(PARENTAL_TYPES);

export interface GedcomArchiveSummary {
  people: number;
  relationships: number;
  sources: number;
  citations: number;
  warnings: number;
}

export interface GedcomArchiveDiff {
  changed: boolean;
  fields: Array<{ field: string; before: unknown; after: unknown }>;
}

/** Count archive entities — used by import→export round-trip tests (roadmap E). */
export const summarizeGedcomArchive = (
  people: Person[],
  relationships: Relationship[],
  warnings: string[] = []
): GedcomArchiveSummary => ({
  people: people.length,
  relationships: relationships.length,
  sources: people.reduce((sum, person) => sum + (person.sources?.length ?? 0), 0),
  citations: people.reduce((sum, person) => sum + (person.citations?.length ?? 0), 0),
  warnings: warnings.length,
});

/** Shallow diff of archive summaries for regression tests. */
export const diffGedcomArchiveSummaries = (
  before: GedcomArchiveSummary,
  after: GedcomArchiveSummary
): GedcomArchiveDiff => {
  const fields: GedcomArchiveDiff['fields'] = [];
  for (const key of ['people', 'relationships', 'sources', 'citations'] as const) {
    if (before[key] !== after[key]) {
      fields.push({ field: key, before: before[key], after: after[key] });
    }
  }
  return { changed: fields.length > 0, fields };
};

/**
 * Pick a sensible default proband after GEDCOM import so the interactive tree opens on a meaningful
 * root instead of an arbitrary first row. Prefers parentless persons with descendants, then
 * submitter-linked individuals, then the first public person.
 */
export const inferDefaultProbandId = (
  people: Person[],
  relationships: Relationship[]
): string | null => {
  if (!people.length) return null;

  const parentCount = new Map<string, number>();
  const childCount = new Map<string, number>();
  relationships.forEach((rel) => {
    if (!parentalSet.has(rel.type)) return;
    parentCount.set(rel.relatedId, (parentCount.get(rel.relatedId) ?? 0) + 1);
    childCount.set(rel.personId, (childCount.get(rel.personId) ?? 0) + 1);
  });

  let bestId: string | null = null;
  let bestScore = Number.NEGATIVE_INFINITY;

  for (const person of people) {
    let score = 0;
    const parents = parentCount.get(person.id) ?? 0;
    const children = childCount.get(person.id) ?? 0;

    if (parents === 0) score += 50;
    score += Math.min(children, 24) * 4;
    if (person.birthDate) score += 3;
    if (person.metadata?.submitterIds && (person.metadata.submitterIds as string[]).length > 0) {
      score += 25;
    }
    if (person.isPrivate) score -= 20;

    if (score > bestScore) {
      bestScore = score;
      bestId = person.id;
    }
  }

  return bestId ?? people[0]?.id ?? null;
};
