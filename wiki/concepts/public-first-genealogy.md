# Concept: Public-first genealogy

Linegra is designed so the **public, read-only experience is the primary surface** and admin
editing is a privileged overlay — not the other way around. This shapes nearly every
technical choice.

## Principles

1. **Anonymous = read-only.** Visitors browse public trees with no account. Writes require an
   authenticated admin and are gated by RLS `can_write_tree`. See
   [../decisions/supabase-rls-can-read-write.md](../decisions/supabase-rls-can-read-write.md).
2. **Snappy is a product requirement** (SPEC §7). The UI must stay responsive on large trees.
   - **No full-tree hydration** for default views.
   - Prefer paged/targeted queries and RPC summaries (`tree_statistics`, landing widgets,
     `fetchPersonConnections`, incremental pedigree expansion).
   - Expensive workflows (imports, lineage resolution, nuke) must show explicit progress.
3. **Privacy is enforced server-side.** Private profiles/notes are hidden from public views via
   RLS + `person_visibility`, never by client-side filtering alone.
4. **Fidelity over coercion.** Genealogical data is uncertain; the schema keeps raw `*_text`
   values beside parsed typed columns so nothing is lost. See [../schema.md](../schema.md).

## Where this shows up in code

- Boot gate (won't render without Supabase env; no mock archive) — [../../App.tsx](../../App.tsx).
- Pedigree incremental load — [../../components/InteractiveTree/PedigreeTree.tsx](../../components/InteractiveTree/PedigreeTree.tsx),
  [../../lib/pedigreeScope.ts](../../lib/pedigreeScope.ts).
- Landing benchmarks + highlights — [../../components/TreeLandingPage.tsx](../../components/TreeLandingPage.tsx),
  `fetchTreeStatistics` and widget fetchers in [../../services/archive.ts](../../services/archive.ts).
- Paged search — `searchPersonsInTree` in [../../services/archive.ts](../../services/archive.ts).

## Anti-patterns to avoid

- Loading every person/relationship of a tree to render a default view.
- Relying on hidden-in-CSS to "protect" private data.
- Adding a mutation path that bypasses an RPC/RLS check or skips `audit_logs`.

Related: [dna-lineage-verification.md](dna-lineage-verification.md),
[../architecture.md](../architecture.md).
