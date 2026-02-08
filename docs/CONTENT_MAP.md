# Linegra Content Map

This catalog highlights the most relevant files for the current Linegra architecture so you can jump straight to the code that powers each feature. Paths are workspace‑relative.

## App Shell & Bootstrapping

| Feature | Key Files | Notes |
| --- | --- | --- |
| Vite entry + globals | `index.html`, `index.tsx`, `App.tsx`, `index.css` | Hosts the layout shell, router, and global providers. |
| Environment + API boot | `services/supabaseClient.ts`, `services/auth.ts` | Reads `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, `OPENROUTER_API_KEY` and prepares clients. |
| Types & shared data | `types.ts`, `lib/gedcom/*`, `lib/hooks/*` | Core domain types (persons, events, citations) and GEDCOM parsing helpers. |

## Authentication & Administration

| Feature | Key Files | Notes |
| --- | --- | --- |
| Super admin auth modal | `components/AuthModal.tsx`, `services/auth.ts` | Handles login/logout, bootstrap password rotation. |
| Administrator page (Database/Trees/GEDCOM) | `components/AdminTreesPanel.tsx`, `components/AdminGedcomPanel.tsx` (if present), `components/TreeLandingPage.tsx`, `services/admin.ts` | Controls tree CRUD, Supabase “nuke” actions, GEDCOM ingestion UI. |
| Tree selector + landing | `components/FamilyTree.tsx`, `components/TreeLandingPage.tsx`, `services/trees.ts` | Dropdown + stats for active tree, landing empty-state. |

## Genealogy Experience

| Feature | Key Files | Notes |
| --- | --- | --- |
| Interactive graph & search | `components/FamilyTree.tsx`, `components/ImportExport.tsx`, `services/graph.ts`, `services/search.ts` | Renders kinship map, handles GEDCOM import/export. |
| Person profile modal | `components/PersonProfile.tsx` (wrapper), child tabs under `components/person-profile/` | Each tab now has its own component (`VitalTab`, `FamilyTab`, `StoryTab`, `SourcesTab`, `MediaTab`, `DNATab`, `NotesTab`, plus shared `DetailEdit` + `constants`). |
| Family layout persistence | `components/person-profile/FamilyTab.tsx`, `services/layout.ts`, `supabase/migrations/*` | Drag-and-drop grouping, Supabase persistence of layout metadata. |
| Badge counts (notes/sources/media) | `components/person-profile/VitalTab.tsx`, `components/person-profile/SourcesTab.tsx`, `components/person-profile/MediaTab.tsx` | Shared badge logic triggered via props and callbacks from `PersonProfile`. |

## Data Layer & Migrations

| Feature | Key Files | Notes |
| --- | --- | --- |
| Supabase schema & seed | `supabase/migrations/*.sql`, `supabase/seed/*` | Latest relational model (persons, relationships, events, sources, notes, media, audit logs). |
| Supabase CLI helpers | `docs/SUPABASE_SETUP.md`, `package.json` scripts (`supabase:*`) | Login, link, migration commands. |
| OpenRouter AI integration | `docs/AI_SETUP.md`, `services/openRouter.ts` | Model selection (`nvidia/nemotron-nano-12b-v2-vl:free`) and API helpers. |

## Documentation & Operations

| Topic | Location | Highlights |
| --- | --- | --- |
| Running locally / deploy | `README.md`, `docs/CICD.md` | Vercel build expectations, lint/typecheck requirements. |
| AI + Supabase setup | `docs/AI_SETUP.md`, `docs/SUPABASE_SETUP.md` | API keys, CLI login/auth flow, migration tips. |
| Content map (this file) | `docs/CONTENT_MAP.md` | Use as starting point when navigating the repository. |

> Tip: When adding new features, drop the relevant paths & notes into this map and link any new docs from `README.md` to keep navigation efficient (and token-friendly). 
