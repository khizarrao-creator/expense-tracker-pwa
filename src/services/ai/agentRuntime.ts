import type { AgentExecutionOptions, AgentExecutionResult, ModelInfo, ToolInfo } from './types';
import { GEMINI_BASE_URL } from './types';
import { resolveModel, markModelUnavailable } from './modelRegistry';
import { getToolsForModel, getEnabledByDefaultTools } from './toolRegistry';
import { selectModelChain } from './router';
import { getApiKey, getProviderConfig } from './provider';

interface GeminiRequestBody {
  contents: any[];
  systemInstruction?: { parts: [{ text: string }] };
  tools?: any[];
  generationConfig?: {
    temperature?: number;
    maxOutputTokens?: number;
  };
}

interface GeminiResponseData {
  candidates?: {
    content?: {
      parts?: ({
        text?: string;
        functionCall?: { name: string; args: any };
      })[];
    };
  }[];
}

const buildGroundingTools = (modelId: string, tools: ToolInfo[]): any[] => {
  const groundingTools: any[] = [];

  for (const tool of tools) {
    if (tool.category === 'search-grounding' && tool.config) {
      groundingTools.push(tool.config);
    }
  }

  return groundingTools;
};

const buildToolsPayload = (modelId: string, availableTools: ToolInfo[]): any[] => {
  const result: any[] = [];

  const groundingTools = availableTools.filter(
    t => t.category === 'search-grounding' || t.category === 'map-grounding'
  );
  if (groundingTools.length > 0) {
    result.push(...buildGroundingTools(modelId, groundingTools));
  }

  return result;
};

const executeWithModel = async (
  model: ModelInfo,
  contents: any[],
  systemInstruction: string | undefined,
  functionDeclarations: any[] | undefined,
  options: AgentExecutionOptions,
  availableTools: ToolInfo[]
): Promise<GeminiResponseData> => {
  const apiKey = getApiKey();
  const apiUrl = `${GEMINI_BASE_URL}/${model.apiName}:generateContent`;

  const body: GeminiRequestBody = {
    contents,
    generationConfig: {
      temperature: options.temperature ?? model.temperature ?? 0.4,
      maxOutputTokens: options.maxOutputTokens ?? model.maxOutputTokens ?? 2048,
    },
  };

  if (systemInstruction) {
    body.systemInstruction = { parts: [{ text: systemInstruction }] };
  }

  const toolsPayload = buildToolsPayload(model.id, availableTools);
  if (toolsPayload.length > 0) {
    body.tools = toolsPayload;
  }

  if (functionDeclarations && functionDeclarations.length > 0) {
    if (!body.tools) body.tools = [];
    body.tools.push({ functionDeclarations });
  }

  try {
    const response = await fetch(`${apiUrl}?key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errJson = await response.json().catch(() => ({}));
      const errorMsg = errJson?.error?.message || `API error: ${response.status}`;

      if (response.status === 404 || response.status === 403) {
        markModelUnavailable(model.id);
      }

      throw new Error(errorMsg);
    }

    return await response.json();
  } catch (error) {
    if (error instanceof TypeError && error.message === 'Failed to fetch') {
      markModelUnavailable(model.id);
    }
    throw error;
  }
};

const tryModelChain = async (
  modelIds: string[],
  contents: any[],
  systemInstruction: string | undefined,
  functionDeclarations: any[] | undefined,
  options: AgentExecutionOptions,
  availableTools: ToolInfo[]
): Promise<{ data: GeminiResponseData; model: ModelInfo }> => {
  const errors: string[] = [];

  for (const modelId of modelIds) {
    const model = resolveModel(modelId, options.useCase);
    if (!model.isAvailable) {
      errors.push(`Model ${modelId} is unavailable`);
      continue;
    }

    try {
      const data = await executeWithModel(
        model, contents, systemInstruction, functionDeclarations,
        options, availableTools
      );
      return { data, model };
    } catch (error: any) {
      errors.push(`${modelId}: ${error.message}`);
    }
  }

  throw new Error(
    `All models in the chain failed. Attempted: ${errors.join('; ')}`
  );
};

export const executeAgent = async (
  contents: any[],
  systemInstruction?: string,
  functionDeclarations?: any[],
  options: AgentExecutionOptions = {}
): Promise<AgentExecutionResult> => {
  const config = getProviderConfig();
  const modelIds = options.modelId
    ? [options.modelId, ...config.models.filter(m => m.isDefault).map(m => m.id)]
    : selectModelChain(options.useCase || 'chat');

  const enableGrounding = options.enableGrounding ?? true;

  let availableTools = getToolsForModel('*');
  if (enableGrounding) {
    const defaultTools = getEnabledByDefaultTools();
    const groundingTools = defaultTools.filter(
      t => t.category === 'search-grounding' || t.category === 'map-grounding'
    );
    availableTools = [...availableTools, ...groundingTools];
  }

  const { data, model } = await tryModelChain(
    modelIds, contents, systemInstruction, functionDeclarations,
    options, availableTools
  );

  const candidatePart = data?.candidates?.[0]?.content?.parts?.[0];

  if (!candidatePart) {
    throw new Error('No response generated from the AI model.');
  }

  const result: AgentExecutionResult = {
    modelUsed: model.id,
    grounded: enableGrounding,
  };

  if (candidatePart.functionCall) {
    result.functionCall = {
      name: candidatePart.functionCall.name,
      args: candidatePart.functionCall.args,
    };
  } else {
    result.text = candidatePart.text || '';
  }

  return result;
};

export const getModelForUseCase = (useCase: import('./types').UseCase): ModelInfo => {
  return resolveModel(undefined, useCase);
};

export const getAvailableModelsForUseCase = (
  useCase: import('./types').UseCase
): ModelInfo[] => {
  const modelIds = selectModelChain(useCase);
  return modelIds
    .map(id => resolveModel(id, useCase))
    .filter(m => m.isAvailable);
};
