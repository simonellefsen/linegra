# Integration: OpenRouter

OpenRouter backs all AI utilities via an OpenAI-compatible chat-completions API. Setup guide:
[../../docs/AI_SETUP.md](../../docs/AI_SETUP.md). Decision rationale:
[../decisions/openrouter-for-ai-utilities.md](../decisions/openrouter-for-ai-utilities.md).

## Config

- **Default model:** `nvidia/nemotron-nano-12b-v2-vl:free`.
- **Resolution order:** central Supabase admin record → env fallback. Managed in
  [../../lib/aiSettings.ts](../../lib/aiSettings.ts) via RPCs
  `admin_get_ai_runtime_settings`, `admin_get_ai_settings_metadata`, `admin_upsert_ai_settings`.
- **Env var:** `OPENROUTER_API_KEY` (see `.env.local`).
- **Test from UI:** the admin Database panel calls `testOpenRouterConnection` /
  `hasOpenRouterConfig` ([../../services/ai.ts](../../services/ai.ts)).

## Utilities (all in `services/ai.ts`)

| Function | Use |
| --- | --- |
| `generateBio` | Draft a biography from a person record. |
| `parsePlaceString` | Parse free-text place → structured fields. |
| `analyzeHistoricalEra` | Short historical context for (year, location). |
| `normalizeDeathCause` | Normalize raw cause-of-death → cause + category (**has deterministic fallback**). |
| `testOpenRouterConnection`, `hasOpenRouterConfig` | Connectivity / config checks. |

## Rules

- **Slug syntax:** a leading `~` in a model slug is valid floating-alias syntax — **never
  strip it**.
- **Degrade gracefully:** prefer a deterministic fallback (as `normalizeDeathCause` does);
  features that hard-depend on a key are flagged in [../roadmap.md](../roadmap.md).
- **Opt-in only:** no AI in the public read path; no auto-mutation of archive data.

Concept: [../concepts/ai-assisted-normalization.md](../concepts/ai-assisted-normalization.md).
