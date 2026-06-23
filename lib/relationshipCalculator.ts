// Relationship calculator: "how is A related to B?" — find the closest common ancestor (MRCA),
// derive the genealogical label (parent / grandparent / sibling / aunt-uncle / niece-nephew / cousin
// with degree + removed), and reconstruct the path A → … → B through the family graph.
//
// Pure (no I/O, no Supabase) so it is fully unit-testable and reusable: it feeds roadmap P, the DNA
// MRCA work (K2), and tree navigation (L). Parental links are stored personId=parent, relatedId=child
// (same convention as lib/pedigreeScope.ts / lib/bookComposer.ts).

import { Relationship, RelationshipType } from '../types';

const PARENTAL_TYPES: RelationshipType[] = [
  'bio_father',
  'bio_mother',
  'adoptive_father',
  'adoptive_mother',
  'step_parent',
  'guardian',
];
const parentalSet = new Set<RelationshipType>(PARENTAL_TYPES);

export type RelationshipKind =
  | 'self'
  | 'direct-ancestor'
  | 'direct-descendant'
  | 'sibling'
  | 'aunt-uncle'
  | 'niece-nephew'
  | 'cousin';

export interface RelationshipResult {
  /** Noun describing person B's relationship to person A (e.g. "grandparent", "2nd cousin once removed"). */
  label: string;
  kind: RelationshipKind;
  commonAncestorIds: string[]; // closest common ancestor(s) — the MRCA set
  generationsA?: number; // A → common ancestor
  generationsB?: number; // B → common ancestor
  cousinDegree?: number; // 1 = first cousin
  removed?: number; // times removed
  pathPersonIds: string[]; // A → … common ancestor … → B
}

/** childId → parent ids, from parental relationships. */
const buildParentMap = (relationships: Relationship[]): Map<string, Set<string>> => {
  const parents = new Map<string, Set<string>>();
  for (const rel of relationships) {
    if (!parentalSet.has(rel.type)) continue;
    const set = parents.get(rel.relatedId) || new Set<string>();
    set.add(rel.personId);
    parents.set(rel.relatedId, set);
  }
  return parents;
};

/** BFS upward from `startId`; returns depth of each ancestor (start = 0) and prev[ancestor] = descendant it was reached from. */
const ancestorsBFS = (
  startId: string,
  parentMap: Map<string, Set<string>>
): { depths: Map<string, number>; prev: Map<string, string> } => {
  const depths = new Map<string, number>([[startId, 0]]);
  const prev = new Map<string, string>();
  const queue: string[] = [startId];
  while (queue.length) {
    const id = queue.shift() as string;
    const depth = depths.get(id) as number;
    for (const pid of parentMap.get(id) || []) {
      if (!depths.has(pid)) {
        depths.set(pid, depth + 1);
        prev.set(pid, id);
        queue.push(pid);
      }
    }
  }
  return { depths, prev };
};

/** Walk from `ancestorId` back down to `descendantId` via prev → [ancestor, …, descendant]. */
const pathDown = (ancestorId: string, descendantId: string, prev: Map<string, string>): string[] | null => {
  const path = [ancestorId];
  let cur = ancestorId;
  while (cur !== descendantId) {
    const next = prev.get(cur);
    if (!next) return null;
    path.push(next);
    cur = next;
  }
  return path;
};

const ordinal = (n: number): string => {
  if (n === 1) return '1st';
  if (n === 2) return '2nd';
  if (n === 3) return '3rd';
  return `${n}th`;
};
const timesRemoved = (n: number): string => {
  if (n === 1) return 'once';
  if (n === 2) return 'twice';
  return `${n} times`;
};
const greatPrefix = (k: number): string => 'great-'.repeat(Math.max(0, k));
const ancestorLabel = (n: number): string =>
  n === 1 ? 'parent' : n === 2 ? 'grandparent' : `${greatPrefix(n - 2)}grandparent`;
const descendantLabel = (n: number): string =>
  n === 1 ? 'child' : n === 2 ? 'grandchild' : `${greatPrefix(n - 2)}grandchild`;
const auntUncleLabel = (n: number): string => (n === 2 ? 'aunt/uncle' : `${greatPrefix(n - 2)}aunt/uncle`);
const nieceNephewLabel = (n: number): string => (n === 2 ? 'niece/nephew' : `${greatPrefix(n - 2)}niece/nephew`);

