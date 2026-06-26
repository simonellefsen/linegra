# Linegra Wiki

**LLM-optimized project knowledge base.** This directory is the primary context source for
agents (coding agents, CI bots) working on Linegra. Start here, then follow links.

Linegra is a modern **genealogy archive**: fast public-first browsing, admin-controlled
curation, GEDCOM import/export, and DNA-informed lineage verification. Stack is
React + TypeScript + Vite + Tailwind on **Supabase** (PostgREST + RPC + RLS) with
**OpenRouter** for AI utilities.

For full context, also read the canonical top-level docs:
- [../SPEC.md](../SPEC.md) — product + technical specification
- [../AGENT.md](../AGENT.md) — agent/developer entrypoint and workflow expectations
- [../README.md](../README.md) — local run, login, deploy
- [../docs/CONTENT_MAP.md](../docs/CONTENT_MAP.md) — feature → file map

## Structure

- **[architecture.md](architecture.md)** — System topology and the six core flows
  (boot gate, read path, write path, GEDCOM import, DNA lineage, AI utilities) as Mermaid
  diagrams. Start here for the big picture.
- **[schema.md](schema.md)** — Database schema, enums, RLS invariants, and the RPC catalog.
- **[log.md](log.md)** — Chronological living log of major progress and learnings.
- **[roadmap.md](roadmap.md)** — Current status and candidate next work (open items, gaps).
- **concepts/** — Core ideas: public-first genealogy, DNA lineage verification, AI-assisted
  normalization, AI family books, and how this wiki is maintained.
- **decisions/** — Architectural/tech decisions with rationale.
- **integrations/** — Supabase, OpenRouter, GEDCOM, and DNA CSV format details.
- **runbooks/** — Operational procedures (build/test/deploy, migrations, imports).
- **sources/** — External references (GEDCOM tag notes, shared-cM relationship ranges).

## Quick Navigation for Agents

0. **See the whole system fast**: [architecture.md](architecture.md) (Mermaid diagrams).
1. **Understand the "why" and constraints**: [concepts/public-first-genealogy.md](concepts/public-first-genealogy.md),
   [concepts/dna-lineage-verification.md](concepts/dna-lineage-verification.md),
   [concepts/ai-assisted-normalization.md](concepts/ai-assisted-normalization.md).
2. **Current state & plan**: this index, [roadmap.md](roadmap.md), recent [log.md](log.md) entries.
3. **How to change things safely**: [../AGENT.md](../AGENT.md), [decisions/](decisions/README.md),
   [runbooks/build-test-deploy.md](runbooks/build-test-deploy.md).
4. **Data & persistence**: [schema.md](schema.md), [integrations/supabase.md](integrations/supabase.md).
5. **External truth**: [sources/gedcom-spec.md](sources/gedcom-spec.md),
   [sources/dna-cm-ranges.md](sources/dna-cm-ranges.md).

## Current Status (Summary)

**Phase**: Established product with active feature work. Core archive (trees, persons,
relationships, events, sources, citations, notes, media), pedigree tree UI, GEDCOM
import/export, DNA shared-match lineage resolution, and OpenRouter AI utilities are all live.

**Auth model**: single local **super-administrator** (bootstrap `linegra/linegra`, stored in
browser `localStorage`); anonymous visitors are read-only. Multi-user registration is **not
yet available** — see [decisions/local-superadmin-auth.md](decisions/local-superadmin-auth.md)
and [roadmap.md](roadmap.md).

**Most recent work** (per git): persisted media metadata + extended source categories,
deterministic + AI cause-of-death normalization, centralized admin AI settings, editable
union/relationship details in the Family tab, and **AI Family Books** (narrative generation +
PDF export, persisted to `family_books`) — see [concepts/ai-family-books.md](concepts/ai-family-books.md).

**Key open items**: see [roadmap.md](roadmap.md) — multi-user collaboration is schema-ready
(`tree_collaborators`) but has no UI; the legacy force graph was removed 2026-06-26 (pedigree is the
sole tree surface); DNA name-based fallback is legacy-only.

## Build Gate (never skip)

`npm run build` runs `lint → typecheck → vite build`. All three must pass before handoff.
See [runbooks/build-test-deploy.md](runbooks/build-test-deploy.md).

## Maintenance

This wiki is **LLM-maintained with human oversight** — see
[concepts/llm-maintained-project-wiki.md](concepts/llm-maintained-project-wiki.md). When you
change behavior, update the relevant wiki page, add a [log.md](log.md) entry, and keep
[../docs/CONTENT_MAP.md](../docs/CONTENT_MAP.md) in sync.

Last major refresh: 2026-06-20 (wiki created).
