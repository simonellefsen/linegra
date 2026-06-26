# Linegra Content Map

This catalog highlights the most relevant files for the current Linegra architecture so you can jump straight to the code that powers each feature. Paths are workspace‑relative.

## App Shell & Bootstrapping

| Feature | Key Files | Notes |
| --- | --- | --- |
| Vite entry + globals | `index.html`, `index.tsx`, `App.tsx`, `index.css`, `vite.config.ts` | App shell, build-time env wiring, global UI layout. |
| Environment + API boot | `lib/supabase.ts`, `services/archive.ts`, `services/ai.ts`, `lib/aiSettings.ts` | Supabase client + OpenRouter-backed AI calls used by profile inputs, with central Supabase-backed admin AI settings plus env fallback. |
| Types & shared domain | `types.ts` | Source of truth for persons, relationships, events, DNA tests/matches, and admin DTOs. |

## Authentication & Administration

| Feature | Key Files | Notes |
| --- | --- | --- |
| Super admin auth modal | `components/AuthModal.tsx`, `App.tsx` | Local super-admin login state, first-use credentials flow, session restore. |
| Admin page tabs | `components/admin/AdminSectionTabs.tsx`, `App.tsx` | Top-level admin sub-panels: Database, Trees, GEDCOM, DNA. |
| Database panel + reset modal | `components/admin/AdminDatabasePanel.tsx`, `components/admin/AdminNukeModal.tsx`, `services/ai.ts`, `lib/aiSettings.ts`, `supabase/migrations/20260328140000_admin_ai_settings.sql` | Shows maintenance actions, central AI settings, OpenRouter connection testing, and layout audit history; launches destructive reset flow. |
| Trees panel | `components/AdminTreesPanel.tsx`, `services/archive.ts` (`createFamilyTree`, `updateTreeSettings`, `deleteFamilyTreeRecord`, `listFamilyTreesWithCounts`) | Tree CRUD, visibility, default proband, owner metadata, counts. |
| GEDCOM panel | `components/admin/AdminGedcomPanel.tsx`, `components/ImportExport.tsx`, `lib/gedcomTokenizer.ts`, `lib/gedcomParser.ts`, `services/archive.ts` (`importGedcomToSupabase`) | GEDCOM import (5.x **and** 7.x) / export (7.0 only). `lib/gedcomTokenizer.ts` = line grammar (BOM, CONC/CONT, version); `lib/gedcomParser.ts` = pure `parseGedcom` + `serializeGedcom`; component handles UI + Blob download; `archive.ts` persists. |
| DNA admin panel | `components/AdminDnaPanel.tsx`, `services/archive.ts` (`listAutosomalPeopleInTree`, `listSharedMatchesForAutosomalPerson`, `resolveShared*Lineage`) | Shared autosomal review and lineage-path resolution across a tree. |
| Books panel (AI) | `components/admin/BookComposerPanel.tsx`, `components/book/BookDocument.tsx`, `components/book/BookPrintOverlay.tsx`, `lib/bookComposer.ts`, `lib/bookI18n.ts`, `services/books.ts`, `services/ai.ts` (`composeFamilyOverview`, `composePersonBiography`), `supabase/migrations/20260620180000_family_books.sql` | Compose AI-written family-history books (scope/style/length/language — Danish default + Swedish/Norwegian/English), persist to `family_books`, preview + export to PDF via `window.print()` (scoped `@media print` in `index.css`). `bookI18n.ts` localizes chrome + deterministic fallbacks; deterministic per-chapter fallback so a book generates with no API key. |
| Per-person biographies (story store) | `supabase/migrations/20260621120000_person_biographies.sql`, `lib/bookComposer.ts` (`personBiographySignature`), `services/books.ts` (`composeBook` reuse, `listPersonBiographies`/`getPersonBiography`/`upsertPersonBiography`), `components/person-profile/StoryTab.tsx` | Biographies persisted per person+language in `person_biographies`; `composeBook` reuses unchanged chapters (signature match) and regenerates only changed people, persisting back. Story tab reads the stored bio per language + AI Generate/Rewrite. |

## Genealogy Experience

