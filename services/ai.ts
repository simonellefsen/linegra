import { Person, StructuredPlace, DeathCauseCategory, BookChapterFacts, BookStatistics, BookGenerationOptions, BookStyle, BookLength } from "../types";
import { supabase } from "../lib/supabase";
import { deterministicParsePlace, mergeStructuredPlace } from "../lib/placeParser";
import { fullName } from "../lib/bookComposer";
import { bookStrings, languageName } from "../lib/bookI18n";
import { inferLivingStatus } from "../lib/lifespan";
import { BoundedCache } from "../lib/aiCache";
import {
  DEFAULT_OPENROUTER_BASE_URL,
  DEFAULT_OPENROUTER_MODEL,
  getCachedAISettings,
  getDefaultAISettings,
  getDefaultAISettingsMetadata,
  OpenRouterSettings,
  setCachedAISettings,
  StoredAISettings,
  StoredAISettingsMetadata,
} from "../lib/aiSettings";

type RuntimeEnv = Record<string, string | undefined>;

interface AISettingsMetadataRow {
  provider: string;
  enabled: boolean | null;
  model: string | null;
  base_url: string | null;
  has_api_key: boolean | null;
  updated_at: string | null;
  updated_by: string | null;
}

interface AIRuntimeSettingsRow {
  provider: string;
  enabled: boolean | null;
  api_key: string | null;
  model: string | null;
  base_url: string | null;
  updated_at: string | null;
  updated_by: string | null;
}

interface SaveAdminAISettingsInput {
  provider?: 'openrouter';
  enabled?: boolean;
  apiKey?: string;
  model?: string;
  baseUrl?: string;
  actorName?: string;
}

type RuntimeConfigOptions = {
  forceRefresh?: boolean;
  overrides?: Partial<OpenRouterSettings>;
  /** Abort the HTTP request after this many ms (defaults to DEFAULT_OPENROUTER_TIMEOUT_MS). */
  timeoutMs?: number;
};

// Hard cap so a slow/unreachable OpenRouter can never hang a request (and thus a UI spinner)
// forever — on timeout the call rejects and callers fall back (e.g. parsePlaceString → deterministic).
const DEFAULT_OPENROUTER_TIMEOUT_MS = 30000;

const fetchWithTimeout = async (
  url: string,
  init: Parameters<typeof fetch>[1],
  timeoutMs: number
): Promise<Response> => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } catch (err) {
    if (controller.signal.aborted) {
      throw new Error(`OpenRouter request timed out after ${timeoutMs}ms`);
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
};

const getRuntimeEnv = (): RuntimeEnv => {
  const envFromProcess = (globalThis as typeof globalThis & { process?: { env?: RuntimeEnv } }).process?.env ?? {};
  const envFromImport = (typeof import.meta !== 'undefined' && import.meta.env) ? (import.meta.env as RuntimeEnv) : {};
  return { ...envFromProcess, ...envFromImport };
};

const DEATH_CAUSE_CATEGORIES: DeathCauseCategory[] = [
  'Natural',
  'Disease',
  'Accident',
  'Suicide',
  'Homicide',
  'Military',
  'Legal Execution',
  'Other',
  'Unknown',
];

const normalizeProvider = (provider?: string | null): 'openrouter' => {
  return provider === 'openrouter' ? 'openrouter' : 'openrouter';
};

const coalesceNonEmpty = (...values: Array<string | null | undefined>) => {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) {
      return value;
    }
  }
  return '';
};

const buildEnvFallbackSettings = (overrides?: Partial<OpenRouterSettings>): StoredAISettings => {
  const env = getRuntimeEnv();
  const defaults = getDefaultAISettings();
  return {
    defaultProvider: 'openrouter',
    providers: {
      openrouter: {
        enabled: overrides?.enabled ?? defaults.providers.openrouter.enabled,
        apiKey:
          overrides?.apiKey ??
          env.VITE_OPENROUTER_API_KEY ??
          env.OPENROUTER_API_KEY ??
          '',
        model:
          overrides?.model ??
          env.VITE_OPENROUTER_MODEL ??
          env.OPENROUTER_MODEL ??
          DEFAULT_OPENROUTER_MODEL,
        baseUrl:
          overrides?.baseUrl ??
          env.VITE_OPENROUTER_BASE_URL ??
          env.OPENROUTER_BASE_URL ??
          DEFAULT_OPENROUTER_BASE_URL,
        updatedAt: null,
        updatedBy: null,
      },
    },
  };
};

const mapRuntimeRowToSettings = (row: AIRuntimeSettingsRow): StoredAISettings => ({
  defaultProvider: normalizeProvider(row.provider),
  providers: {
    openrouter: {
      enabled: row.enabled ?? true,
      apiKey: row.api_key ?? '',
      model: row.model ?? DEFAULT_OPENROUTER_MODEL,
      baseUrl: row.base_url ?? DEFAULT_OPENROUTER_BASE_URL,
      updatedAt: row.updated_at,
      updatedBy: row.updated_by,
    },
  },
});

