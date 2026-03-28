# AI Integration

Linegra now supports centrally managed AI provider settings, with OpenRouter
wired first. AI is currently used for biography generation, place parsing,
historical summaries, and normalizing free-text cause-of-death entries into a
cleaner modern phrasing plus a death category.

There are two configuration paths:

- Central admin settings in `Administrator -> Database -> AI Settings`
- Environment variables for local dev / Vercel fallback

The primary path is now the central Supabase-backed admin setting. The current
SPA still calls OpenRouter directly from the browser, so the API key is stored
centrally for operational consistency, not full secret isolation. True
server-side secrecy will require moving AI calls behind a backend or Supabase
Edge Function later.

## Administrator UI setup

Open the Administrator page, then go to `Database`.

Fill in:

- Provider: `OpenRouter`
- API key
- Model
- Base URL

Then use:

- `Save AI Settings` to store the config centrally in Supabase
- `Test Connection` to verify the OpenRouter endpoint

Those settings are used by:

- Cause-of-death normalization in the Vital tab
- Other OpenRouter-backed helpers in `services/ai.ts`

At present only the Linegra administrator should be allowed to configure or use
AI-assisted features. The UI enforces that model today. A later phase should
move this to real permission-backed enforcement via Supabase auth / roles.

## Environment fallback

Create/update `.env.local` (not checked in) with:

```
OPENROUTER_API_KEY=sk-or-...
VITE_OPENROUTER_API_KEY=$OPENROUTER_API_KEY  # optional if you prefer Vite-prefixed vars
```

For deployments (Vercel/etc.), add the same keys under project settings. The
code will honor central admin settings first, then fall back to environment
variables. It also honors `OPENROUTER_MODEL` /
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

## Schema / migration

Central AI settings are stored in:

- `public.ai_provider_settings`

Current RPCs:

- `admin_get_ai_settings_metadata()`
- `admin_get_ai_runtime_settings(payload_provider text default 'openrouter')`
- `admin_upsert_ai_settings(...)`

After pulling schema changes, apply them with:

```bash
supabase db push
```

## Headers

OpenRouter recommends sending `HTTP-Referer` + `X-Title`; the service includes
Linegra defaults, but update `services/ai.ts` if branding changes.
