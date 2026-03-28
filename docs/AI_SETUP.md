# AI Integration

Linegra now supports browser-configured AI providers, with OpenRouter wired
first. AI is currently used for biography generation, place parsing, historical
summaries, and normalizing free-text cause-of-death entries into a cleaner
modern phrasing plus a death category.

There are two configuration paths:

- Browser-local admin settings in `Administrator -> Database -> AI Settings`
- Environment variables for local dev / Vercel fallback

The browser-local setting is the current practical option for the SPA build.
It stores the provider config in local browser storage. That means it is not a
real secret-management solution; use a backend or Supabase Edge Function later
if the key must stay fully server-side.

## Administrator UI setup

Open the Administrator page, then go to `Database`.

Fill in:

- Provider: `OpenRouter`
- API key
- Model
- Base URL

Then use:

- `Save AI Settings` to store the config in this browser
- `Test Connection` to verify the OpenRouter endpoint

Those settings are used by:

- Cause-of-death normalization in the Vital tab
- Other OpenRouter-backed helpers in `services/gemini.ts`

## Environment fallback

Create/update `.env.local` (not checked in) with:

```
OPENROUTER_API_KEY=sk-or-...
VITE_OPENROUTER_API_KEY=$OPENROUTER_API_KEY  # optional if you prefer Vite-prefixed vars
```

For deployments (Vercel/etc.), add the same keys under project settings. The
code will honor browser-local admin settings first, then fall back to
environment variables. It also honors `OPENROUTER_MODEL` /
`VITE_OPENROUTER_MODEL` and `OPENROUTER_BASE_URL` overrides if you need to
swap models later. Defaults:

- Base URL: `https://openrouter.ai/api/v1`
- Model: `nvidia/nemotron-nano-12b-v2-vl:free`

## Optional overrides
To test other models or a proxy endpoint without code changes, set:

```
VITE_OPENROUTER_MODEL=<vendor/model>
VITE_OPENROUTER_BASE_URL=https://your-proxy.example.com/api/v1
```

(Remove the `VITE_` prefix if the variable is consumed server-side only.)

## Cause-of-death normalization

When AI is configured, the Vital tab Death Record section exposes:

- `Cause of Death` free-text entry
- `AI Normalize` action
- `Normalized Text` field
- `Death Category`

The save payload persists:

- `death_cause`
- `death_cause_category`
- `metadata.normalized_death_cause`

## Headers

OpenRouter recommends sending `HTTP-Referer` + `X-Title`; the service includes
Linegra defaults, but update `services/gemini.ts` if branding changes.