const mapMetadataRows = (rows: AISettingsMetadataRow[] | null): StoredAISettingsMetadata => {
  const defaults = getDefaultAISettingsMetadata();
  const openrouter = rows?.find((row) => normalizeProvider(row.provider) === 'openrouter');
  if (!openrouter) return defaults;
  return {
    defaultProvider: 'openrouter',
    providers: {
      openrouter: {
        enabled: openrouter.enabled ?? defaults.providers.openrouter.enabled,
        model: openrouter.model ?? DEFAULT_OPENROUTER_MODEL,
        baseUrl: openrouter.base_url ?? DEFAULT_OPENROUTER_BASE_URL,
        hasApiKey: openrouter.has_api_key ?? false,
        updatedAt: openrouter.updated_at,
        updatedBy: openrouter.updated_by,
      },
    },
  };
};

let runtimeSettingsInflight: Promise<StoredAISettings> | null = null;

export const fetchAdminAISettingsMetadata = async (): Promise<StoredAISettingsMetadata> => {
  const { data, error } = await supabase.rpc('admin_get_ai_settings_metadata');
  if (error) {
    throw new Error(error.message);
  }
  return mapMetadataRows((data ?? []) as AISettingsMetadataRow[]);
};

export const fetchAdminAIRuntimeSettings = async (forceRefresh = false): Promise<StoredAISettings> => {
  if (!forceRefresh) {
    const cached = getCachedAISettings();
    if (cached.providers.openrouter.apiKey) {
      return cached;
    }
    if (runtimeSettingsInflight) {
      return runtimeSettingsInflight;
    }
  }

  runtimeSettingsInflight = (async () => {
    const { data, error } = await supabase.rpc('admin_get_ai_runtime_settings', {
      payload_provider: 'openrouter',
    });
    if (error) {
      throw new Error(error.message);
    }

    const row = Array.isArray(data) ? (data[0] as AIRuntimeSettingsRow | undefined) : undefined;
    const settings = row ? mapRuntimeRowToSettings(row) : buildEnvFallbackSettings();
    setCachedAISettings(settings);
    return settings;
  })();

  try {
    return await runtimeSettingsInflight;
  } finally {
    runtimeSettingsInflight = null;
  }
};

export const saveAdminAISettings = async ({
  provider = 'openrouter',
  enabled = true,
  apiKey,
  model,
  baseUrl,
  actorName,
}: SaveAdminAISettingsInput) => {
  const { data, error } = await supabase.rpc('admin_upsert_ai_settings', {
    payload_provider: provider,
    payload_enabled: enabled,
    payload_api_key: apiKey?.trim() || null,
    payload_model: model?.trim() || null,
    payload_base_url: baseUrl?.trim() || null,
    payload_actor_name: actorName?.trim() || 'System',
  });

  if (error) {
    throw new Error(error.message);
  }

  setCachedAISettings(null);
  await fetchAdminAIRuntimeSettings(true);
  return mapMetadataRows((data ?? []) as AISettingsMetadataRow[]);
};

const resolveOpenRouterConfig = async ({ forceRefresh = false, overrides }: RuntimeConfigOptions = {}) => {
  const fallback = buildEnvFallbackSettings(overrides);
  let centralSettings: StoredAISettings | null = null;

  try {
    centralSettings = await fetchAdminAIRuntimeSettings(forceRefresh);
  } catch {
    centralSettings = null;
  }

  const merged: OpenRouterSettings = {
    ...fallback.providers.openrouter,
    ...(centralSettings?.providers.openrouter ?? {}),
    ...(overrides ?? {}),
    enabled: overrides?.enabled ?? centralSettings?.providers.openrouter.enabled ?? fallback.providers.openrouter.enabled,
    apiKey: coalesceNonEmpty(
      overrides?.apiKey,
      centralSettings?.providers.openrouter.apiKey,
      fallback.providers.openrouter.apiKey
    ),
    model: coalesceNonEmpty(
      overrides?.model,
      centralSettings?.providers.openrouter.model,
      fallback.providers.openrouter.model
    ),
    baseUrl: coalesceNonEmpty(
      overrides?.baseUrl,
      centralSettings?.providers.openrouter.baseUrl,
      fallback.providers.openrouter.baseUrl
    ),
  };

  if (!merged.apiKey) {
    throw new Error('OpenRouter API key is missing. Configure it in Administrator -> Database.');
  }

  return merged;
};

interface TextContentPart { type: 'text'; text: string }
interface ImageContentPart { type: 'image_url'; image_url: { url: string } }
type ChatMessageContent = string | Array<TextContentPart | ImageContentPart>;

interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: ChatMessageContent;
}

interface ChatResponse {
  choices: Array<{
    message: {
      content?: string | null;
      refusal?: string | null;
      reasoning?: string | null;
      reasoning_details?: Array<{
        type?: string;
        text?: string | null;
      }> | null;
    };
  }>;
}

const extractAssistantText = (
  message: ChatResponse['choices'][number]['message'],
  options?: { allowReasoningFallback?: boolean }
) => {
  if (typeof message.content === 'string' && message.content.trim()) {
    return message.content.trim();
  }

  if (!options?.allowReasoningFallback) {
    return '';
  }

  const reasoningDetailText = (message.reasoning_details ?? [])
    .map((detail) => (typeof detail?.text === 'string' ? detail.text.trim() : ''))
    .filter(Boolean)
    .join('\n');

  if (reasoningDetailText) {
    return reasoningDetailText;
  }

  if (typeof message.reasoning === 'string' && message.reasoning.trim()) {
    return message.reasoning.trim();
  }

  return '';
};

