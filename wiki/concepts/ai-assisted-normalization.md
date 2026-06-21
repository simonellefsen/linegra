# Concept: AI-assisted normalization

AI in Linegra is a set of **discrete, opt-in text utilities** — not an agent and not in the
critical read path. Every AI feature must degrade gracefully when no key is configured.

## What AI is used for

| Utility | Function (`services/ai.ts`) | Input → Output |
| --- | --- | --- |
| Biography drafting | `generateBio` | Person record → prose bio draft |
| Place parsing | `parsePlaceString` | Free-text place → structured place fields |
| Historical era context | `analyzeHistoricalEra` | (year, location) → short context blurb |
| Cause-of-death normalization | `normalizeDeathCause` | Raw cause → normalized cause + category |
| Connection test | `testOpenRouterConnection`, `hasOpenRouterConfig` | Settings → reachability |

## Config resolution

Settings resolve from a **central Supabase-backed admin record first, then env fallback**
([../../lib/aiSettings.ts](../../lib/aiSettings.ts), RPCs `admin_get_ai_runtime_settings` /
`admin_upsert_ai_settings`). The default model is `nvidia/nemotron-nano-12b-v2-vl:free` via
**OpenRouter**. See [../integrations/openrouter.md](../integrations/openrouter.md) and
[../../docs/AI_SETUP.md](../../docs/AI_SETUP.md).

> OpenRouter model slugs: a leading `~` is valid **floating-alias** syntax — never strip it.

## Graceful degradation

- `normalizeDeathCause` has a **deterministic fallback** (rule table in `services/ai.ts`) so it
  works with no key — the AI path is an enhancement, not a dependency.
- `parsePlaceString` has a deterministic fallback
  ([../../lib/placeParser.ts](../../lib/placeParser.ts)): when AI is unconfigured/fails it returns a
  positionally-parsed structured place; when AI succeeds the two are merged (AI wins, deterministic
  backfills gaps). **Note:** the "AI Structure" button that called it was **removed from the UI**
  (2026-06-21) — it overlapped the input and produced unreliable output. The function + fallback
  remain in the service for programmatic reuse, but places are now structured **manually** via the
  PlaceInput "Details" fields (street/floor/apartment, sogn/herred/amt, etc.).
- `generateBio` / `analyzeHistoricalEra` still hard-depend on a key (they return a friendly
  error string otherwise) — deterministic fallbacks for those are a [../roadmap.md](../roadmap.md)
  follow-up.

## Caching

`parsePlaceString` and `normalizeDeathCause` results are memoized in a small bounded LRU
([../../lib/aiCache.ts](../../lib/aiCache.ts)) keyed by the input. Genealogy editing re-submits
the same place/cause repeatedly, so this cuts duplicate OpenRouter calls. The cache is
**in-memory and session-scoped** (cleared on reload); persisting to `localStorage` is a possible
future step.

## Principles

1. **Opt-in and admin-triggered** — never auto-mutate data from AI output without review.
2. **Deterministic-first where feasible** — prefer rules; use the model to fill gaps.
3. **No AI in the public read path** — keep browsing fast and key-free.
4. **Centralize settings** — one admin record, env as fallback, tested via the Database panel.

Related: [../decisions/openrouter-for-ai-utilities.md](../decisions/openrouter-for-ai-utilities.md).
