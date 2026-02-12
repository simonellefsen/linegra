# Linegra Product + Technical Specification

## 1. Overview

Linegra is a modern genealogy archive focused on:

- fast, public-first browsing
- administrator-controlled editing and curation
- robust GEDCOM import/export
- DNA-informed lineage verification

The product is designed to stay responsive on large trees and to keep all
authoritative data in Supabase.

## 2. Stack

- Frontend: React + TypeScript + Vite
- Styling: Tailwind CSS
- Icons: Lucide React
- Data/API: Supabase PostgREST + RPC + RLS
- AI utilities: OpenRouter (`nvidia/nemotron-nano-12b-v2-vl:free` by default)

## 3. Core Experience

### 3.1 App shell and tree selection
- The app boots only when `SUPABASE_URL` and `SUPABASE_PUBLISHABLE_KEY` are configured.
- Active tree is selected from the left dropdown.
- Public users can browse public trees; admin users can create/manage trees.

### 3.2 Portal (landing)
- Active tree card + “Explore Tree” entry into interactive pedigree.
- Public stats and benchmark cards (population, sex split, lifespan, etc.).
- Highlights modules:
  - What’s New
  - This Month
  - Most Wanted
  - Random Media

### 3.3 Interactive tree
- Primary tree surface is pedigree-style (incremental load, not full-force graph).
- Node cards support:
  - profile open
  - ancestor/descendant expansion cues
  - DNA support badge counts
- Admin-only affordances:
  - add missing father/mother placeholders
  - editing actions tied to permissions

### 3.4 Person profile (modal/panel)
- Tabbed architecture:
  - Vital
  - Family
  - Story
  - Sources
  - Media
  - DNA
  - Notes
- Save-on-change workflow with dirty-state protection.
- Public users cannot mutate profile fields.
- `Living` and `Private` flags govern visibility and access.

### 3.5 Administrator workspace
- Sub-panels:
  - Database
  - Trees
  - GEDCOM
  - DNA
- Database panel includes controlled “NUKE” reset flow.
- Trees panel includes create/edit/delete, visibility, default proband metadata.
- GEDCOM panel handles import/export with parse warnings.
- DNA panel supports autosomal match review and lineage-path resolution.

## 4. Data model (high-level)

Key entities:

- `family_trees`
- `persons`
- `relationships`
- `person_events`
- `sources`, `citations`, `notes`, `media_*`
- `dna_tests`, `dna_matches`
- `audit_logs`

Core rules:

- UUIDs are authoritative identifiers across entities.
- RLS is enabled for public tables and enforced through `can_read_tree` / `can_write_tree`-style checks.
- Writes are logged (directly or via RPC-triggered audit behavior).

## 5. GEDCOM requirements

Import must remain tolerant while preserving fidelity:

- support standard individual/family/event records
- capture ignored/unsupported tags in import warnings
- preserve source + citation context where available
- bind imported records to the selected tree

## 6. DNA requirements

### 6.1 Supported ingestion
- Autosomal raw CSV import
- Shared segment CSV import:
  - MyHeritage shared segments
  - FTDNA segment-comparison format

### 6.2 Shared-match linking
- UUID-first linking using `shared_person_id` and `shared_match_person_id`.
- Metadata UUID fallback for legacy rows.
- Name-based fallback only for historical/legacy imports without IDs.

### 6.3 Lineage resolution
- Admin DNA panel resolves shortest plausible lineage paths.
- Result stores:
  - path person ids
  - path relationship ids
  - cM compatibility outcome
- Relationship metadata is updated with DNA support markers.
- Resolved status must be visible in both admin DNA panel and profile DNA tab.

## 7. Performance requirements

- Snappy UI is a product requirement.
- Avoid full-tree hydration for default views.
- Use paged/targeted queries and RPC summaries.
- Expensive workflows (imports, lineage resolution, bulk maintenance) must show explicit progress/status feedback.

## 8. Security + permissions

- Anonymous browsing: read-only.
- Mutating actions require authenticated admin permissions.
- Private profiles are hidden from public search/profile views.
- RLS policies must not silently allow unrestricted writes in public schema tables.

## 9. Operational requirements

- Build gate: `npm run lint && npm run typecheck && npm run build`
- Schema changes require Supabase migrations in `supabase/migrations`.
- Docs must be updated with behavior changes (`README.md`, `docs/CONTENT_MAP.md`, feature-specific docs).
