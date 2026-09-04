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

## Family-block rendering (2026-09-04)

The pedigree renderer now positions **families**, not independently packed generation rows.
The scope/graph selection remains in `lib/pedigreeLayout.ts`; the presentation geometry lives in
`lib/pedigreeFamilyLayout.ts`. Other views, including the fan chart, retain their own geometry.

- Each known parent set gets one labeled frame and one child branch, shared by its siblings.
  Each descendant family reserves enough horizontal space for its entire visible subtree.
  No unrelated card may be inserted between the members of a family or across its child branch.
- Marriage and partnership labels come from explicit relationship UUID pairs. Shared children alone
  are labeled **Co-parents**, not assumed to establish a marriage. Single-parent records and missing
  parent placeholders remain distinct from recorded unions.
- A person with multiple families can appear in more than one frame, marked **Same person - shown
  again**. These are presentation occurrences of the same UUID, not new person records. Profile
  selection, parent creation, expansion controls, and DNA actions always use the original person ID.
  The **N views** button cycles between that person's visible occurrences without changing focus.
  A family already expanded elsewhere becomes a labeled terminal reference to bound shared branches.
- Ancestor branches reserve their own space above the focus. Missing-parent cards connect to their
  actual child, not to whichever child happens to be horizontally nearest.
- The renderer keeps DNA badges and per-child lineage evidence styling. A child's DNA evidence does
  not recolor an entire sibling branch as if every sibling had that evidence.

Regression coverage includes the Fredin/Brodden/Bystrom branch topology, multiple unions, single
parents, placeholder grandparents, shared branches, and UUID identity after name changes. Wider
canvases are intentional: pan/zoom rather than compressing unrelated families into an ambiguous row.