const withRetry = async <T>(fn: () => Promise<T>, retries = 3): Promise<T> => {
  let delay = 1000;
  for (let i = 0; i < retries; i++) {
    try {
      return await fn();
    } catch (error) {
      if (i === retries - 1) throw error;
      await new Promise((resolve) => setTimeout(resolve, delay));
      delay *= 2;
    }
  }
  throw new Error("API call failed after retries");
};

const callOpenRouter = async (
  messages: ChatMessage[],
  extraBody: Record<string, unknown> = {},
  options?: RuntimeConfigOptions & { allowReasoningFallback?: boolean }
) => {
  const { apiKey, model, baseUrl } = await resolveOpenRouterConfig(options);
  const response = await fetchWithTimeout(
    `${baseUrl}/chat/completions`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
        'HTTP-Referer': 'https://linegra.app',
        'X-Title': 'Linegra Genealogy'
      },
      body: JSON.stringify({
        model,
        messages,
        ...extraBody
      })
    },
    options?.timeoutMs ?? DEFAULT_OPENROUTER_TIMEOUT_MS
  );

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`OpenRouter request failed: ${response.status} ${detail}`);
  }

  const data: ChatResponse = await response.json();
  return extractAssistantText(data.choices[0]?.message ?? {}, {
    allowReasoningFallback: options?.allowReasoningFallback,
  });
};

const callOpenRouterRaw = async (
  messages: ChatMessage[],
  extraBody: Record<string, unknown> = {},
  options?: RuntimeConfigOptions
) => {
  const { apiKey, model, baseUrl } = await resolveOpenRouterConfig(options);
  const response = await fetchWithTimeout(
    `${baseUrl}/chat/completions`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
        'HTTP-Referer': 'https://linegra.app',
        'X-Title': 'Linegra Genealogy'
      },
      body: JSON.stringify({
        model,
        messages,
        ...extraBody
      })
    },
    options?.timeoutMs ?? DEFAULT_OPENROUTER_TIMEOUT_MS
  );

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`OpenRouter request failed: ${response.status} ${detail}`);
  }

  return response.json() as Promise<ChatResponse>;
};

export const generateBio = async (person: Person): Promise<string> => {
  const birthLoc = typeof person.birthPlace === 'string' ? person.birthPlace : person.birthPlace?.fullText;
  const deathLoc = typeof person.deathPlace === 'string' ? person.deathPlace : person.deathPlace?.fullText;
  const residenceDeath = typeof person.residenceAtDeath === 'string' ? person.residenceAtDeath : person.residenceAtDeath?.fullText;

  const prompt = `
    Write a warm, professional, and slightly narrative biography for a family tree record.
    Name: ${person.firstName} ${person.lastName} ${person.maidenName ? `(née ${person.maidenName})` : ''}
    Born: ${person.birthDate || 'Unknown date'} in ${birthLoc || 'Unknown location'}
    Died: ${person.deathDate || 'Present'} ${deathLoc ? `in ${deathLoc}` : ''}
    ${person.deathCause ? `Cause of Death: ${person.deathCause}` : ''}
    ${person.deathCauseCategory ? `Death Category: ${person.deathCauseCategory}` : ''}
    ${residenceDeath ? `Residence at time of death: ${residenceDeath}` : ''}
    Occupations: ${person.occupations?.join(', ') || 'Unknown'}
    Existing bio snippet: ${person.bio || 'None'}
    
    Please provide a concise 3-paragraph story including historical context of the era they lived in.
  `;

  try {
    return await withRetry(() =>
      callOpenRouter([
        { role: 'system', content: 'You are a careful historical biographer for a genealogy product.' },
        { role: 'user', content: prompt }
      ])
    ) || "Could not generate biography.";
  } catch (error) {
    console.error("OpenRouter Bio Error:", error);
    return "Error generating AI biography. Please try again later.";
  }
};

const placeCache = new BoundedCache<Partial<StructuredPlace>>();

