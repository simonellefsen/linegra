# Decision: OpenRouter for AI utilities, centrally configured

**Decision.** AI text utilities use **OpenRouter** (single API, many models; default
`nvidia/nemotron-nano-12b-v2-vl:free`). Settings are stored in a **central Supabase-backed
admin record** with env-var fallback, and every AI feature must degrade gracefully without a
key.

## Why

- **Model flexibility without lock-in.** OpenRouter exposes many providers behind one
  OpenAI-compatible API; swapping models is a settings change, not a code change.
- **Free default tier.** Lets the feature work out-of-the-box for evaluation.
- **Central config.** A single admin record (tested from the Database panel) beats scattering
  keys; env remains a fallback for local/CI. See
  [../../lib/aiSettings.ts](../../lib/aiSettings.ts), `admin_*_ai_settings` RPCs.

## Rules

- **Graceful degradation.** `normalizeDeathCause` ships a deterministic fallback; new AI
  features should aim for the same (tracked in [../roadmap.md](../roadmap.md)).
- **Opt-in only.** AI never auto-mutates archive data without admin review.
- **Slug syntax:** a leading `~` in a model slug is a valid floating-alias — never strip it.

## Alternatives rejected

- **Direct single-provider SDK** (OpenAI/Anthropic only) — less model flexibility, harder to
  offer a free default.
- **No central settings (env-only)** — can't be managed/tested from the admin UI.

## Consequences

- All AI calls funnel through [../../services/ai.ts](../../services/ai.ts) with config from
  `lib/aiSettings.ts`. Add new utilities there, not ad-hoc.

Related: [../concepts/ai-assisted-normalization.md](../concepts/ai-assisted-normalization.md),
[../integrations/openrouter.md](../integrations/openrouter.md).