| Feature | Key Files | Notes |
| --- | --- | --- |
| Interactive pedigree tree | `components/InteractiveTree/PedigreeTree.tsx`, `lib/pedigreeScope.ts`, `App.tsx` | On-demand pedigree rendering with ancestor/descendant expansion, placeholder parent cards, bottom toolbar controls. |
| ~~Legacy force graph~~ | ~~`components/FamilyTree.tsx`~~ | **Removed 2026-06-26** (roadmap B) — was unreachable (`layoutType` had no setter); confidence edge encoding ported into the pedigree view first. |
| Person profile modal | `components/PersonProfile.tsx`, `components/person-profile/*` | Tabbed profile surface (`VitalTab`, `FamilyTab`, `StoryTab`, `SourcesTab`, `MediaTab`, `DNATab`, `NotesTab`), including cause-of-death normalization in the Vital tab. `SourcesTab` models tree-wide reusable sources (one source → many event citations) with Cite Existing + merge-duplicates, an openable+editable source URL, and AI Transcribe (vision transcription of an uploaded record-page image). |
| Family layout persistence | `components/person-profile/FamilyTab.tsx`, `services/archive.ts` (`persistFamilyLayout`, `fetchFamilyLayoutAudits`) | Drag/drop order and spouse assignment state saved to person metadata + audits. |
| Landing page + stats | `components/TreeLandingPage.tsx`, `services/archive.ts` (`fetchTreeStatistics`, widgets fetchers) | Active tree hero, benchmark cards, public stats, highlights modules. |
| Search | `App.tsx`, `services/archive.ts` (`searchPersonsInTree`) | Enter-to-search modal flow with client filters and paged fetches. |

## DNA Features

| Feature | Key Files | Notes |
| --- | --- | --- |
| DNA tab imports | `components/person-profile/DNATab.tsx`, `lib/dnaRawParser.ts` | Imports autosomal raw CSV and shared segment CSV (MyHeritage + FTDNA comparison formats). |
| DNA lineage linking | `services/archive.ts` (`resolveSharedMatchLineage`, `resolveSharedTestLineage`) | Resolves tree paths, checks cM compatibility, annotates relationship metadata. |
| DNA admin review | `components/AdminDnaPanel.tsx` | Centralized panel to inspect and resolve shared matches per autosomal tester. |
| DNA docs | `docs/DNA_SETUP.md` | Operational guide, migration requirements, and expected behavior. |

## Data Layer & Migrations

| Feature | Key Files | Notes |
| --- | --- | --- |
| Supabase schema | `supabase/migrations/*.sql` | Authoritative DB model, RPCs, policies, indexes, DNA lineage functions. |
| Supabase CLI helpers | `docs/SUPABASE_SETUP.md` | Login/link/push workflow and remote migration habits. |
| OpenRouter AI integration | `docs/AI_SETUP.md`, `services/ai.ts`, `lib/aiSettings.ts`, `lib/placeParser.ts`, `lib/aiCache.ts`, `supabase/migrations/20260328140000_admin_ai_settings.sql` | Central Supabase-backed admin AI settings plus env fallback for biography, place parsing, and normalized cause-of-death. `placeParser.ts` = deterministic place fallback; `aiCache.ts` = bounded LRU memoizing place/cause results. |
| Pure logic + unit tests | `lib/dnaClassification.ts`, `lib/dnaRawParser.ts`, `lib/gedcomParser.ts`, `lib/placeParser.ts`, `lib/aiCache.ts`, `lib/lifespan.ts`, `lib/bookComposer.ts`, `lib/*.test.ts`, `vitest.config.ts` | Vitest unit tests (`npm test`, run by `npm run build`) for DNA parsing/classification, GEDCOM parsing, place parsing, the AI cache, living/deceased inference (`lifespan.ts`), and family-book planning (`bookComposer.ts`). |

## Documentation & Operations

| Topic | Location | Highlights |
| --- | --- | --- |
| Running locally / deploy | `README.md`, `docs/CICD.md` | Vercel build expectations, lint/typecheck requirements. |
| AI + Supabase setup | `docs/AI_SETUP.md`, `docs/SUPABASE_SETUP.md` | API keys, CLI login/auth flow, migration tips. |
| DNA setup | `docs/DNA_SETUP.md` | Supported imports, lineage resolution, shared-match storage model. |
| Content map (this file) | `docs/CONTENT_MAP.md` | Use as starting point when navigating the repository. |
| Project wiki (LLM knowledge base) | `wiki/index.md` | Architecture (Mermaid), schema, decisions, runbooks, integrations, roadmap — deeper "why" context for agents. |

> Tip: When adding new features, drop the relevant paths & notes into this map and link any new docs from `README.md` to keep navigation efficient (and token-friendly). 
