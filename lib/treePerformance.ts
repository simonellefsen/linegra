// Roadmap G — performance guardrails for pedigree views (SPEC §7).
// Default interactive views must stay bounded even when the backing tree has thousands of people.

import { Person, Relationship } from '../types';
import { computePedigreeScope, PedigreeScopeResult } from './pedigreeScope';

/** Default pedigree expansion on first tree open (matches load_pedigree_scope + App.tsx). */
export const DEFAULT_PEDIGREE_ANCESTOR_DEPTH = 2;
export const DEFAULT_PEDIGREE_DESCENDANT_DEPTH = 1;

/** Hard UI caps — mirrored in load_pedigree_scope SQL (ancestor ≤ 8, descendant ≤ 4). */
export const MAX_PEDIGREE_ANCESTOR_DEPTH = 8;
export const MAX_PEDIGREE_DESCENDANT_DEPTH = 4;

/** Client search page size (App.tsx). */
export const SEARCH_PAGE_SIZE = 40;

/** Max persons scanned for the landing "this month" birthday widget before client filter. */
export const LANDING_BIRTHDAY_SCAN_LIMIT = 200;

/** Full-tree archive loads (admin book composer / research) warn above this person count. */
export const ARCHIVE_FULL_LOAD_WARN_PEOPLE = 500;

export interface TreePerformanceBudget {
  maxPeople: number;
  maxRelationships: number;
}

/** Expected upper bound for the default pedigree scope returned by loadPedigreeScope. */
export const DEFAULT_PEDIGREE_VIEW_BUDGET: TreePerformanceBudget = {
  maxPeople: 128,
  maxRelationships: 256,
};

/** Upper bound when the user expands to max ancestor/descendant depth in the UI. */
export const MAX_EXPANDED_PEDIGREE_VIEW_BUDGET: TreePerformanceBudget = {
  maxPeople: 512,
  maxRelationships: 1024,
};

/** CI guardrail: client-side scope filtering must stay snappy on large in-memory archives. */
export const SCOPE_COMPUTE_BUDGET_MS = 100;

export interface PedigreeScopeStats {
  people: number;
  relationships: number;
  hasMoreAncestors: boolean;
  hasMoreDescendants: boolean;
}

export interface BudgetEvaluation {
  ok: boolean;
  violations: string[];
  stats: PedigreeScopeStats;
}

export const summarizePedigreeScope = (
  scope: Pick<PedigreeScopeResult, 'people' | 'relationships' | 'hasMoreAncestors' | 'hasMoreDescendants'>
): PedigreeScopeStats => ({
  people: scope.people.length,
  relationships: scope.relationships.length,
  hasMoreAncestors: scope.hasMoreAncestors,
  hasMoreDescendants: scope.hasMoreDescendants,
});

export const evaluatePedigreeScopeBudget = (
  scope: Pick<PedigreeScopeResult, 'people' | 'relationships' | 'hasMoreAncestors' | 'hasMoreDescendants'>,
  budget: TreePerformanceBudget = DEFAULT_PEDIGREE_VIEW_BUDGET
): BudgetEvaluation => {
  const stats = summarizePedigreeScope(scope);
  const violations: string[] = [];
  if (stats.people > budget.maxPeople) {
    violations.push(`people ${stats.people} exceeds budget ${budget.maxPeople}`);
  }
  if (stats.relationships > budget.maxRelationships) {
    violations.push(`relationships ${stats.relationships} exceeds budget ${budget.maxRelationships}`);
  }
  return { ok: violations.length === 0, violations, stats };
};

export const measurePedigreeScopeCompute = (
  people: Person[],
  relationships: Relationship[],
  focusId: string,
  maxAncestorDepth: number,
  maxDescendantDepth: number
): { ms: number; scope: PedigreeScopeResult } => {
  const started = performance.now();
  const scope = computePedigreeScope(
    people,
    relationships,
    focusId,
    maxAncestorDepth,
    maxDescendantDepth
  );
  return { ms: performance.now() - started, scope };
};

export interface ArchiveLoadAssessment {
  personCount: number;
  relationshipCount: number;
  exceedsWarnThreshold: boolean;
  message: string;
}

export const assessArchiveLoad = (
  personCount: number,
  relationshipCount: number
): ArchiveLoadAssessment => ({
  personCount,
  relationshipCount,
  exceedsWarnThreshold: personCount >= ARCHIVE_FULL_LOAD_WARN_PEOPLE,
  message: `Full tree archive load (${personCount} people, ${relationshipCount} relationships). Interactive views should use loadPedigreeScope instead.`,
});

const personStub = (id: string, treeId = 'synthetic'): Person =>
  ({
    id,
    treeId,
    firstName: id,
    lastName: 'Test',
    gender: 'O',
  }) as Person;

const parentalRel = (id: string, parentId: string, childId: string, treeId = 'synthetic'): Relationship =>
  ({
    id,
    treeId,
    personId: parentId,
    relatedId: childId,
    type: 'bio_father',
  }) as Relationship;

/**
 * Binary ancestor tree for benchmarks: each person has two parents for `ancestorGenerations`
 * above the focus person (worst-case pedigree fan-out).
 */
export const buildBinaryAncestorFixture = (
  ancestorGenerations: number,
  treeId = 'synthetic'
): { people: Person[]; relationships: Relationship[]; focusId: string } => {
  const people: Person[] = [];
  const relationships: Relationship[] = [];
  const focusId = 'focus';
  people.push(personStub(focusId, treeId));

  let frontier = [focusId];
  for (let generation = 1; generation <= ancestorGenerations; generation += 1) {
    const nextFrontier: string[] = [];
    for (const childId of frontier) {
      const fatherId = `father-${childId}`;
      const motherId = `mother-${childId}`;
      people.push(personStub(fatherId, treeId), personStub(motherId, treeId));
      relationships.push(
        parentalRel(`rel-f-${childId}`, fatherId, childId, treeId),
        parentalRel(`rel-m-${childId}`, motherId, childId, treeId)
      );
      nextFrontier.push(fatherId, motherId);
    }
    frontier = nextFrontier;
  }

  return { people, relationships, focusId };
};
