// Roadmap N — server-side OpenRouter proxy (Edge Function, Deno).
//
// Why this exists: previously every OpenRouter call ran in the browser with the API key in the
// request headers (`Authorization: Bearer <key>`), so the key reached the client and could be
// exfiltrated. This function holds the key server-side and relays chat-completions requests on the
// client's behalf. The browser never sees the key.
//
// Contract: a thin relay. It accepts the SAME body shape the client used to send to OpenRouter
// (`{ model, messages, ...openrouterParams }`) plus a few control fields, injects the key, forwards
// the request, logs one row of usage to `ai_usage_logs`, and returns OpenRouter's JSON verbatim —
// so the client's existing parse logic (`extractAssistantText`, `JSON.parse`) is unchanged.
//
// Key source (DB-backed): the key is read from `ai_provider_settings` (provider='openrouter') via
// the auto-injected `SUPABASE_SERVICE_ROLE_KEY`. The admin "enter key in UI" / "Test Connection"
// flow is unchanged. For "Test Connection" the client sends `testKey`, which is used for a one-off
// ping and is never stored.
//
// Auth/abuse: Supabase's gateway requires the project `apikey` header on every invocation, so only
// this app can call it. There is NO per-user JWT check (the local admin has no real auth session —
// see roadmap A) and NO per-tree/day cap in this pass. Until roadmap A / the Phase 3 cap lands,
// treat that as the residual abuse surface. The key itself is never returned to the caller.

const SUPABASE_URL = (Deno.env.get("SUPABASE_URL") ?? "").replace(/\/$/, "");
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

const DEFAULT_BASE_URL = "https://openrouter.ai/api/v1";
const DEFAULT_TIMEOUT_MS = 30_000;
const MIN_TIMEOUT_MS = 1_000;
const MAX_TIMEOUT_MS = 120_000;

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

interface Json {
  [key: string]: unknown;
}

const json = (body: unknown, status = 200, extra: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders, ...extra },
  });

// Rough USD-per-1M-tokens price map for a few common paid models so the spend view has an estimate.
// The default model (nvidia/...:free) is free → 0. Unknown models → 0. This is an *estimate* only.
const PRICE_PER_MTOK: Record<string, { prompt: number; completion: number }> = {
  "openai/gpt-4o-mini": { prompt: 0.15, completion: 0.6 },
  "openai/gpt-4o": { prompt: 2.5, completion: 10 },
  "anthropic/claude-3.5-sonnet": { prompt: 3, completion: 15 },
  "google/gemini-flash-1.5": { prompt: 0.075, completion: 0.3 },
  "meta-llama/llama-3.1-70b-instruct": { prompt: 0.34, completion: 0.39 },
};

const estimateCost = (
  model: string | undefined,
  usage: { prompt_tokens?: number; completion_tokens?: number } | undefined,
): number => {
  if (!usage) return 0;
  const price = model ? PRICE_PER_MTOK[model.toLowerCase()] : undefined;
  if (!price) return 0;
  const prompt = Number(usage.prompt_tokens ?? 0) || 0;
  const completion = Number(usage.completion_tokens ?? 0) || 0;
  return (prompt * price.prompt + completion * price.completion) / 1_000_000;
};

interface ProviderSettings {
  api_key: string | null;
  model: string | null;
  base_url: string | null;
  enabled: boolean | null;
}

const readProviderSettings = async (): Promise<ProviderSettings | null> => {
  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) return null;
  const url =
    `${SUPABASE_URL}/rest/v1/ai_provider_settings` +
    `?provider=eq.openrouter&select=api_key,model,base_url,enabled&limit=1`;
  const resp = await fetch(url, {
    headers: {
      apikey: SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
    },
  });
  if (!resp.ok) return null;
  const rows = (await resp.json()) as ProviderSettings[];
  return rows?.[0] ?? null;
};

const logUsage = async (row: {
  treeId?: string | null;
  actorId?: string | null;
  purpose: string;
  model?: string | null;
  usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number } | null;
  cost: number;
  latencyMs: number;
  status: "ok" | "error";
  error?: string | null;
}) => {
  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) return;
  // FK on tree_id → family_trees(id) uuid; drop anything that isn't a UUID.
  const treeId =
    typeof row.treeId === "string" && UUID_RE.test(row.treeId) ? row.treeId : null;
  const payload: Json = {
    tree_id: treeId,
    actor_id: typeof row.actorId === "string" && row.actorId ? row.actorId : null,
    purpose: row.purpose || "unknown",
    model: row.model ?? null,
    prompt_tokens: row.usage?.prompt_tokens ?? null,
    completion_tokens: row.usage?.completion_tokens ?? null,
    total_tokens: row.usage?.total_tokens ?? null,
    cost_estimate: Number(row.cost.toFixed(6)),
    latency_ms: Math.round(row.latencyMs),
    status: row.status,
    error: row.error ?? null,
  };
  try {
    await fetch(`${SUPABASE_URL}/rest/v1/ai_usage_logs`, {
      method: "POST",
      headers: {
        apikey: SERVICE_ROLE_KEY,
        Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
        "Content-Type": "application/json",
        Prefer: "return=minimal",
      },
      body: JSON.stringify(payload),
    });
  } catch {
    // Logging is best-effort: never fail an AI request because the log write failed.
  }
};

