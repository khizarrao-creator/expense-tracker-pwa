import type { ModelInfo, UseCase } from './types';

const DEFAULT_TEMPERATURE = 0.4;
const DEFAULT_MAX_TOKENS = 2048;

const MODELS: ModelInfo[] = [
  {
    id: 'gemini-2.5-flash',
    name: 'Gemini 2.5 Flash',
    category: 'text-out',
    apiName: 'gemini-2.5-flash',
    description: 'Fast, general-purpose model for everyday chat and transaction management',
    capabilities: ['text-generation', 'function-calling', 'chat'],
    isDefault: true,
    isAvailable: true,
    supportedUseCases: ['chat'],
    temperature: DEFAULT_TEMPERATURE,
    maxOutputTokens: DEFAULT_MAX_TOKENS,
  },
  {
    id: 'gemini-3-flash',
    name: 'Gemini 3 Flash',
    category: 'text-out',
    apiName: 'gemini-3-flash',
    description: 'Higher quality reasoning model for complex financial analysis and multi-step planning',
    capabilities: ['text-generation', 'function-calling', 'reasoning', 'chat'],
    isDefault: false,
    isAvailable: true,
    fallbackModelId: 'gemini-2.5-flash',
    supportedUseCases: ['reasoning'],
    temperature: 0.3,
    maxOutputTokens: 4096,
  },
  {
    id: 'gemini-3.1-flash-lite',
    name: 'Gemini 3.1 Flash Lite',
    category: 'text-out',
    apiName: 'gemini-3.1-flash-lite',
    description: 'Ultra-fast lightweight model for quick responses and simple queries',
    capabilities: ['text-generation', 'chat'],
    isDefault: false,
    isAvailable: true,
    fallbackModelId: 'gemini-2.5-flash',
    supportedUseCases: ['fast-response'],
    temperature: 0.2,
    maxOutputTokens: 1024,
  },
  {
    id: 'gemini-3.5-live-translate',
    name: 'Gemini 3.5 Live Translate',
    category: 'live-api',
    apiName: 'gemini-3.5-live-translate',
    description: 'Specialized model for real-time translation sessions',
    capabilities: ['translation', 'live-api'],
    isDefault: false,
    isAvailable: true,
    fallbackModelId: 'gemini-2.5-flash',
    supportedUseCases: ['translation'],
    temperature: 0.2,
    maxOutputTokens: 2048,
  },
  {
    id: 'gemini-3.1-flash-tts',
    name: 'Gemini 3.1 Flash TTS',
    category: 'multi-modal',
    apiName: 'gemini-3.1-flash-tts',
    description: 'Multi-modal model supporting text-to-speech generation',
    capabilities: ['text-generation', 'text-to-speech', 'multi-modal'],
    isDefault: false,
    isAvailable: true,
    fallbackModelId: 'gemini-2.5-flash',
    supportedUseCases: ['speech-tts'],
    temperature: 0.3,
    maxOutputTokens: 2048,
  },
  {
    id: 'gemma-4-31b',
    name: 'Gemma 4 31B',
    category: 'other',
    apiName: 'gemma-4-31b-it',
    description: 'Open-weight fallback model for scenarios requiring an alternative to Gemini',
    capabilities: ['text-generation', 'chat'],
    isDefault: false,
    isAvailable: true,
    fallbackModelId: 'gemini-2.5-flash',
    supportedUseCases: ['open-weight-fallback'],
    temperature: 0.4,
    maxOutputTokens: 2048,
  },
  {
    id: 'gemini-robotics-er-1.6-preview',
    name: 'Gemini Robotics ER 1.6 Preview',
    category: 'robotics-experimental',
    apiName: 'gemini-robotics-er-1.6-preview',
    description: 'Experimental robotics model for spatial reasoning and location-aware tasks',
    capabilities: ['spatial-reasoning', 'location-awareness', 'robotics'],
    isDefault: false,
    isAvailable: true,
    fallbackModelId: 'gemini-2.5-flash',
    supportedUseCases: ['robotics'],
    temperature: 0.3,
    maxOutputTokens: 4096,
  },
];

