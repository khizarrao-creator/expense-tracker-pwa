import type { AgentExecutionOptions, AgentExecutionResult, ModelInfo, ToolInfo } from './types';
import { resolveModel, markModelUnavailable } from './modelRegistry';
import { getToolsForModel, getEnabledByDefaultTools } from './toolRegistry';
import { selectModelChain } from './router';
import { getProviderConfig, getApiKey } from './provider';
import { getApiUrl } from '../whatsappService';
import { auth } from '../../firebase';

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

const buildGroundingTools = (_modelId: string, tools: ToolInfo[]): any[] => {
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
  const isGemma = model.apiName.startsWith('gemma');

  let adjustedContents = contents;
  if (isGemma && systemInstruction) {
    adjustedContents = contents.map((c, idx) => {
      if (idx === 0 && c.role === 'user' && c.parts && c.parts.length > 0 && c.parts[0].text) {
        return {
          ...c,
          parts: [{ ...c.parts[0], text: `${systemInstruction}\n\nUser Query:\n${c.parts[0].text}` }, ...c.parts.slice(1)]
        };
      }
      return c;
    });
  }

  const body: any = {
    contents: adjustedContents,
    modelId: model.apiName,
    generationConfig: {
      temperature: options.temperature ?? model.temperature ?? 0.4,
      maxOutputTokens: options.maxOutputTokens ?? model.maxOutputTokens ?? 2048,
    },
  };

  if (systemInstruction && !isGemma) {
    body.systemInstruction = { parts: [{ text: systemInstruction }] };
  }

  if (!isGemma) {
    const toolsPayload = buildToolsPayload(model.id, availableTools);
    if (toolsPayload.length > 0) {
      body.tools = toolsPayload;
    }

    if (functionDeclarations && functionDeclarations.length > 0) {
      if (!body.tools) body.tools = [];
      body.tools.push({ functionDeclarations });
    }
  }

  try {
    const idToken = auth?.currentUser ? await auth.currentUser.getIdToken() : '';
    const proxyUrl = getApiUrl('/api/ai/chat');
    const userApiKey = getApiKey();
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${idToken}`
    };
    if (userApiKey) {
      headers['x-user-api-key'] = userApiKey;
    }

    const provider = localStorage.getItem('ai_provider') || 'gemini';
    const baseUrl = localStorage.getItem('ai_base_url') || '';

    const response = await fetch(proxyUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify({ ...body, provider, baseUrl }),
    });

    if (!response.ok) {
      const errJson = await response.json().catch(() => ({}));
      let errorMsg = errJson?.error || `AI proxy error: ${response.status}`;
      const providerName = provider === 'nvidia' ? 'NVIDIA NIM' : provider === 'openai' ? 'OpenAI' : 'Google Gemini';

      if (
        errorMsg.includes('invalid authentication credentials') ||
        errorMsg.includes('OAuth 2') ||
        errorMsg.includes('API_KEY_INVALID') ||
        errorMsg.includes('API key not valid') ||
        errorMsg.includes('401')
      ) {
        errorMsg = `Invalid ${providerName} API Key. Please update your API key in Settings or Admin Panel.`;
      }

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
