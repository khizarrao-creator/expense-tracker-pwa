import type { RoutingRule, UseCase } from './types';

const ROUTING_RULES: RoutingRule[] = [
  {
    useCase: 'chat',
    preferredModelId: 'gemini-2.5-flash',
    fallbackModelIds: ['gemini-3.1-flash-lite', 'gemini-3-flash', 'gemini-2.5-flash'],
  },
  {
    useCase: 'fast-response',
    preferredModelId: 'gemini-3.1-flash-lite',
    fallbackModelIds: ['gemini-2.5-flash', 'gemini-3-flash'],
  },
  {
    useCase: 'reasoning',
    preferredModelId: 'gemini-3-flash',
    fallbackModelIds: ['gemini-2.5-flash', 'gemini-3.1-flash-lite'],
  },
  {
    useCase: 'speech-tts',
    preferredModelId: 'gemini-3.1-flash-tts',
    fallbackModelIds: ['gemini-2.5-flash', 'gemini-3-flash'],
  },
  {
    useCase: 'translation',
    preferredModelId: 'gemini-3.5-live-translate',
    fallbackModelIds: ['gemini-2.5-flash', 'gemini-3.1-flash-lite'],
  },
  {
    useCase: 'robotics',
    preferredModelId: 'gemini-robotics-er-1.6-preview',
    fallbackModelIds: ['gemini-2.5-flash', 'gemini-3-flash'],
  },
  {
    useCase: 'open-weight-fallback',
    preferredModelId: 'gemma-4-31b',
    fallbackModelIds: ['gemini-2.5-flash', 'gemini-3.1-flash-lite'],
  },
];

let routingRules: RoutingRule[] = [...ROUTING_RULES];

export const getRoutingRules = (): RoutingRule[] => {
  return routingRules;
};

export const getRoutingRule = (useCase: UseCase): RoutingRule | undefined => {
  return routingRules.find(r => r.useCase === useCase);
};

export const getPreferredModelForUseCase = (useCase: UseCase): string => {
  const rule = getRoutingRule(useCase);
  return rule?.preferredModelId || 'gemini-2.5-flash';
};

export const getFallbackModelsForUseCase = (useCase: UseCase): string[] => {
  const rule = getRoutingRule(useCase);
  return rule?.fallbackModelIds || ['gemini-2.5-flash'];
};

export const updateRoutingRule = (
  useCase: UseCase,
  preferredModelId: string,
  fallbackModelIds: string[]
): void => {
  const existing = routingRules.find(r => r.useCase === useCase);
  if (existing) {
    existing.preferredModelId = preferredModelId;
    existing.fallbackModelIds = fallbackModelIds;
  } else {
    routingRules.push({ useCase, preferredModelId, fallbackModelIds });
  }
};

export const resetRoutingRules = (): void => {
  routingRules = ROUTING_RULES.map(r => ({ ...r }));
};

export const selectModelChain = (useCase: UseCase): string[] => {
  const provider = localStorage.getItem('ai_provider') || 'gemini';
  if (provider === 'nvidia') {
    const fallbackId = localStorage.getItem('ai_fallback_model_id') || 'glm-5.2';
    return [fallbackId, 'glm-5.2', 'thudm/glm-4-9b-chat', 'deepseek-ai/deepseek-r1', 'meta/llama-3.3-70b-instruct'];
  }
  const rule = getRoutingRule(useCase);
  if (!rule) return ['gemini-2.5-flash'];
  return [rule.preferredModelId, ...rule.fallbackModelIds];
};
