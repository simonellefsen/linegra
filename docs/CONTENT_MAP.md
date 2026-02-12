# Linegra Content Map

This catalog highlights the most relevant files for the current Linegra architecture so you can jump straight to the code that powers each feature. Paths are workspace‑relative.

## App Shell & Bootstrapping

| Feature | Key Files | Notes |
| --- | --- | --- |
| Vite entry + globals | `index.html`, `index.tsx`, `App.tsx`, `index.css`, `vite.config.ts` | App shell, build-time env wiring, global UI layout. |
| Environment + API boot | `lib/supabase.ts`, `services/archive.ts`, `services/gemini.ts` | Supabase client + OpenRouter-backed AI calls used by profile inputs. |
| Types & shared domain | `types.ts` | Source of truth for persons, relationships, events, DNA tests/matches, and admin DTOs. |

## Authentication & Administration

| Feature | Key Files | Notes |
| --- | --- | --- |
| Super admin auth modal | `components/AuthModal.tsx`, `App.tsx` | Local super-admin login state, first-use credentials flow, session restore. |
| Admin page tabs | `components/admin/AdminSectionTabs.tsx`, `App.tsx` | Top-level admin sub-panels: Database, Trees, GEDCOM, DNA. |
| Database panel + reset modal | `components/admin/AdminDatabasePanel.tsx`, `components/admin/AdminNukeModal.tsx`, `services/archive.ts` (`nukeSupabaseDatabase`) | Shows maintenance actions and layout audit history; launches destructive reset flow. |
| Trees panel | `components/AdminTreesPanel.tsx`, `services/archive.ts` (`createFamilyTree`, `updateTreeSettings`, `deleteFamilyTreeRecord`, `listFamilyTreesWithCounts`) | Tree CRUD, visibility, default proband, owner metadata, counts. |
| GEDCOM panel | `components/admin/AdminGedcomPanel.tsx`, `components/ImportExport.tsx`, `lib/gedcom/*`, `services/archive.ts` (`importGedcomToSupabase`) | GEDCOM import/export and parser warnings. |
| DNA admin panel | `components/AdminDnaPanel.tsx`, `services/archive.ts` (`listAutosomalPeopleInTree`, `listSharedMatchesForAutosomalPerson`, `resolveShared*Lineage`) | Shared autosomal review and lineage-path resolution across a tree. |

## Genealogy Experience

| Feature | Key Files | Notes |
| --- | --- | --- |
| Interactive pedigree tree | `components/InteractiveTree/PedigreeTree.tsx`, `lib/pedigreeScope.ts`, `App.tsx` | On-demand pedigree rendering with ancestor/descendant expansion, placeholder parent cards, bottom toolbar controls. |
| Legacy force graph | `components/FamilyTree.tsx` | Older graph renderer retained for compatibility/testing. |
| Person profile modal | `components/PersonProfile.tsx`, `components/person-profile/*` | Tabbed profile surface (`VitalTab`, `FamilyTab`, `StoryTab`, `SourcesTab`, `MediaTab`, `DNATab`, `NotesTab`). |
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
| OpenRouter AI integration | `docs/AI_SETUP.md`, `services/gemini.ts` | Env-driven OpenRouter calls for biography + place parsing. |

## Documentation & Operations

| Topic | Location | Highlights |
| --- | --- | --- |
| Running locally / deploy | `README.md`, `docs/CICD.md` | Vercel build expectations, lint/typecheck requirements. |
| AI + Supabase setup | `docs/AI_SETUP.md`, `docs/SUPABASE_SETUP.md` | API keys, CLI login/auth flow, migration tips. |
| DNA setup | `docs/DNA_SETUP.md` | Supported imports, lineage resolution, shared-match storage model. |
| Content map (this file) | `docs/CONTENT_MAP.md` | Use as starting point when navigating the repository. |

> Tip: When adding new features, drop the relevant paths & notes into this map and link any new docs from `README.md` to keep navigation efficient (and token-friendly). 
