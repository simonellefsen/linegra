import { Person, StructuredPlace, DeathCauseCategory } from "../types";
import { supabase } from "../lib/supabase";
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

interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
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
  const response = await fetch(`${baseUrl}/chat/completions`, {
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
  });

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
  const response = await fetch(`${baseUrl}/chat/completions`, {
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
  });

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

export const parsePlaceString = async (input: string): Promise<Partial<StructuredPlace>> => {
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
    const content = await withRetry(() =>
      callOpenRouter(
        [
          {
            role: 'system',
            content: 'You extract structured place data for genealogists. Return JSON matching the schema.'
          },
          {
            role: 'user',
            content: `Parse this location into structured components: "${input}"`
          }
        ],
        {
          response_format: {
            type: 'json_schema',
            json_schema: schema
          }
        }
      )
    );
    return JSON.parse(content || '{}');
  } catch (error) {
    console.error("OpenRouter Place Parse Error:", error);
    return { fullText: input };
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

export const normalizeDeathCause = async (rawCause: string): Promise<NormalizedDeathCauseResult> => {
  if (!rawCause.trim()) {
    return { normalizedCause: '', category: 'Unknown' };
  }

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