export const parsePlaceString = async (input: string): Promise<Partial<StructuredPlace>> => {
  const trimmed = input.trim();
  if (!trimmed) return { fullText: '' };

  const cached = placeCache.get(trimmed);
  if (cached) return cached;

  // Deterministic baseline so the feature works (and backfills gaps) even when
  // OpenRouter is unconfigured or fails.
  const deterministic = deterministicParsePlace(trimmed);

  const schema = {
    name: 'StructuredPlace',
    schema: {
      type: 'object',
      properties: {
        street: { type: 'string' },
        houseNumber: { type: 'string' },
        floor: { type: 'string' },
        apartment: { type: 'string' },
        placeName: { type: 'string' },
        city: { type: 'string' },
        parish: { type: 'string' },
        hundred: { type: 'string' },
        county: { type: 'string' },
        state: { type: 'string' },
        country: { type: 'string' },
        notes: { type: 'string' },
        fullText: { type: 'string' }
      },
      required: ['fullText']
    }
  };

  try {
    // Interactive call: fail fast (single attempt, short timeout) so a slow/unreachable
    // OpenRouter falls back to the deterministic parse quickly instead of spinning.
    const content = await withRetry(
      () =>
        callOpenRouter(
          [
            {
              role: 'system',
              content: [
                'You extract structured place data for genealogists. Return JSON matching the schema.',
                'Recognize the Scandinavian administrative hierarchy and place each segment correctly:',
                'street = gade/vej (road); houseNumber = husnr.; floor = sal/etage (Danish: kælder, stue, 1. sal, 2. sal); apartment = lejlighed (incl. old-style baggård/baghus and door codes);',
                'placeName = stednavn (neighborhood/landmark/farm); city = by (town); parish = sogn (church parish — the key unit for records);',
                'hundred = herred/kommune (judicial district / municipality); county = amt (county); state = region (modern region); country = land.',
                'Leave a field empty (omit) rather than guess. Always echo the original text in fullText.'
              ].join(' ')
            },
            {
              role: 'user',
              content: `Parse this location into structured components: "${trimmed}"`
            }
          ],
          {
            response_format: {
              type: 'json_schema',
              json_schema: schema
            },
            timeoutMs: 15000
          }
        ),
      1
    );
    const ai = JSON.parse(content || '{}') as Partial<StructuredPlace>;
    // AI wins where it has values; deterministic baseline backfills any gaps.
    const merged = mergeStructuredPlace(deterministic, ai, trimmed);
    placeCache.set(trimmed, merged);
    return merged;
  } catch (error) {
    console.error("OpenRouter Place Parse Error:", error);
    placeCache.set(trimmed, deterministic);
    return deterministic;
  }
};

export const analyzeHistoricalEra = async (year: string, location: string): Promise<string> => {
  const prompt = `Tell me about life in ${location} around the year ${year}. Focus on family life, common occupations, and major events that would have affected a local family.`;

  try {
    return await withRetry(() =>
      callOpenRouter([
        { role: 'system', content: 'You provide concise historical summaries relevant to genealogists.' },
        { role: 'user', content: prompt }
      ])
    ) || "No historical context found.";
  } catch (error) {
    console.error("OpenRouter Historical Era Error:", error);
    return "Failed to fetch historical context.";
  }
};

export const hasOpenRouterConfig = async (forceRefresh = false) => {
  try {
    const config = await resolveOpenRouterConfig({ forceRefresh });
    return Boolean(config.enabled && config.apiKey && config.model && config.baseUrl);
  } catch {
    return false;
  }
};

export const testOpenRouterConnection = async (overrides?: Partial<OpenRouterSettings>) => {
  const data = await withRetry(() =>
    callOpenRouterRaw(
      [
        { role: 'system', content: 'You validate API connectivity for a genealogy application.' },
        { role: 'user', content: 'Reply with exactly: OPENROUTER_OK' }
      ],
      { max_tokens: 128, temperature: 0 },
      { forceRefresh: true, overrides }
    )
  );

  const firstMessage = data.choices[0]?.message ?? {};
  const extracted = extractAssistantText(firstMessage, { allowReasoningFallback: true });

  if (extracted.includes('OPENROUTER_OK')) {
    return 'OPENROUTER_OK';
  }

  const rawJson = JSON.stringify(firstMessage);
  if (rawJson.includes('OPENROUTER_OK')) {
    return 'OPENROUTER_OK';
  }

  if (Array.isArray(data.choices) && data.choices.length > 0 && !firstMessage.refusal) {
    return 'OPENROUTER_OK';
  }

  throw new Error('Unexpected AI response while testing the OpenRouter connection.');
};

interface NormalizedDeathCauseResult {
  normalizedCause: string;
  category: DeathCauseCategory;
}

type DeathCauseNormalizationRule = {
  pattern: RegExp;
  normalized: string;
  category: DeathCauseCategory;
  priority?: number;
};

const DEATH_CAUSE_RULES: DeathCauseNormalizationRule[] = [
  { pattern: /\bphthisis pulmonum\b|\bphthisis\b/i, normalized: 'Pulmonary tuberculosis', category: 'Disease', priority: 100 },
  { pattern: /\bhaemoptysis\b|\bhemoptysis\b|\bhaemophthisis\b/i, normalized: 'Coughing up blood (hemoptysis)', category: 'Disease', priority: 80 },
  { pattern: /\bapoplex(?:ia|y)\b/i, normalized: 'Stroke', category: 'Disease', priority: 90 },
  { pattern: /\bmorbus cordis\b/i, normalized: 'Heart disease', category: 'Disease', priority: 90 },
  { pattern: /\bbarselsfeber\b/i, normalized: 'Postpartum infection', category: 'Disease', priority: 90 },
  { pattern: /\bconsumption\b/i, normalized: 'Tuberculosis', category: 'Disease', priority: 85 },
];

const normalizeComparableText = (value: string) =>
  value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/gi, ' ')
    .trim()
    .toLowerCase();