/** Derive the label + kind from the generational distances of A and B to their common ancestor. */
const describeFromDepths = (ga: number, gb: number): { label: string; kind: RelationshipKind } => {
  if (ga === 0 && gb === 0) return { label: 'self (same person)', kind: 'self' };
  if (ga === 0) return { label: descendantLabel(gb), kind: 'direct-descendant' }; // A is ancestor of B
  if (gb === 0) return { label: ancestorLabel(ga), kind: 'direct-ancestor' }; // B is ancestor of A
  if (ga === 1 && gb === 1) return { label: 'sibling', kind: 'sibling' };
  // B is a child of the common ancestor (gb=1) while A is ≥2 below it → B is A's aunt/uncle.
  if (gb === 1 && ga >= 2) return { label: auntUncleLabel(ga), kind: 'aunt-uncle' };
  // A is a child of the common ancestor (ga=1) while B is ≥2 below it → B is A's niece/nephew.
  if (ga === 1 && gb >= 2) return { label: nieceNephewLabel(gb), kind: 'niece-nephew' };
  // Both ≥ 2 → cousin.
  const degree = Math.min(ga, gb) - 1;
  const removed = Math.abs(ga - gb);
  const label = `${ordinal(degree)} cousin${removed ? ` ${timesRemoved(removed)} removed` : ''}`;
  return { label, kind: 'cousin' };
};

/**
 * Compute B's relationship to A. Returns null when no blood relationship is found in the graph.
 * Picks the closest common ancestor (min generations, then most balanced) and reconstructs the path.
 */
export const computeRelationship = (
  personAId: string,
  personBId: string,
  relationships: Relationship[]
): RelationshipResult | null => {
  if (personAId === personBId) {
    return {
      label: 'self (same person)',
      kind: 'self',
      commonAncestorIds: [personAId],
      pathPersonIds: [personAId],
    };
  }

  const parentMap = buildParentMap(relationships);
  const a = ancestorsBFS(personAId, parentMap);
  const b = ancestorsBFS(personBId, parentMap);

  // Closest common ancestor(s): minimize total generations, then balance (max(ga,gb)).
  let bestSum = Infinity;
  let bestMax = Infinity;
  for (const [anc, ga] of a.depths) {
    const gb = b.depths.get(anc);
    if (gb === undefined) continue;
    const sum = ga + gb;
    const max = Math.max(ga, gb);
    if (sum < bestSum || (sum === bestSum && max < bestMax)) {
      bestSum = sum;
      bestMax = max;
    }
  }
  if (!Number.isFinite(bestSum)) return null; // unrelated

  // Collect every common ancestor at the closest depth pair.
  let bestPair: { ga: number; gb: number } | null = null;
  const commonAncestorIds: string[] = [];
  for (const [anc, ga] of a.depths) {
    const gb = b.depths.get(anc);
    if (gb === undefined) continue;
    if (ga + gb === bestSum && Math.max(ga, gb) === bestMax) {
      commonAncestorIds.push(anc);
      bestPair = { ga, gb };
    }
  }
  if (!bestPair) return null;
  const { ga, gb } = bestPair;
  const { label: baseLabel, kind } = describeFromDepths(ga, gb);

  // Half-sibling refinement: a single shared parent at (1,1).
  const label =
    kind === 'sibling' && commonAncestorIds.length === 1 ? 'half-sibling' : baseLabel;

  // Reconstruct the path through one MRCA: A → … → MRCA → … → B.
  const mrca = commonAncestorIds[0];
  const pathDownA = pathDown(mrca, personAId, a.prev); // [mrca, …, A]
  const pathDownB = pathDown(mrca, personBId, b.prev); // [mrca, …, B]
  let pathPersonIds: string[] = [];
  if (pathDownA && pathDownB) {
    const aToMrca = [...pathDownA].reverse(); // [A, …, mrca]
    const mrcaToB = pathDownB.slice(1); // […, B] (drop the shared mrca)
    pathPersonIds = [...aToMrca, ...mrcaToB];
  } else {
    pathPersonIds = [personAId, personBId];
  }

  const result: RelationshipResult = {
    label,
    kind,
    commonAncestorIds,
    pathPersonIds,
  };
  if (kind === 'cousin') {
    result.cousinDegree = Math.min(ga, gb) - 1;
    result.removed = Math.abs(ga - gb);
  }
  if (kind === 'direct-ancestor' || kind === 'aunt-uncle' || kind === 'niece-nephew' || kind === 'cousin' || kind === 'sibling') {
    result.generationsA = ga;
    result.generationsB = gb;
  }
  return result;
};
