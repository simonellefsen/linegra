# Concept: LLM-maintained project wiki

This `wiki/` is the **primary context source for agents** working on Linegra. It exists so a
coding agent (or a returning human) can reach an accurate mental model of the system in a few
hops, without re-deriving it from scratch each session.

## Why it exists

- The codebase is small but dense: one SPA + Supabase migrations + RPC-heavy data layer. The
  "why" (RLS as the authz boundary, UUID-first DNA linking, public-first performance rules) is
  not obvious from any single file.
- Top-level docs (`SPEC.md`, `AGENT.md`, `docs/*`) describe the product and setup; this wiki
  adds **architecture, decisions, and operational memory** in an LLM-friendly shape.

## How it's maintained

- **LLM-maintained with human oversight.** When you change behavior, update the relevant page
  in the same change, add a [../log.md](../log.md) entry, and keep
  [../../docs/CONTENT_MAP.md](../../docs/CONTENT_MAP.md) in sync if navigation changed.
- **Accuracy over completeness.** Prefer fewer, true statements with file links over broad
  prose. If a doc and the code disagree, the code wins — fix the doc and note it in the log.
  (Example correction already logged: there is no `lib/gedcom/` module.)
- **Link liberally.** Every page should reach the hub ([../index.md](../index.md)) and its
  neighbors. Use workspace-relative links so they're clickable.

## Page taxonomy

- `concepts/` — durable mental models (this page, public-first, DNA verification, AI).
- `decisions/` — a choice + its rationale + alternatives rejected. Append, don't rewrite history.
- `integrations/` — how we talk to external systems (Supabase, OpenRouter, GEDCOM, DNA CSVs).
- `runbooks/` — copy-pasteable operational procedures.
- `sources/` — distilled external truth (specs, cM ranges) with provenance.
- `architecture.md` / `schema.md` / `log.md` / `roadmap.md` — system map, data model, history,
  next work.

## When to update vs. create

- **Update** an existing page if the fact belongs to its topic.
- **Create** a new decision page for a genuinely new architectural choice.
- Avoid duplicating what migrations/CLAUDE-style docs already record verbatim — link instead.