const deterministicNormalizeDeathCause = (rawCause: string): NormalizedDeathCauseResult => {
  const matches = DEATH_CAUSE_RULES
    .filter((rule) => rule.pattern.test(rawCause))
    .sort((left, right) => (right.priority ?? 0) - (left.priority ?? 0));

  if (matches.length === 0) {
    return {
      normalizedCause: rawCause.trim(),
      category: 'Unknown',
    };
  }

  const includesTuberculosis = matches.some((rule) => /tuberculosis/i.test(rule.normalized));
  const includesHemoptysis = matches.some((rule) => /hemoptysis/i.test(rule.normalized));

  if (includesTuberculosis && includesHemoptysis) {
    return {
      normalizedCause: 'Pulmonary tuberculosis with coughing up blood',
      category: 'Disease',
    };
  }

  return {
    normalizedCause: matches[0].normalized,
    category: matches[0].category,
  };
};

const deathCauseCache = new BoundedCache<NormalizedDeathCauseResult>();

export const normalizeDeathCause = async (rawCause: string): Promise<NormalizedDeathCauseResult> => {
  if (!rawCause.trim()) {
    return { normalizedCause: '', category: 'Unknown' };
  }

  const cacheKey = rawCause.trim().toLowerCase();
  const cached = deathCauseCache.get(cacheKey);
  if (cached) return cached;

  const result = await computeNormalizedDeathCause(rawCause);
  deathCauseCache.set(cacheKey, result);
  return result;
};

const computeNormalizedDeathCause = async (rawCause: string): Promise<NormalizedDeathCauseResult> => {
  const deterministic = deterministicNormalizeDeathCause(rawCause);

  const schema = {
    name: 'NormalizedDeathCause',
    schema: {
      type: 'object',
      properties: {
        normalizedCause: { type: 'string' },
        category: { type: 'string', enum: DEATH_CAUSE_CATEGORIES }
      },
      required: ['normalizedCause', 'category']
    }
  };

  const content = await withRetry(() =>
    callOpenRouter(
      [
        {
          role: 'system',
          content: [
            'You normalize historical causes of death for genealogy records.',
            'Your job is to interpret archaic, Latin, variant-spelled, or composite medical phrases and rewrite them as concise modern plain-English causes of death.',
            'Do not simply repeat the input unless it is already a clear modern diagnosis.',
            'Prefer the underlying disease or condition over a symptom when both are present.',
            'If the text lists both a symptom and a disease, normalize to the disease and optionally mention the symptom only if it adds meaning.',
            'Examples:',
            '- "Phthisis pulmonum" -> "Pulmonary tuberculosis"',
            '- "Haemoptysis, Phthisis pulmonum" -> "Pulmonary tuberculosis with coughing up blood"',
            '- "Apoplexia" -> "Stroke"',
            '- "Morbus cordis" -> "Heart disease"',
            '- "Barselsfeber" -> "Postpartum infection"',
            'Return JSON matching the schema with:',
            '- normalizedCause: a concise modern phrase',
            '- category: one of Natural, Disease, Accident, Suicide, Homicide, Military, Legal Execution, Other, Unknown',
            'If unsure, make the best medical/historical interpretation and keep uncertainty brief inside normalizedCause.'
          ].join(' ')
        },
        {
          role: 'user',
          content: `Normalize this cause of death for a genealogy record into modern plain English. Input: "${rawCause}". Do not echo the wording unchanged unless it is already modern and specific. Preserve uncertainty if present.`
        }
      ],
      {
        response_format: {
          type: 'json_schema',
          json_schema: schema
        },
        temperature: 0.1,
        max_tokens: 180
      }
    )
  );

  const parsed = JSON.parse(content || '{}') as Partial<NormalizedDeathCauseResult>;
  const aiNormalizedCause =
    typeof parsed.normalizedCause === 'string' && parsed.normalizedCause.trim()
      ? parsed.normalizedCause.trim()
      : rawCause.trim();
  const aiCategory =
    typeof parsed.category === 'string' && DEATH_CAUSE_CATEGORIES.includes(parsed.category as DeathCauseCategory)
      ? (parsed.category as DeathCauseCategory)
      : 'Unknown';

  const aiEchoedInput =
    normalizeComparableText(aiNormalizedCause) === normalizeComparableText(rawCause.trim());

  if (
    aiEchoedInput &&
    normalizeComparableText(deterministic.normalizedCause) !== normalizeComparableText(rawCause.trim())
  ) {
    return deterministic;
  }

  if (
    aiCategory === 'Unknown' &&
    deterministic.category !== 'Unknown' &&
    normalizeComparableText(deterministic.normalizedCause) !== normalizeComparableText(rawCause.trim())
  ) {
    return {
      normalizedCause: aiNormalizedCause,
      category: deterministic.category,
    };
  }

  return {
    normalizedCause: aiNormalizedCause,
    category: aiCategory,
  };
};

interface RecordTranscriptionHints {
  recordType?: string;
  personName?: string;
  eventLabel?: string;
}

/**
 * Transcribe a scanned record page (e.g. a Nordic parish register) via a vision-capable model.
 * The image arrives as a base64 data URL (the caller downscales it client-side), so there are no
 * cross-origin fetch issues. The prompt asks for a faithful, line-by-line transcription in the
 * original language — no translation, modernization, or invention — with `[illegible]` markers.
 * Throws with a helpful message if the model can't handle images.
 */
