import type { ToolInfo } from './types';

const TOOLS: ToolInfo[] = [
  {
    id: 'default-search-grounding',
    name: 'Default',
    category: 'search-grounding',
    description: 'Default search grounding for general queries requiring up-to-date information',
    supportedModelIds: ['*'],
    enabledByDefault: true,
    config: {
      googleSearchRetrieval: {
        dynamicRetrievalConfig: {
          mode: 'MODE_DYNAMIC',
          dynamicThreshold: 0.5,
        },
      },
    },
  },
  {
    id: 'gemini-robotics-er-map-grounding',
    name: 'Gemini Robotics ER 1.6 Preview Map',
    category: 'map-grounding',
    description: 'Map-based grounding for robotics and location-aware workflows',
    supportedModelIds: ['gemini-robotics-er-1.6-preview'],
    enabledByDefault: false,
  },
  {
    id: 'gemini-2.5-search-grounding',
    name: 'Gemini 2.5',
    category: 'search-grounding',
    description: 'Search grounding optimized for Gemini 2.5 model family',
    supportedModelIds: ['gemini-2.5-flash', 'gemini-3-flash', 'gemini-3.1-flash-lite', 'gemini-3.5-live-translate'],
    enabledByDefault: true,
    config: {
      googleSearchRetrieval: {
        dynamicRetrievalConfig: {
          mode: 'MODE_DYNAMIC',
          dynamicThreshold: 0.6,
        },
      },
    },
  },
];

const FUNCTION_DECLARATIONS_TOOL_ID = 'ledger-function-calling';

let toolRegistry: ToolInfo[] = [...TOOLS];

export const getToolRegistry = (): ToolInfo[] => {
  return toolRegistry;
};

export const getToolById = (toolId: string): ToolInfo | undefined => {
  return toolRegistry.find(t => t.id === toolId);
};

export const getToolsByCategory = (category: string): ToolInfo[] => {
  return toolRegistry.filter(t => t.category === category);
};

export const getEnabledByDefaultTools = (): ToolInfo[] => {
  return toolRegistry.filter(t => t.enabledByDefault);
};

export const getToolsForModel = (modelId: string): ToolInfo[] => {
  return toolRegistry.filter(
    t => t.supportedModelIds.includes('*') || t.supportedModelIds.includes(modelId)
  );
};

export const enableTool = (toolId: string): void => {
  const tool = toolRegistry.find(t => t.id === toolId);
  if (tool) {
    tool.enabledByDefault = true;
  }
};

export const disableTool = (toolId: string): void => {
  const tool = toolRegistry.find(t => t.id === toolId);
  if (tool) {
    tool.enabledByDefault = false;
  }
};

export const getFunctionDeclarationsToolId = (): string => {
  return FUNCTION_DECLARATIONS_TOOL_ID;
};

export const resetToolRegistry = (): void => {
  toolRegistry = TOOLS.map(t => ({ ...t }));
};
