export type AIProvider = 'openrouter';

export interface OpenRouterSettings {
  enabled: boolean;
  apiKey: string;
  model: string;
  baseUrl: string;
  updatedAt?: string | null;
  updatedBy?: string | null;
}

export interface StoredAISettings {
  defaultProvider: AIProvider;
  providers: {
    openrouter: OpenRouterSettings;
  };
}

export interface StoredAISettingsMetadata {
  defaultProvider: AIProvider;
  providers: {
    openrouter: Omit<OpenRouterSettings, 'apiKey'> & {
      hasApiKey: boolean;
    };
  };
}

export const DEFAULT_OPENROUTER_MODEL = 'nvidia/nemotron-nano-12b-v2-vl:free';
export const DEFAULT_OPENROUTER_BASE_URL = 'https://openrouter.ai/api/v1';

const buildDefaults = (): StoredAISettings => ({
  defaultProvider: 'openrouter',
  providers: {
    openrouter: {
      enabled: true,
      apiKey: '',
      model: DEFAULT_OPENROUTER_MODEL,
      baseUrl: DEFAULT_OPENROUTER_BASE_URL,
      updatedAt: null,
      updatedBy: null,
    },
  },
});

let cachedAISettings: StoredAISettings | null = null;

export const getDefaultAISettings = (): StoredAISettings => buildDefaults();

export const getCachedAISettings = (): StoredAISettings => cachedAISettings ?? buildDefaults();

export const setCachedAISettings = (settings: StoredAISettings | null) => {
  cachedAISettings = settings;
};

export const getDefaultAISettingsMetadata = (): StoredAISettingsMetadata => {
  const defaults = buildDefaults();
  return {
    defaultProvider: defaults.defaultProvider,
    providers: {
      openrouter: {
        enabled: defaults.providers.openrouter.enabled,
        model: defaults.providers.openrouter.model,
        baseUrl: defaults.providers.openrouter.baseUrl,
        hasApiKey: false,
        updatedAt: defaults.providers.openrouter.updatedAt,
        updatedBy: defaults.providers.openrouter.updatedBy,
      },
    },
  };
};
