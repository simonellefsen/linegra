import { Person, StructuredPlace, DeathCauseCategory } from "../types";
import {
  DEFAULT_OPENROUTER_BASE_URL,
  DEFAULT_OPENROUTER_MODEL,
  getStoredAISettings,
  OpenRouterSettings,
} from "../lib/aiSettings";

type RuntimeEnv = Record<string, string | undefined>;

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

const getOpenRouterConfig = (overrides?: Partial<OpenRouterSettings>) => {
  const env = getRuntimeEnv();
  const stored = getStoredAISettings().providers.openrouter;
  const key = overrides?.apiKey ?? stored.apiKey ?? env.VITE_OPENROUTER_API_KEY ?? env.OPENROUTER_API_KEY ?? '';
  if (!key) {
    throw new Error('OPENROUTER_API_KEY (or VITE_OPENROUTER_API_KEY) is missing.');
  }
  return {
    apiKey: key,
    model:
      overrides?.model ??
      stored.model ??
      env.VITE_OPENROUTER_MODEL ??
      env.OPENROUTER_MODEL ??
      DEFAULT_OPENROUTER_MODEL,
    baseUrl:
      overrides?.baseUrl ??
      stored.baseUrl ??
      env.VITE_OPENROUTER_BASE_URL ??
      env.OPENROUTER_BASE_URL ??
      DEFAULT_OPENROUTER_BASE_URL
  };
};

interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

interface ChatResponse {
  choices: Array<{
    message: { content?: string };
  }>;
}

/**
 * Executes an AI task with exponential backoff retry logic to handle transient API errors.
 */
const withRetry = async <T>(fn: () => Promise<T>, retries = 3): Promise<T> => {
  let delay = 1000;
  for (let i = 0; i < retries; i++) {
    try {
      return await fn();
    } catch (error) {
      if (i === retries - 1) throw error;
      await new Promise(resolve => setTimeout(resolve, delay));
      delay *= 2;
    }
  }
  throw new Error("API call failed after retries");
};

const callOpenRouter = async (
  messages: ChatMessage[],
  extraBody: Record<string, unknown> = {},
  overrides?: Partial<OpenRouterSettings>
) => {
  const { apiKey, model, baseUrl } = getOpenRouterConfig(overrides);
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
  return data.choices[0]?.message.content?.trim() ?? '';
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

export const hasOpenRouterConfig = () => {
  try {
    const config = getOpenRouterConfig();
    return Boolean(config.apiKey && config.model && config.baseUrl);
  } catch {
    return false;
  }
};

export const testOpenRouterConnection = async (overrides?: Partial<OpenRouterSettings>) => {
  const content = await withRetry(() =>
    callOpenRouter(
      [
        { role: 'system', content: 'You validate API connectivity for a genealogy application.' },
        { role: 'user', content: 'Reply with exactly: OPENROUTER_OK' }
      ],
      { max_tokens: 16, temperature: 0 },
      overrides
    )
  );

  if (!content.includes('OPENROUTER_OK')) {
    throw new Error('Unexpected AI response while testing the OpenRouter connection.');
  }
  return 'OPENROUTER_OK';
};

interface NormalizedDeathCauseResult {
  normalizedCause: string;
  category: DeathCauseCategory;
}

export const normalizeDeathCause = async (rawCause: string): Promise<NormalizedDeathCauseResult> => {
  if (!rawCause.trim()) {
    return { normalizedCause: '', category: 'Unknown' };
  }

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
          content:
            'You normalize historical cause-of-death text for genealogy records. Return concise modern wording and choose the best category.'
        },
        {
          role: 'user',
          content: `Normalize this cause of death for a genealogy record: "${rawCause}". Preserve uncertainty if present.`
        }
      ],
      {
        response_format: {
          type: 'json_schema',
          json_schema: schema
        },
        temperature: 0.1,
        max_tokens: 120
      }
    )
  );

  const parsed = JSON.parse(content || '{}') as Partial<NormalizedDeathCauseResult>;
  return {
    normalizedCause: typeof parsed.normalizedCause === 'string' ? parsed.normalizedCause.trim() : rawCause.trim(),
    category:
      typeof parsed.category === 'string' && DEATH_CAUSE_CATEGORIES.includes(parsed.category as DeathCauseCategory)
        ? (parsed.category as DeathCauseCategory)
        : 'Unknown'
  };
};
