# AI Integration (OpenRouter)

Linegra now calls OpenRouter for biography generation, place parsing, and
historical summaries. Configuration is environment-driven so Vite, local dev,
and Vercel builds all share the same variables.

## Required env vars
Create/update `.env.local` (not checked in) with:

```
OPENROUTER_API_KEY=sk-or-...
VITE_OPENROUTER_API_KEY=$OPENROUTER_API_KEY  # optional if you prefer Vite-prefixed vars
```

For deployments (Vercel/etc.), add the same keys under project settings. The
code will also honor `OPENROUTER_MODEL` / `VITE_OPENROUTER_MODEL` and
`OPENROUTER_BASE_URL` overrides if you need to swap models later. Defaults:

- Base URL: `https://openrouter.ai/api/v1`
- Model: `nvidia/nemotron-nano-12b-v2-vl:free`

## Optional overrides
To test other models or a proxy endpoint without code changes, set:

```
VITE_OPENROUTER_MODEL=<vendor/model>
VITE_OPENROUTER_BASE_URL=https://your-proxy.example.com/api/v1
```

(Remove the `VITE_` prefix if the variable is consumed server-side only.)

## Headers
OpenRouter recommends sending `HTTP-Referer` + `X-Title`; the service includes
Linegra defaults, but update `services/gemini.ts` if branding changes.
