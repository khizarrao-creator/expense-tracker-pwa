'use strict';

/**
 * Provider-agnostic LLM layer for the agent runtime.
 *
 * Resolution order for provider settings:
 *   1. AGENT_PROVIDER / AGENT_MODEL / AGENT_API_KEY / AGENT_BASE_URL (env)
 *   2. Supabase app_config (aiProvider, fallbackModelId, fallbackApiKey, aiBaseUrl)
 *   3. Gemini env key (VITE_GEMINI_API_KEY / GEMINI_API_KEY)
 *
 * Supports two backends:
 *   - gemini              : Google Generative Language API (native function calling + vision)
 *   - OpenAI-compatible   : NVIDIA NIM / OpenAI / custom (chat/completions)
 *
 * Neutral message format = Gemini `contents`:
 *   { role: 'user'|'model', parts: [ {text} | {functionCall} | {functionResponse} | {inlineData} ] }
 */

const gemini = require('./gemini');
const providers = require('./providers');
const { withRetry } = require('./retry');
const logger = require('./logger').make('llm');

let cached = null;

function isGeminiKey(key) {
  return typeof key === 'string' && key.startsWith('AIza');
}

async function loadAppConfig() {
  const url = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY;
  if (!url || !key) return {};
  try {
    const res = await fetch(`${url}/rest/v1/app_config?select=key,value`, {
      headers: { apikey: key, Authorization: `Bearer ${key}` },
    });
    if (!res.ok) return {};
    const rows = await res.json();
    const out = {};
    for (const r of rows) out[r.key] = r.value;
    return out;
  } catch {
    return {};
  }
}

async function getProviderConfig(force = false) {
  if (cached && !force) return cached;

  // 1. Managed provider selected in the AI Agents screen (highest priority).
  try {
    const active = await providers.getActive();
    if (active && active.provider && active.provider.baseUrl) {
      cached = {
        provider: 'custom',
        model: active.model,
        baseUrl: active.provider.baseUrl,
        apiKey: active.provider.apiKey,
        providerName: active.provider.name,
        source: 'managed',
      };
      return cached;
    }
  } catch (e) {
    console.warn('[AgentLLM] managed provider lookup failed:', e.message);
  }

  // 2. Environment / app_config / Gemini env key.
  const app = await loadAppConfig();
  const provider = (process.env.AGENT_PROVIDER || app.aiProvider || 'gemini').toLowerCase();
  const model = process.env.AGENT_MODEL || (provider === 'gemini' ? 'gemini-2.5-flash' : app.fallbackModelId) || 'gemini-2.5-flash';
  const baseUrl = process.env.AGENT_BASE_URL || app.aiBaseUrl || 'https://integrate.api.nvidia.com/v1';
  const apiKey = process.env.AGENT_API_KEY || app.fallbackApiKey || gemini.resolveApiKey();
  cached = { provider, model, baseUrl, apiKey, source: 'env' };
  return cached;
}

function resetProvider() {
  cached = null;
}

function safeJson(str) {
  if (!str) return {};
  if (typeof str === 'object') return str;
  try {
    return JSON.parse(str);
  } catch {
    return {};
  }
}

function toOpenAIMessages(system, contents) {
  const messages = [];
  if (system) messages.push({ role: 'system', content: system });
  for (const c of contents || []) {
    const role = c.role === 'model' ? 'assistant' : 'user';
    const parts = c.parts || [];
    const text = parts.filter((p) => p.text).map((p) => p.text).join('\n');
    const fc = parts.find((p) => p.functionCall);
    const fr = parts.find((p) => p.functionResponse);
    const images = parts.filter((p) => p.inlineData);

    if (fc) {
      messages.push({
        role: 'assistant',
        content: text || null,
        tool_calls: [
          {
            id: fc.functionCall.name,
            type: 'function',
            function: { name: fc.functionCall.name, arguments: JSON.stringify(fc.functionCall.args || {}) },
          },
        ],
      });
    } else if (fr) {
      messages.push({
        role: 'tool',
        tool_call_id: fr.functionResponse.name,
        content: JSON.stringify(fr.functionResponse.response || {}),
      });
    } else if (images.length) {
      const content = [{ type: 'text', text: text || '' }];
      for (const im of images) {
        content.push({ type: 'image_url', image_url: { url: `data:${im.inlineData.mimeType};base64,${im.inlineData.data}` } });
      }
      messages.push({ role, content });
    } else {
      messages.push({ role, content: text });
    }
  }
  return messages;
}

