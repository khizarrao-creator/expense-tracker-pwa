export type ModelCategory =
  | 'text-out'
  | 'live-api'
  | 'multi-modal'
  | 'other'
  | 'robotics-experimental';

export type ToolCategory =
  | 'search-grounding'
  | 'map-grounding'
  | 'function-calling';

export type UseCase =
  | 'chat'
  | 'fast-response'
  | 'reasoning'
  | 'translation'
  | 'speech-tts'
  | 'robotics'
  | 'open-weight-fallback';

export interface ModelInfo {
  id: string;
  name: string;
  category: ModelCategory;
  apiName: string;
  description: string;
  capabilities: string[];
  isDefault: boolean;
  isAvailable: boolean;
  fallbackModelId?: string;
  supportedUseCases: UseCase[];
  temperature?: number;
  maxOutputTokens?: number;
}

export interface ToolInfo {
  id: string;
  name: string;
  category: ToolCategory;
  description: string;
  supportedModelIds: string[];
  enabledByDefault: boolean;
  config?: Record<string, unknown>;
}

export interface RoutingRule {
  useCase: UseCase;
  preferredModelId: string;
  fallbackModelIds: string[];
}

export type ProviderType = 'gemini' | 'nvidia' | 'openai' | 'custom';

export interface ProviderConfig {
  provider: ProviderType;
  apiKey: string;
  baseUrl: string;
  defaultModelId: string;
  models: ModelInfo[];
  tools: ToolInfo[];
  routing: RoutingRule[];
}

export interface ModelSelectionResult {
  model: ModelInfo;
  tools: ToolInfo[];
  providerConfig: ProviderConfig;
}

export interface AgentExecutionOptions {
  useCase?: UseCase;
  modelId?: string;
  temperature?: number;
  maxOutputTokens?: number;
  enableGrounding?: boolean;
}

export interface AgentExecutionResult {
  text?: string;
  functionCall?: {
    name: string;
    args: any;
  };
  modelUsed: string;
  grounded: boolean;
}

export const GEMINI_BASE_URL = 'https://generativelanguage.googleapis.com/v1beta/models';
