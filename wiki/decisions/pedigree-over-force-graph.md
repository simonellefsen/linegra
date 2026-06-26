# Decision: Pedigree incremental view is primary; force graph is legacy

**Decision.** The primary tree surface is a **pedigree-style, incrementally loaded** view
([../../components/InteractiveTree/PedigreeTree.tsx](../../components/InteractiveTree/PedigreeTree.tsx)),
not a full-force directed graph.

> **Updated 2026-06-26:** the older force-graph renderer (`components/FamilyTree.tsx`) was **deleted**
> (roadmap B). It had been retained "for compatibility/testing," but it could never render —
> `layoutType` was a constant with no setter, so the pedigree/force-graph ternary always took the
> pedigree branch. Its one useful trait (`RelationshipConfidence` edge encoding) was ported into the
> live pedigree view first (L1). The layout-persistence/audit subsystem it shared lineage with is
> unrelated and was kept.

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
  loading. Alternate lenses (fan / timeline / map — roadmap L2–L4) will be **new** renderers built
  off [../../lib/pedigreeLayout.ts](../../lib/pedigreeLayout.ts), not a revival of the force graph.
- ~~The legacy `FamilyTree.tsx` is a candidate for removal/consolidation~~ — **removed 2026-06-26**
  (roadmap B). `TreeLayoutType` (`'pedigree' | 'fan' | 'descendant'`) stays in `types.ts` as the
  extension point for those future views.

Related: [../concepts/public-first-genealogy.md](../concepts/public-first-genealogy.md).
