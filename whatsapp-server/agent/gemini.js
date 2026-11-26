'use strict';

/**
 * Minimal Gemini client used by the Computer Use Agent runtime.
 * Resolves the API key the same way the bridge's /api/ai/chat proxy does,
 * so it works out of the box with the existing server-side key.
 */

const BASE = 'https://generativelanguage.googleapis.com/v1beta/models';

function resolveApiKey() {
  return (
    process.env.GEMINI_API_KEY ||
    process.env.VITE_GEMINI_API_KEY ||
    process.env.AI_FALLBACK_API_KEY ||
    null
  );
}

async function generateContent({ model = 'gemini-2.5-flash', apiKey, body, timeoutMs = 90000 }) {
  const key = apiKey || resolveApiKey();
  if (!key) throw new Error('Gemini API key is not configured on the server.');
  const url = `${BASE}/${model}:generateContent?key=${key}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let res;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
  } catch (e) {
    if (e.name === 'AbortError') throw new Error(`Gemini request timed out after ${Math.round(timeoutMs / 1000)}s`);
    throw e;
  } finally {
    clearTimeout(timer);
  }
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error?.message || `Gemini API error (${res.status})`);
  }
  return res.json();
}

function extractText(data) {
  const parts = data?.candidates?.[0]?.content?.parts || [];
  return parts.map((p) => p.text).filter(Boolean).join('\n').trim();
}

function extractFunctionCall(data) {
  const parts = data?.candidates?.[0]?.content?.parts || [];
  const part = parts.find((p) => p.functionCall);
  return part ? part.functionCall : null;
}

module.exports = { resolveApiKey, generateContent, extractText, extractFunctionCall };
