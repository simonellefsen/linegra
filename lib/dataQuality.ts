// Data-quality / "Research issues" engine: pure checks that surface likely genealogy errors as
// actionable issues. No I/O, no Supabase — fully unit-testable. Reuses the plausibility cap from
// lib/lifespan.ts. Roadmap item O.

import { Person, Relationship, RelationshipType } from '../types';
import { extractBirthYear, MAX_PLAUSIBLE_AGE } from './lifespan';

export type DataQualitySeverity = 'error' | 'warning';

export type DataQualityIssueType =
  | 'death-before-birth'
  | 'burial-before-death'
  | 'implausible-lifespan'
  | 'parent-younger-than-child'
  | 'implausibly-young-parent'
  | 'child-after-parent-death'
  | 'duplicate-person';

export interface DataQualityIssue {
  id: string;
  type: DataQualityIssueType;
  severity: DataQualitySeverity;
  personIds: string[];
  message: string;
}

const PARENTAL_TYPES: RelationshipType[] = [
  'bio_father',
  'bio_mother',
  'adoptive_father',
  'adoptive_mother',
  'step_parent',
  'guardian',
];
const parentalSet = new Set<RelationshipType>(PARENTAL_TYPES);

/** First 4-digit year in any fuzzy date string (works for birth, death, burial). */
const yearOf = extractBirthYear;

const MIN_PARENT_AGE = 12; // below this, biological parenthood is implausible
const POST_DEATH_GRACE_YEARS = 1; // a father can sire a child up to ~1 year before a recorded death

const fullName = (person: Person): string => `${person.firstName} ${person.lastName}`.trim() || 'Unknown';

/**
 * Run all data-quality checks over a set of people + relationships and return the issues found.
 * Pure; safe to memoize in a UI panel. Issues have stable ids (type + person/relationship ids) so
 * they can be keyed in lists.
 */
export const runDataQualityChecks = (
  people: Person[],
  relationships: Relationship[]
): DataQualityIssue[] => {
  const issues: DataQualityIssue[] = [];
  const byId = new Map<string, Person>(people.map((p) => [p.id, p]));

  // Per-person checks.
  for (const person of people) {
    const birth = yearOf(person.birthDate);
    const death = yearOf(person.deathDate);
    const burial = yearOf(person.burialDate);

    if (birth != null && death != null && death < birth) {
      issues.push({
        id: `death-before-birth:${person.id}`,
        type: 'death-before-birth',
        severity: 'error',
        personIds: [person.id],
        message: `${fullName(person)}: death (${death}) recorded before birth (${birth}).`,
      });
    }
    if (death != null && burial != null && burial < death) {
      issues.push({
        id: `burial-before-death:${person.id}`,
        type: 'burial-before-death',
        severity: 'error',
        personIds: [person.id],
        message: `${fullName(person)}: burial (${burial}) recorded before death (${death}).`,
      });
    }
    if (birth != null && death != null && death - birth > MAX_PLAUSIBLE_AGE) {
      issues.push({
        id: `implausible-lifespan:${person.id}`,
        type: 'implausible-lifespan',
        severity: 'error',
        personIds: [person.id],
        message: `${fullName(person)}: lifespan ${birth}–${death} (${death - birth} years) exceeds ${MAX_PLAUSIBLE_AGE}.`,
      });
    }
  }

  // Relationship-based checks (parent → child; parental links are stored personId=parent, relatedId=child).
  for (const rel of relationships) {
    if (!parentalSet.has(rel.type)) continue;
    const parent = byId.get(rel.personId);
    const child = byId.get(rel.relatedId);
    if (!parent || !child) continue;

    const parentBirth = yearOf(parent.birthDate);
    const parentDeath = yearOf(parent.deathDate);
    const childBirth = yearOf(child.birthDate);

    if (parentBirth != null && childBirth != null) {
      if (parentBirth >= childBirth) {
        issues.push({
          id: `parent-younger-than-child:${rel.id}`,
          type: 'parent-younger-than-child',
          severity: 'error',
          personIds: [parent.id, child.id],
          message: `${fullName(parent)} (born ${parentBirth}) is not older than child ${fullName(child)} (born ${childBirth}).`,
        });
      } else if (childBirth - parentBirth < MIN_PARENT_AGE) {
        issues.push({
          id: `implausibly-young-parent:${rel.id}`,
          type: 'implausibly-young-parent',
          severity: 'error',
          personIds: [parent.id, child.id],
          message: `${fullName(parent)} would be only ${childBirth - parentBirth} when ${fullName(child)} was born (${childBirth}).`,
        });
      }
    }
    if (parentDeath != null && childBirth != null && childBirth > parentDeath + POST_DEATH_GRACE_YEARS) {
      issues.push({
        id: `child-after-parent-death:${rel.id}`,
        type: 'child-after-parent-death',
        severity: 'error',
        personIds: [parent.id, child.id],
        message: `${fullName(child)} (born ${childBirth}) was born more than ${POST_DEATH_GRACE_YEARS} year(s) after ${fullName(parent)}'s death (${parentDeath}).`,
      });
    }
  }

  // Duplicate-person: same first+last name with birth years within ±2.
  const byName = new Map<string, Person[]>();
  for (const person of people) {
    const first = (person.firstName || '').trim().toLowerCase();
    const last = (person.lastName || '').trim().toLowerCase();
    if (!first || !last) continue;
    if (yearOf(person.birthDate) == null) continue;
    const key = `${first}|${last}`;
    const arr = byName.get(key) || [];
    arr.push(person);
    byName.set(key, arr);
  }
  for (const group of byName.values()) {
    if (group.length < 2) continue;
    for (let i = 0; i < group.length; i += 1) {
      for (let j = i + 1; j < group.length; j += 1) {
        const a = group[i];
        const b = group[j];
        const ya = yearOf(a.birthDate);
        const yb = yearOf(b.birthDate);
        if (ya == null || yb == null) continue;
        if (Math.abs(ya - yb) <= 2) {
          issues.push({
            id: `duplicate-person:${a.id < b.id ? `${a.id},${b.id}` : `${b.id},${a.id}`}`,
            type: 'duplicate-person',
            severity: 'warning',
            personIds: [a.id, b.id],
            message: `Possible duplicate: ${fullName(a)} (${ya}) and ${fullName(b)} (${yb}) share a name and close birth year.`,
          });
        }
      }
    }
  }

  return issues;
};
