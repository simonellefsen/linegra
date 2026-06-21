# Decision: Pedigree incremental view is primary; force graph is legacy

**Decision.** The primary tree surface is a **pedigree-style, incrementally loaded** view
([../../components/InteractiveTree/PedigreeTree.tsx](../../components/InteractiveTree/PedigreeTree.tsx)),
not a full-force directed graph. The older force-graph renderer
([../../components/FamilyTree.tsx](../../components/FamilyTree.tsx)) is retained for
compatibility/testing but is not the default.

## Why

- **Performance (SPEC §7).** A force graph wants the whole tree in memory and re-simulates on
  every change — the opposite of the "no full-tree hydration" requirement. Pedigree expansion
  loads ancestors/descendants on demand via [../../lib/pedigreeScope.ts](../../lib/pedigreeScope.ts).
- **Readability.** Genealogy users expect pedigree/ancestor charts; a physics graph obscures
  generational structure.
- **Predictable layout.** Placeholder parent cards and deterministic positioning beat a
  jittery force simulation.

## Alternatives rejected / deferred

- **Force graph as default** — kept only as a legacy/debug renderer.
- **Full custom graph engine** — unnecessary for the pedigree-first UX.

## Consequences

- New tree-navigation features should target the pedigree component and incremental scope
  loading, not the force graph.
- The legacy `FamilyTree.tsx` is a candidate for removal/consolidation — see
  [../roadmap.md](../roadmap.md) item B.

Related: [../concepts/public-first-genealogy.md](../concepts/public-first-genealogy.md).