export const transcribeRecordImage = async (
  imageDataUrl: string,
  hints?: RecordTranscriptionHints
): Promise<string> => {
  const hintLines = [
    hints?.recordType ? `Record type: ${hints.recordType}` : null,
    hints?.personName ? `Person of interest: ${hints.personName}` : null,
    hints?.eventLabel ? `Relevant event: ${hints.eventLabel}` : null,
  ].filter(Boolean).join('\n');

  const instruction = [
    'Transcribe this record page faithfully and line by line in its original language.',
    'Preserve names, dates, places, and archaic spelling exactly as written.',
    'Use [illegible] for any word you cannot read. Do not translate, modernize, summarize, or invent content.',
    hintLines ? `\nContext (use only to orient yourself; transcribe only what is actually written):\n${hintLines}` : '',
  ].join(' ');

  try {
    const text = await withRetry(
      () =>
        callOpenRouter(
          [
            {
              role: 'system',
              content: [
                'You are an expert paleographer transcribing historical Nordic parish register pages (Danish, Norwegian, Swedish) which may also contain Latin.',
                'The handwriting is often 18th–19th century gothic cursive or kurrent script.',
                'Transcribe the text exactly as written: preserve the original language, archaic spelling, abbreviations, names, dates, and places, and keep the original line structure.',
                'Mark any genuinely illegible word as [illegible]. Do not translate, summarize, modernize, or invent content.',
                'Output only the transcription.',
              ].join(' '),
            },
            {
              role: 'user',
              content: [
                { type: 'text', text: instruction },
                { type: 'image_url', image_url: { url: imageDataUrl } },
              ],
            },
          ],
          { temperature: 0.1, max_tokens: 1600 },
          { timeoutMs: 60000 }
        ),
      1
    );
    const trimmed = (text || '').trim();
    if (!trimmed) {
      throw new Error('The model returned an empty transcription.');
    }
    return trimmed;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const visionHint = /image|vision|multimodal|modal|unsupported/i.test(message)
      ? ' This model may not support images — set a vision-capable model (a name ending in -vl) in Administrator → Database.'
      : '';
    throw new Error(`Could not transcribe the image.${visionHint} (${message})`);
  }
};

// ── Family Book composers ────────────────────────────────────────────────────
//
// Narrative generation for AI family-history books (and the profile StoryTab). Each composer
// tries OpenRouter and falls back to a deterministic, fact-anchored builder on any failure or
// missing key — so a full book can always be produced. The deterministic builders are exported
// (pure) so they are unit-tested directly without the network.

const LENGTH_PARAGRAPHS: Record<BookLength, number> = { short: 2, medium: 4, long: 6 };
const LENGTH_MAX_TOKENS: Record<BookLength, number> = { short: 420, medium: 820, long: 1300 };

const STYLE_INSTRUCTION: Record<BookStyle, string> = {
  narrative: 'warm, engaging narrative prose that reads like a family chronicle',
  concise: 'concise, factual prose focused on the key life events',
  scholarly: 'measured, evidence-minded prose that distinguishes documented facts from plausible historical context',
};

const joinList = (items?: string[]): string => (items || []).filter(Boolean).join(', ');

/**
 * Deterministic, fabricate-nothing historical context for one person. States the era and frames the
 * kind of change a family of that place/time/occupation would have experienced, without inventing
 * specific events or names. The AI path enriches this with concrete history. Localized by `language`.
 */
export const deterministicHistoricalContext = (
  facts: BookChapterFacts,
  language: BookGenerationOptions['language']
): string => {
  const s = bookStrings(language);
  const by = facts.birthYear ?? null;
  const dy = facts.deathYear ?? null;
  const anchor = by ?? dy;
  const era = anchor ? s.eraLabel(anchor) : s.hist.spanEra('').replace(/\s+/g, ' ').trim();
  const place = facts.birthPlace || facts.deathPlace || '';
  const occupation = facts.occupations?.[0];
  const spanClause = by != null && dy != null && dy > by ? s.hist.spanYears(dy - by, era) : s.hist.spanEra(era);
  const occupationClause = occupation ? s.hist.occupation(occupation) : '';
  const placeClause = place ? place : '';
  return `${spanClause}${s.hist.witness(placeClause)}${occupationClause}`.trim();
};

/**
 * Deterministic person biography assembled strictly from the structured facts. Honest about gaps
 * ("not recorded") and tuned by length/style. Used as the fallback when OpenRouter is unavailable.
 * Localized by `options.language`.
 */
