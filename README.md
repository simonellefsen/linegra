# Linegra

This repo contains everything you need to run Linegra locally or deploy it to Vercel.

> Historical note: the very first UI mockups for Linegra were prototyped inside Google AI Studio; this repository now hosts the live codebase.

> Agentic dev flow: start with [`AGENT.md`](AGENT.md) for expectations, then use [docs/CONTENT_MAP.md](docs/CONTENT_MAP.md) to locate feature-specific files quickly.

## Run Locally

**Prerequisites:**  Node.js
  
> AI integration now uses OpenRouter. See `docs/AI_SETUP.md` for required `OPENROUTER_API_KEY` instructions before running locally or on CI.


1. Install dependencies:
   `npm install`
2. Create `.env.local` with `OPENROUTER_API_KEY`, `SUPABASE_URL`, and `SUPABASE_PUBLISHABLE_KEY` values (see `docs/AI_SETUP.md` + `docs/SUPABASE_SETUP.md`)
3. Run the app:
   `npm run dev`

> ⚠️ Linegra no longer ships with mock archives or an in-app Supabase connection form. You must provide valid `SUPABASE_URL` and `SUPABASE_PUBLISHABLE_KEY` values (as described in `docs/SUPABASE_SETUP.md`) before the UI will load.

## DNA Workflows

The DNA workflow (Autosomal + Shared Autosomal imports, lineage resolution, and admin review) is documented in:

- [`docs/DNA_SETUP.md`](docs/DNA_SETUP.md)

This includes supported CSV formats (MyHeritage and FTDNA segment comparison), how shared matches are linked, and how the Administrator DNA panel resolves lineage paths.

## Specification & Navigation

- Product/technical specification: [`SPEC.md`](SPEC.md)
- Agent/developer entrypoint: [`AGENT.md`](AGENT.md)
- Feature-to-file map: [`docs/CONTENT_MAP.md`](docs/CONTENT_MAP.md)
- LLM-optimized knowledge base (architecture, schema, decisions, runbooks): [`wiki/index.md`](wiki/index.md)

## Super Administrator Login

Linegra uses **Supabase Auth** (email + password). Sign in with the header **Login** button to edit trees you own or collaborate on. Public archives remain readable without an account.

- **First account** on a fresh database becomes the **super administrator** (`profiles.role = superadmin`) and can access the Database panel (NUKE, AI settings, usage).
- **Tree owners** can invite editors from **Administrator → Trees → Edit Settings → Collaborators**.
- **Legacy ownerless trees** can be claimed by a super administrator via **Claim ownership** on the Trees panel.

> **Local development:** run `supabase start`, apply migrations (`supabase db reset`), create an account via **Create one** in the login modal, then sign in. Email confirmation can be disabled in the local Supabase Auth settings for faster iteration.
