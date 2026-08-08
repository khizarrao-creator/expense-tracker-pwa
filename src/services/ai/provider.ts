import type { ProviderConfig, ModelInfo, ToolInfo } from './types';
import { GEMINI_BASE_URL } from './types';
import { getModelRegistry, getDefaultModel, resolveModel, markModelUnavailable } from './modelRegistry';
import { getToolRegistry, getToolsForModel, getEnabledByDefaultTools } from './toolRegistry';
import { getRoutingRules } from './router';

let providerConfig: ProviderConfig | null = null;

const FALLBACK_API_KEYS: string[] = [];

export const getApiKey = (): string => {
  const customKey = localStorage.getItem('user_ai_api_key') || localStorage.getItem('user_gemini_api_key');
  if (customKey) return customKey;

  const fallbackKey = localStorage.getItem('ai_fallback_api_key') || localStorage.getItem('fallback_gemini_api_key');
  if (fallbackKey) return fallbackKey;

  const envKey = (import.meta.env.VITE_NVIDIA_API_KEY || import.meta.env.VITE_GEMINI_API_KEY) as string | undefined;
  if (envKey) return envKey;
  for (const key of FALLBACK_API_KEYS) {
    if (key) return key;
  }
  return '';
};

export const saveCustomApiKey = (key: string): void => {
  if (key) {
    localStorage.setItem('user_gemini_api_key', key);
  } else {
    localStorage.removeItem('user_gemini_api_key');
  }
  refreshProviderConfig();
};

export const clearCustomApiKey = (): void => {
  localStorage.removeItem('user_gemini_api_key');
  refreshProviderConfig();
};

export const getCustomApiKey = (): string => {
  return localStorage.getItem('user_gemini_api_key') || '';
};

export const hasApiKey = (): boolean => {
  return getApiKey().length > 0;
};

export const initializeProvider = (): ProviderConfig => {
  const apiKey = getApiKey();
  const models = getModelRegistry();
  const tools = getToolRegistry();
  const routing = getRoutingRules();
  const defaultModel = getDefaultModel();

  const providerType = (localStorage.getItem('ai_provider') || 'gemini') as any;
  const baseUrl = localStorage.getItem('ai_base_url') || (providerType === 'nvidia' ? 'https://integrate.api.nvidia.com/v1' : GEMINI_BASE_URL);

  providerConfig = {
    provider: providerType,
    apiKey,
    baseUrl,
    defaultModelId: defaultModel.id,
    models,
    tools,
    routing,
  };

  return providerConfig;
};

export const getProviderConfig = (): ProviderConfig => {
  if (!providerConfig) {
    return initializeProvider();
  }
  return providerConfig;
};

export const refreshProviderConfig = (): ProviderConfig => {
  providerConfig = null;
  return initializeProvider();
};

export const getModelApiName = (model: ModelInfo): string => {
  return model.apiName;
};

export const buildApiUrl = (model: ModelInfo): string => {
  const config = getProviderConfig();
  return `${config.baseUrl}/${model.apiName}:generateContent`;
};

export const isModelAvailableForApiKey = async (model: ModelInfo): Promise<boolean> => {
  if (!hasApiKey()) return false;
  try {
    const config = getProviderConfig();
    const url = buildApiUrl(model);
    const response = await fetch(`${url}?key=${config.apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: 'ping' }] }],
        generationConfig: { maxOutputTokens: 1 },
      }),
    });
    if (response.status === 404 || response.status === 403 || response.status === 400) {
      return false;
    }
    return response.ok;
  } catch {
    return false;
  }
};

export const validateAndMarkModels = async (): Promise<void> => {
  const models = getModelRegistry();
  for (const model of models) {
    if (!model.isDefault) {
      const available = await isModelAvailableForApiKey(model);
      if (!available) {
        markModelUnavailable(model.id);
      }
    }
  }
};

export const getResolvedModelConfig = (
  modelId?: string,
  useCase?: import('./types').UseCase,
  enableGrounding?: boolean
): {
  model: ModelInfo;
  tools: ToolInfo[];
  apiKey: string;
  apiUrl: string;
} => {
  const config = getProviderConfig();
  const model = resolveModel(modelId, useCase);
  const apiUrl = buildApiUrl(model);
  const apiKey = config.apiKey;

  let toolsForModel = getToolsForModel(model.id);

  if (enableGrounding) {
    const defaultTools = getEnabledByDefaultTools();
    const groundingTools = defaultTools.filter(
      t => t.category === 'search-grounding' || t.category === 'map-grounding'
    );
    toolsForModel = [...toolsForModel, ...groundingTools];
  }

  return { model, tools: toolsForModel, apiKey, apiUrl };
};