const GEMINI_FALLBACKS = [
  'gemini-3.6-flash',
  'gemini-3.7-flash',
  'gemini-3.8-flash',
  'gemini-flash-latest',
  'gemini-3.5-flash',
  'gemini-3.1-flash-lite',
  'gemini-flash-lite-latest',
];

function isRetryableModelError(msg) {
  return /high demand|UNAVAILABLE|overloaded|503|no longer available|not found|404|NOT_FOUND/i.test(String(msg || ''));
}

async function generateGemini({ system, contents, tools, temperature = 0.2, maxTokens = 2048 }) {
  const cfg = await getProviderConfig();
  const chain = [cfg.model, ...GEMINI_FALLBACKS.filter((m) => m !== cfg.model)];
  let lastErr;
  for (const model of chain) {
    try {
      const body = { contents, generationConfig: { temperature, maxOutputTokens: maxTokens } };
      if (system) body.systemInstruction = { parts: [{ text: system }] };
      if (tools && tools.length) body.tools = [{ functionDeclarations: tools }];
      const data = await withRetry(
        () => gemini.generateContent({ model, apiKey: cfg.apiKey, body }),
        { retries: 1, label: `gemini ${model}` }
      );
      return { text: gemini.extractText(data), functionCall: gemini.extractFunctionCall(data), model };
    } catch (e) {
      lastErr = e;
      if (!isRetryableModelError(e.message)) throw e;
      console.warn(`[AgentLLM] model ${model} unavailable (${e.message}); trying next…`);
    }
  }
  throw lastErr;
}

async function generateOpenAI({ system, contents, tools, temperature = 0.2, maxTokens = 2048 }) {
  const cfg = await getProviderConfig();
  if (!cfg.apiKey) throw new Error('No API key configured for the AI provider.');

  let endpoint = (cfg.baseUrl || '').replace(/\/$/, '');
  if (!endpoint.endsWith('/chat/completions')) endpoint = `${endpoint}/chat/completions`;

  const body = {
    model: cfg.model,
    messages: toOpenAIMessages(system, contents),
    temperature,
    max_tokens: maxTokens,
  };
  if (tools && tools.length) {
    body.tools = tools.map((t) => ({ type: 'function', function: { name: t.name, description: t.description, parameters: t.parameters } }));
    body.tool_choice = 'auto';
  }

  const timeoutMs = Number(process.env.AGENT_LLM_TIMEOUT_MS) || 90000;

  const res = await withRetry(
    async () => {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      try {
        const r = await fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${cfg.apiKey}` },
          body: JSON.stringify(body),
          signal: controller.signal,
        });
        if (!r.ok) {
          const err = await r.json().catch(() => ({}));
          throw new Error(err.error?.message || err.detail || `Provider API error (${r.status})`);
        }
        return r;
      } catch (e) {
        if (e.name === 'AbortError') throw new Error(`Provider request timed out after ${Math.round(timeoutMs / 1000)}s`);
        throw e;
      } finally {
        clearTimeout(timer);
      }
    },
    { retries: 2, label: `provider ${cfg.model}` }
  );

  const data = await res.json();
  const msg = data?.choices?.[0]?.message || {};
  const call = (msg.tool_calls || [])[0];
  return {
    text: msg.content || '',
    functionCall: call ? { name: call.function?.name, args: safeJson(call.function?.arguments) } : null,
  };
}

async function generate(opts) {
  const cfg = await getProviderConfig();
  // Trust the resolved provider. (Gemini keys can be `AIza…` or the newer `AQ.…` format,
  // so we must NOT downgrade based on the key prefix.)
  if (cfg.provider === 'gemini') return generateGemini(opts);
  return generateOpenAI(opts);
}

/** Describe an image (screenshot) using the configured provider. */
async function describeImage({ prompt, base64, mimeType }) {
  const contents = [
    { role: 'user', parts: [{ text: prompt }, { inlineData: { mimeType, data: base64 } }] },
  ];
  const out = await generate({ contents, temperature: 0.2, maxTokens: 1024 });
  return out.text;
}

module.exports = { getProviderConfig, resetProvider, generate, describeImage, isGeminiKey };
