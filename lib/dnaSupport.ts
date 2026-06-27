// Pure helpers for reading the DNA-lineage support recorded on relationships by the resolver in
// services/archive.ts (resolveSharedMatchLineage). When a shared-DNA match confirms a parental path,
// the resolver stamps each path relationship's `metadata.dna_support_by_person[focusPersonId]` with
// the supporting dna_matches.id values. These helpers extract those ids so the tree can (a) count
// DNA-backed lineages for badges and (b) join them to dna_matches.shared_cm to surface cM (roadmap L1).
//
// The stored shape has varied over time — either a bare string[] or a structured { match_ids: [] } —
// so both are tolerated. Pure (no I/O) so it is unit-testable; used by App.tsx and PedigreeTree.tsx.

import { Relationship } from '../types';

/** The DNA-match ids recorded under one relationship's `dna_support_by_person` metadata (any focus
 *  person). Tolerates the legacy `string[]` shape and the structured `{ match_ids: string[] }` shape.
 *  Deduped, order not significant. */
export const dnaSupportMatchIds = (metadata?: Record<string, unknown> | null): string[] => {
  if (!metadata || typeof metadata !== 'object') return [];
  const byPerson = (metadata as Record<string, unknown>).dna_support_by_person;
  if (!byPerson || typeof byPerson !== 'object' || Array.isArray(byPerson)) return [];
  const ids = new Set<string>();
  Object.values(byPerson as Record<string, unknown>).forEach((entry) => {
    if (Array.isArray(entry)) {
      entry.forEach((matchId) => {
        if (typeof matchId === 'string' && matchId) ids.add(matchId);
      });
      return;
    }
    if (entry && typeof entry === 'object' && Array.isArray((entry as Record<string, unknown>).match_ids)) {
      ((entry as Record<string, unknown>).match_ids as unknown[]).forEach((matchId) => {
        if (typeof matchId === 'string' && matchId) ids.add(matchId);
      });
    }
  });
  return Array.from(ids);
};

/** Every distinct DNA-match id referenced by any relationship's support metadata across the given set.
 *  Use to build a matchId → shared_cm lookup for the active tree's DNA-backed edges. */
export const collectDnaSupportMatchIds = (relationships: Relationship[]): string[] => {
  const ids = new Set<string>();
  for (const rel of relationships) {
    for (const id of dnaSupportMatchIds(rel.metadata as Record<string, unknown> | undefined)) {
      ids.add(id);
    }
  }
  return Array.from(ids);
};
