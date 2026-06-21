# Runbooks

Copy-pasteable operational procedures. Keep commands exact and current.

| Runbook | When |
| --- | --- |
| [build-test-deploy.md](build-test-deploy.md) | Before every handoff / PR; deploying to Vercel. |
| [supabase-migrations.md](supabase-migrations.md) | Changing the DB schema or RPCs. |
| [gedcom-import.md](gedcom-import.md) | Importing/exporting a `.ged` tree. |
| [dna-import-and-lineage.md](dna-import-and-lineage.md) | Importing DNA CSVs and resolving lineage. |

Prereqs for all: a working `.env.local` with `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, and
`OPENROUTER_API_KEY` (see [../../README.md](../../README.md), [../../docs/AI_SETUP.md](../../docs/AI_SETUP.md),
[../../docs/SUPABASE_SETUP.md](../../docs/SUPABASE_SETUP.md)).
