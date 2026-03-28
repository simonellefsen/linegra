export type AIProvider = 'openrouter';

export interface OpenRouterSettings {
  enabled: boolean;
  apiKey: string;
  model: string;
  baseUrl: string;
}

export interface StoredAISettings {
  defaultProvider: AIProvider;
  providers: {
    openrouter: OpenRouterSettings;
  };
}

export const AI_SETTINGS_STORAGE_KEY = 'LINEGRA_AI_SETTINGS';
export const DEFAULT_OPENROUTER_MODEL = 'nvidia/nemotron-nano-12b-v2-vl:free';
export const DEFAULT_OPENROUTER_BASE_URL = 'https://openrouter.ai/api/v1';

const isBrowser = typeof window !== 'undefined' && typeof window.localStorage !== 'undefined';

const buildDefaults = (): StoredAISettings => ({
  defaultProvider: 'openrouter',
  providers: {
    openrouter: {
      enabled: true,
      apiKey: '',
      model: DEFAULT_OPENROUTER_MODEL,
      baseUrl: DEFAULT_OPENROUTER_BASE_URL,
    },
  },
});

export const getStoredAISettings = (): StoredAISettings => {
  const defaults = buildDefaults();
  if (!isBrowser) return defaults;
  try {
    const raw = window.localStorage.getItem(AI_SETTINGS_STORAGE_KEY);
    if (!raw) return defaults;
    const parsed = JSON.parse(raw) as Partial<StoredAISettings>;
    return {
      defaultProvider: parsed.defaultProvider === 'openrouter' ? 'openrouter' : defaults.defaultProvider,
      providers: {
        openrouter: {
          ...defaults.providers.openrouter,
          ...(parsed.providers?.openrouter ?? {}),
        },
      },
    };
  } catch {
    return defaults;
  }
};

export const saveStoredAISettings = (settings: StoredAISettings) => {
  if (!isBrowser) return;
  window.localStorage.setItem(AI_SETTINGS_STORAGE_KEY, JSON.stringify(settings));
};
