# Agent Guide

This repository supports agentic development workflows (Codex, CI bots, etc.). Use this doc as the canonical entry point before editing.

## 1. Start Here

1. **Read `README.md`** for environment setup, login credentials, and run instructions.  
2. **Skim `docs/CONTENT_MAP.md`** to jump directly to feature-specific files.  
3. **Check `docs/AI_SETUP.md`, `docs/SUPABASE_SETUP.md`, and `docs/DNA_SETUP.md`** for API keys, Supabase CLI linking, migration workflows, and DNA lineage operations.  
4. **Review open issues / user context** (AGENTS.md instructions, latest conversation) so you understand priorities.

## 2. Coding Workflow Expectations

- **Always lint, typecheck, and `npm run build`** before handing off (Vercel requires `npm run lint && npm run typecheck && vite build`).
- **Use Supabase + OpenRouter env vars** (`SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, `OPENROUTER_API_KEY`). Mock archives are removed, so missing envs will block the UI.
- **Schema-first mindset:** apply migrations via `supabase db push` (see `docs/SUPABASE_SETUP.md`) before shipping code that depends on new tables/functions.
- **Audit logging + RLS:** keep new mutations routed through Supabase RPCs/triggers so audit trails stay intact.

## 3. File Pointers (Quick Links)

| Area | Files |
| --- | --- |
| **App shell / entry** | `index.tsx`, `App.tsx`, `services/*` |
| **Person profile tabs** | `components/person-profile/*` (VitalTab, FamilyTab, etc.) |
| **Admin panels** | `components/admin/*`, `components/AdminTreesPanel.tsx`, `components/AdminDnaPanel.tsx`, `components/ImportExport.tsx` |
| **GEDCOM ingest / parsing** | `lib/gedcom/*`, `components/ImportExport.tsx`, `services/archive.ts` |
| **DNA ingest / lineage** | `components/person-profile/DNATab.tsx`, `components/AdminDnaPanel.tsx`, `lib/dnaRawParser.ts`, `services/archive.ts` |
| **Supabase schema** | `supabase/migrations/*.sql`, `supabase/seed/*` |
| **Docs overview** | `docs/CONTENT_MAP.md`, `docs/AI_SETUP.md`, `docs/SUPABASE_SETUP.md`, `docs/DNA_SETUP.md`, `docs/CICD.md` |

> When adding new subsystems (skills, automations, etc.), update both `docs/CONTENT_MAP.md` and this guide so future agents know exactly where to start.

## 4. Hand-off Checklist

- ✅ Lint + typecheck + build succeeded.  
- ✅ README / docs updated when behavior or setup changes.  
- ✅ New migrations applied and verified locally (`supabase db push`).  
- ✅ Tests or manual verification steps described in the final message.  
- ✅ Any large feature has a brief summary + next steps in the PR/hand-off note.

Stay within these guidelines to minimize token usage and duplicate work across agent hand-offs. 