export const deterministicPersonBiography = (
  person: Person,
  facts: BookChapterFacts,
  options: BookGenerationOptions
): string => {
  const name = fullName(person);
  const b = bookStrings(options.language).bio;
  const paragraphs: string[] = [];

  // Origins + historical context
  const parents = facts.parentNames?.length ? joinList(facts.parentNames) : '';
  paragraphs.push(`${b.born(name, facts.birthYear ? String(facts.birthYear) : null, facts.birthPlace || '', parents)} ${deterministicHistoricalContext(facts, options.language)}`);

  // Family + working life. Spouses (formal marriages) and partners (unmarried, cohabiting) are
  // worded differently so a cohabiting couple is never described as having married.
  const lifeBits: string[] = [];
  if (facts.spouseNames?.length) lifeBits.push(b.married(joinList(facts.spouseNames)));
  if (facts.partnerNames?.length) lifeBits.push(b.partner(joinList(facts.partnerNames)));
  if (facts.childNames?.length) {
    const shown = facts.childNames.length <= 4 ? joinList(facts.childNames) : '';
    lifeBits.push(b.raised(facts.childNames.length, shown));
  }
  if (facts.occupations?.length) lifeBits.push(b.workedAs(joinList(facts.occupations)));
  if (lifeBits.length) {
    paragraphs.push(`${name} ${lifeBits.join(', ')}.`);
  } else {
    paragraphs.push(b.fewRecords(name));
  }

  // Death (medium + long). Never write about death for a living person. A "death not recorded"
  // sentence only makes sense once the person is presumed deceased — a recorded death/burial, or a
  // birth year beyond a plausible lifespan — exactly the rule `inferLivingStatus` encodes.
  if (options.length !== 'short' && !inferLivingStatus(person)) {
    if (facts.deathYear) {
      const age = facts.birthYear != null && facts.deathYear > facts.birthYear ? facts.deathYear - facts.birthYear : null;
      paragraphs.push(b.died(name, String(facts.deathYear), facts.deathPlace || '', age));
    } else {
      paragraphs.push(b.deathUnknown(name));
    }
  }

  // Legacy (long only)
  if (options.length === 'long') {
    paragraphs.push(b.legacy(name));
  }

  return paragraphs.join('\n\n');
};

/** Deterministic family-overview chapter drawn from the statistics snapshot. Localized by `language`. */
export const deterministicFamilyOverview = (
  tree: { name?: string } | null | undefined,
  statistics: BookStatistics,
  language: BookGenerationOptions['language']
): string => {
  const o = bookStrings(language).overview;
  const surname = statistics.topSurnames[0] || '';
  const family = o.family(surname);
  const count = statistics.personCount;
  const span = bookStrings(language).spanPhrase(statistics.earliestBirthYear, statistics.latestDeathYear);
  const places = statistics.topPlaces.length ? `, ${joinList(statistics.topPlaces.slice(0, 3))}` : '';
  const genClause = statistics.generationDepth ? o.acrossGens(statistics.generationDepth) : o.acrossYears;

  return [
    o.chronicles(family, count, span, places),
    `${o.witness(genClause, family)}${o.trades(statistics.topOccupations.length ? joinList(statistics.topOccupations.slice(0, 3)) : '')}`,
    o.following(tree?.name ?? null),
  ].join('\n\n');
};

const personBiographyPrompt = (
  person: Person,
  facts: BookChapterFacts,
  options: BookGenerationOptions
): string => {
  const targetParagraphs = LENGTH_PARAGRAPHS[options.length];
  const isLiving = inferLivingStatus(person);
  const lines = [
    `Subject: ${fullName(person)}`,
    facts.lifespanLabel ? `Lifespan: ${facts.lifespanLabel}` : null,
    isLiving ? 'Living status: still living' : 'Living status: deceased',
    facts.birthPlace ? `Born in: ${facts.birthPlace}` : null,
    facts.deathPlace ? `Died in: ${facts.deathPlace}` : null,
    facts.occupations?.length ? `Occupation(s): ${joinList(facts.occupations)}` : null,
    facts.parentNames?.length ? `Parents: ${joinList(facts.parentNames)}` : null,
    facts.spouseNames?.length ? `Spouse(s) (formally married): ${joinList(facts.spouseNames)}` : null,
    facts.partnerNames?.length ? `Partner(s) (unmarried — they lived together as a couple, never married): ${joinList(facts.partnerNames)}` : null,
    facts.childNames?.length ? `Children: ${joinList(facts.childNames)}` : null,
    facts.siblingNames?.length ? `Siblings: ${joinList(facts.siblingNames)}` : null,
    facts.events?.length ? `Life events: ${facts.events.map((e) => e.label).join('; ')}` : null,
    facts.sourceCount ? `Evidence: ${facts.sourceCount} sourced record(s) on file` : null,
    person.bio?.trim() ? `Existing notes: ${person.bio.trim()}` : null,
  ].filter(Boolean).map((line) => `- ${line}`).join('\n');

  const livingRules = isLiving
    ? [
        '- The subject is still living. Do NOT write about their death, and do NOT state that the circumstances or date of death are unknown. Simply omit any mention of death.',
      ]
    : [
        '- The subject is deceased. You may note their death only if a death year/place is listed among the facts; if no death details are recorded, you may say briefly that the circumstances of death are not recorded.',
      ];

  return [
    'Write a biography for a printed family-history book.',
    'Known facts:',
    lines,
    '',
    'Requirements:',
    `- Write entirely in ${languageName(options.language)}.`,
    `- Write exactly ${targetParagraphs} paragraphs in a ${STYLE_INSTRUCTION[options.style]}.`,
    ...livingRules,
    '- Distinguish spouses (formally married) from partners (unmarried, cohabiting): never say a partner "married" or "wed" the subject — describe them as having lived together as a couple.',
    '- Situate the life in its historical context: the era, the region, and the major events and social changes a person of this place, time, and occupation would plausibly have lived through (wars, epidemics, migration, industrialization, religious or political shifts as relevant).',
    '- Do NOT invent personal facts (names, dates, relationships) beyond those listed. Historical context and plausible everyday-life detail are welcome and expected, but keep the distinction legible: state documented facts plainly, and signal inferred or contextual material with hedged phrasing ("would have", "likely", "may have") so a reader can tell recorded evidence from narrative interpolation.',
    '- Plain prose only: no headings, no bullet lists, no markdown, no introductory labels.',
    '- Begin the first paragraph with the subject\'s name.',
  ].join('\n');
};