const relay = async (
  apiKey: string,
  baseUrl: string,
  body: { model: string; messages: unknown; rest: Json },
  timeoutMs: number,
): Promise<{ status: number; json: Json | null; text: string }> => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const started = performance.now();
  try {
    const resp = await fetch(`${baseUrl.replace(/\/$/, "")}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
        "HTTP-Referer": "https://linegra.app",
        "X-Title": "Linegra Genealogy",
      },
      body: JSON.stringify({
        model: body.model,
        messages: body.messages,
        ...body.rest,
      }),
      signal: controller.signal,
    });
    const text = await resp.text();
    let parsed: Json | null = null;
    try {
      parsed = text ? (JSON.parse(text) as Json) : null;
    } catch {
      parsed = null;
    }
    return { status: resp.status, json: parsed, text };
  } finally {
    clearTimeout(timer);
    void started; // (latency measured by the caller around relay())
  }
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return json({ error: "Method not allowed" }, 405);
  }

  let body: Json;
  try {
    body = (await req.json()) as Json;
  } catch {
    return json({ error: "Invalid JSON body" }, 400);
  }

  const purpose = typeof body.purpose === "string" ? body.purpose : "unknown";
  const treeId = typeof body.treeId === "string" ? body.treeId : null;
  const actorId = typeof body.actorId === "string" ? body.actorId : null;
  const testKey = typeof body.testKey === "string" ? body.testKey.trim() : "";
  const requestedTimeout = Number(body.timeoutMs);
  const timeoutMs = Number.isFinite(requestedTimeout) && requestedTimeout > 0
    ? Math.min(Math.max(requestedTimeout, MIN_TIMEOUT_MS), MAX_TIMEOUT_MS)
    : DEFAULT_TIMEOUT_MS;

  const model = typeof body.model === "string" && body.model.trim()
    ? body.model.trim()
    : "";
  const messages = body.messages;

  // Strip control fields so only OpenRouter params are forwarded.
  const rest: Json = { ...body };
  for (const key of [
    "model",
    "messages",
    "purpose",
    "treeId",
    "actorId",
    "timeoutMs",
    "testKey",
    "baseUrl",
  ]) {
    delete rest[key];
  }

  // Resolve key + base URL.
  let apiKey = testKey;
  let baseUrl = typeof body.baseUrl === "string" && body.baseUrl.trim()
    ? body.baseUrl.trim()
    : DEFAULT_BASE_URL;
  let effectiveModel = model;

  if (!apiKey) {
    const settings = await readProviderSettings();
    apiKey = settings?.api_key?.trim() ?? "";
    if (!effectiveModel && settings?.model) effectiveModel = settings.model;
    if (settings?.base_url?.trim()) baseUrl = settings.base_url.trim();
    if (settings && settings.enabled === false) {
      await logUsage({
        treeId, actorId, purpose, model: effectiveModel || null,
        usage: null, cost: 0, latencyMs: 0, status: "error",
        error: "AI provider disabled",
      });
      return json({ error: "OpenRouter provider is disabled in settings." }, 503);
    }
  }

  if (!apiKey) {
    await logUsage({
      treeId, actorId, purpose, model: effectiveModel || null,
      usage: null, cost: 0, latencyMs: 0, status: "error",
      error: "API key not configured",
    });
    return json(
      { error: "OpenRouter API key is not configured. Set it in Administrator → Database." },
      503,
    );
  }
  if (!effectiveModel) {
    return json({ error: "No model specified." }, 400);
  }
  if (!Array.isArray(messages)) {
    return json({ error: "Missing messages array." }, 400);
  }

  const started = performance.now();
  const result = await relay(
    apiKey,
    baseUrl,
    { model: effectiveModel, messages, rest },
    timeoutMs,
  );
  const latencyMs = performance.now() - started;

  const ok = result.status >= 200 && result.status < 300;

  // Log + return. We await the log so the row reliably lands (Deno may drop fire-and-forget work
  // once the response is sent); logUsage swallows its own errors so this never breaks the response.
  await logUsage({
    treeId,
    actorId,
    purpose,
    model: effectiveModel,
    usage: (result.json?.usage as {
      prompt_tokens?: number;
      completion_tokens?: number;
      total_tokens?: number;
    } | undefined) ?? null,
    cost: estimateCost(effectiveModel, result.json?.usage as { prompt_tokens?: number; completion_tokens?: number } | undefined),
    latencyMs,
    status: ok ? "ok" : "error",
    error: ok ? null : `OpenRouter ${result.status}: ${result.text.slice(0, 500)}`,
  });

  if (!result.json) {
    return json(
      { error: `OpenRouter returned a non-JSON response (${result.status}).` },
      ok ? 200 : 502,
    );
  }

  // Return OpenRouter's JSON verbatim (client parses exactly as before). On upstream error, mirror
  // the status through so the client's error path runs and the deterministic fallback engages.
  return json(result.json, ok ? 200 : 502);
});