const NVIDIA_MODELS: ModelInfo[] = [
  {
    id: 'glm-5.2',
    name: 'GLM 5.2 (NVIDIA NIM)',
    category: 'text-out',
    apiName: 'glm-5.2',
    description: 'High performance GLM 5.2 model hosted on NVIDIA NIM infrastructure',
    capabilities: ['text-generation', 'reasoning', 'chat'],
    isDefault: true,
    isAvailable: true,
    supportedUseCases: ['chat', 'reasoning'],
    temperature: DEFAULT_TEMPERATURE,
    maxOutputTokens: DEFAULT_MAX_TOKENS,
  },
  {
    id: 'thudm/glm-4-9b-chat',
    name: 'GLM 4 9B Chat',
    category: 'text-out',
    apiName: 'thudm/glm-4-9b-chat',
    description: 'Lightweight GLM 4 model for fast response chat',
    capabilities: ['text-generation', 'chat'],
    isDefault: false,
    isAvailable: true,
    supportedUseCases: ['fast-response', 'chat'],
    temperature: 0.3,
    maxOutputTokens: 2048,
  },
  {
    id: 'deepseek-ai/deepseek-r1',
    name: 'DeepSeek R1',
    category: 'text-out',
    apiName: 'deepseek-ai/deepseek-r1',
    description: 'DeepSeek reasoning model hosted on NVIDIA NIM',
    capabilities: ['text-generation', 'reasoning', 'chat'],
    isDefault: false,
    isAvailable: true,
    supportedUseCases: ['reasoning', 'chat'],
    temperature: 0.3,
    maxOutputTokens: 4096,
  },
  {
    id: 'meta/llama-3.3-70b-instruct',
    name: 'Llama 3.3 70B Instruct',
    category: 'text-out',
    apiName: 'meta/llama-3.3-70b-instruct',
    description: 'Meta Llama 3.3 70B Instruct model',
    capabilities: ['text-generation', 'chat'],
    isDefault: false,
    isAvailable: true,
    supportedUseCases: ['chat'],
    temperature: 0.4,
    maxOutputTokens: 2048,
  },
  {
    id: 'mistralai/mistral-large-2-instruct',
    name: 'Mistral Large 2',
    category: 'text-out',
    apiName: 'mistralai/mistral-large-2-instruct',
    description: 'Mistral Large 2 Instruct model',
    capabilities: ['text-generation', 'chat'],
    isDefault: false,
    isAvailable: true,
    supportedUseCases: ['chat'],
    temperature: 0.3,
    maxOutputTokens: 2048,
  },
];

let modelRegistry: ModelInfo[] = [...MODELS];

export const getModelRegistry = (): ModelInfo[] => {
  const provider = localStorage.getItem('ai_provider') || 'gemini';
  if (provider === 'nvidia') {
    return NVIDIA_MODELS;
  }
  return modelRegistry;
};

export const getModelById = (modelId: string): ModelInfo | undefined => {
  const registry = getModelRegistry();
  return registry.find(m => m.id === modelId) || {
    id: modelId,
    name: modelId,
    category: 'text-out',
    apiName: modelId,
    description: modelId,
    capabilities: ['text-generation', 'chat'],
    isDefault: false,
    isAvailable: true,
    supportedUseCases: ['chat'],
  };
};

export const getDefaultModel = (): ModelInfo => {
  const registry = getModelRegistry();
  const configuredDefaultId = localStorage.getItem('ai_fallback_model_id');
  if (configuredDefaultId) {
    const found = registry.find(m => m.id === configuredDefaultId);
    if (found) return found;
  }
  const defaultModel = registry.find(m => m.isDefault);
  return defaultModel || registry[0];
};

export const getModelsByCategory = (category: string): ModelInfo[] => {
  return modelRegistry.filter(m => m.category === category);
};

export const getModelsByUseCase = (useCase: UseCase): ModelInfo[] => {
  return modelRegistry.filter(m => m.supportedUseCases.includes(useCase));
};

export const markModelUnavailable = (modelId: string): void => {
  const model = modelRegistry.find(m => m.id === modelId);
  if (model) {
    model.isAvailable = false;
  }
};

export const markModelAvailable = (modelId: string): void => {
  const model = modelRegistry.find(m => m.id === modelId);
  if (model) {
    model.isAvailable = true;
  }
};

export const resolveModel = (modelId?: string, useCase?: UseCase): ModelInfo => {
  if (modelId) {
    const model = getModelById(modelId);
    if (model && model.isAvailable) return model;
    if (model && model.fallbackModelId) {
      const fallback = getModelById(model.fallbackModelId);
      if (fallback && fallback.isAvailable) return fallback;
    }
  }

  if (useCase) {
    const candidates = getModelsByUseCase(useCase).filter(m => m.isAvailable);
    if (candidates.length > 0) return candidates[0];
    for (const model of modelRegistry.filter(m => m.isAvailable)) {
      if (model.fallbackModelId) {
        const fallback = getModelById(model.fallbackModelId);
        if (fallback && fallback.isAvailable) return fallback;
      }
    }
  }

  return getDefaultModel();
};

export const resetModelRegistry = (): void => {
  modelRegistry = MODELS.map(m => ({ ...m }));
};