const familyOverviewPrompt = (
  tree: { name?: string } | null | undefined,
  statistics: BookStatistics,
  options: BookGenerationOptions
): string => {
  const lines = [
    `Family / tree: ${tree?.name || '(unnamed)'}`,
    `People chronicled: ${statistics.personCount}`,
    statistics.earliestBirthYear != null && statistics.latestDeathYear != null
      ? `Time span: about ${statistics.earliestBirthYear}–${statistics.latestDeathYear}` : null,
    statistics.topSurnames.length ? `Principal surnames: ${joinList(statistics.topSurnames)}` : null,
    statistics.topPlaces.length ? `Places: ${joinList(statistics.topPlaces)}` : null,
    statistics.topOccupations.length ? `Common occupations: ${joinList(statistics.topOccupations)}` : null,
    statistics.generationDepth ? `Generations spanned: ~${statistics.generationDepth}` : null,
  ].filter(Boolean).map((line) => `- ${line}`).join('\n');

  return [
    'Write the opening "Family Overview" chapter for a printed family-history book.',
    'Family facts:',
    lines,
    '',
    'Requirements:',
    `- Write entirely in ${languageName(options.language)}.`,
    `- 2–3 paragraphs in a ${STYLE_INSTRUCTION[options.style]}.`,
    '- Introduce the family, where they lived, the span of time covered, and the historical currents those generations would have lived through.',
    '- Set up the individual chapters that follow. Plain prose only; no headings, bullets, or markdown.',
  ].join('\n');
};

const biographyCache = new BoundedCache<string>();
const overviewCache = new BoundedCache<string>();

export const composePersonBiography = async (
  person: Person,
  facts: BookChapterFacts,
  options: BookGenerationOptions
): Promise<string> => {
  const cacheKey = `bio|${person.id}|${options.style}|${options.length}|${options.language}|${facts.lifespanLabel ?? ''}|${(facts.occupations || []).join(',')}|${(facts.spouseNames || []).join(',')}|${(facts.partnerNames || []).join(',')}|${(facts.events || []).map((e) => e.label).join(';')}|${facts.sourceCount ?? 0}|${inferLivingStatus(person) ? 'living' : 'deceased'}`;
  const cached = biographyCache.get(cacheKey);
  if (cached) return cached;

  const fallback = () => deterministicPersonBiography(person, facts, options);
  try {
    const text = await withRetry(
      () =>
        callOpenRouter(
          [
            { role: 'system', content: 'You are a careful historical biographer for a genealogy product.' },
            { role: 'user', content: personBiographyPrompt(person, facts, options) },
          ],
          { temperature: 0.7, max_tokens: LENGTH_MAX_TOKENS[options.length], timeoutMs: 30000 }
        ),
      1
    );
    const result = text && text.trim() ? text.trim() : fallback();
    biographyCache.set(cacheKey, result);
    return result;
  } catch (error) {
    console.error('OpenRouter Biography Error:', error);
    const result = fallback();
    biographyCache.set(cacheKey, result);
    return result;
  }
};

export const composeFamilyOverview = async (
  tree: { name?: string } | null | undefined,
  statistics: BookStatistics,
  options: BookGenerationOptions
): Promise<string> => {
  const cacheKey = `overview|${tree?.name ?? ''}|${options.style}|${options.length}|${options.language}|${statistics.personCount}|${statistics.earliestBirthYear ?? ''}|${statistics.latestDeathYear ?? ''}`;
  const cached = overviewCache.get(cacheKey);
  if (cached) return cached;

  const fallback = () => deterministicFamilyOverview(tree, statistics, options.language);
  try {
    const text = await withRetry(
      () =>
        callOpenRouter(
          [
            { role: 'system', content: 'You are a careful historian writing the opening chapter of a family-history book.' },
            { role: 'user', content: familyOverviewPrompt(tree, statistics, options) },
          ],
          { temperature: 0.7, max_tokens: options.length === 'short' ? 500 : 820, timeoutMs: 30000 }
        ),
      1
    );
    const result = text && text.trim() ? text.trim() : fallback();
    overviewCache.set(cacheKey, result);
    return result;
  } catch (error) {
    console.error('OpenRouter Overview Error:', error);
    const result = fallback();
    overviewCache.set(cacheKey, result);
    return result;
  }
};
