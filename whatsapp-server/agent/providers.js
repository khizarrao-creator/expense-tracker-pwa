'use strict';

/**
 * AI provider registry for the agent + app.
 * Stored as a single Firestore doc so no indexes are required:
 *   ai_providers/config
 *   { providers: [{ id, name, baseUrl, apiKey, models:[{id,name}] }],
 *     activeProviderId, activeModelId, updatedAt }
 */

const fs = require('fs');
const path = require('path');
const os = require('os');

const COLLECTION = 'ai_providers';
const DOC_ID = 'config';

let DB = null;
function setDb(db) {
  DB = db;
}

const cache = { data: null, at: 0 };
const TTL = 4000;

function defaultState() {
  return { providers: [], activeProviderId: null, activeModelId: null, updatedAt: new Date().toISOString() };
}

function slug(v) {
  return String(v || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function normalizeModel(m) {
  if (!m) return null;
  if (typeof m === 'string') return { id: m.trim(), name: m.trim() };
  const id = String(m.id || m.name || '').trim();
  if (!id) return null;
  return { id, name: String(m.name || id) };
}

function normalizeProvider(p) {
  if (!p) return null;
  const id = slug(p.id || p.name);
  if (!id) return null;
  return {
    id,
    name: String(p.name || id),
    baseUrl: String(p.baseUrl || '').trim(),
    apiKey: String(p.apiKey || '').trim(),
    models: Array.isArray(p.models) ? p.models.map(normalizeModel).filter(Boolean) : [],
  };
}

async function load() {
  if (cache.data && Date.now() - cache.at < TTL) return cache.data;
  let data = defaultState();
  if (DB) {
    try {
      const snap = await DB.collection(COLLECTION).doc(DOC_ID).get();
      if (snap.exists) {
        const raw = snap.data();
        data = {
          providers: (raw.providers || []).map(normalizeProvider).filter(Boolean),
          activeProviderId: raw.activeProviderId || null,
          activeModelId: raw.activeModelId || null,
          updatedAt: raw.updatedAt || new Date().toISOString(),
        };
      }
    } catch (e) {
      console.warn('[AgentProviders] load failed:', e.message);
    }
  }
  cache.data = data;
  cache.at = Date.now();
  return data;
}

async function save(state) {
  const next = { ...state, updatedAt: new Date().toISOString() };
  cache.data = next;
  cache.at = Date.now();
  if (DB) {
    await DB.collection(COLLECTION).doc(DOC_ID).set(next, { merge: true });
  }
  return next;
}

function invalidate() {
  cache.data = null;
}

async function getActive() {
  const state = await load();
  const provider = state.providers.find((p) => p.id === state.activeProviderId) || null;
  if (!provider) return null;
  const model = state.activeModelId || provider.models[0]?.id || null;
  return { provider, model };
}

/** Parse an opencode.jsonc file (JSON with comments) into providers. */
function parseOpencodeConfig(filePath) {
  const raw = fs.readFileSync(filePath, 'utf8');
  const stripped = raw
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1');
  const json = JSON.parse(stripped);
  const providers = [];
  const src = json.provider || {};
  for (const [pid, pconf] of Object.entries(src)) {
    const options = pconf.options || {};
    const models = Object.keys(pconf.models || {}).map((mid) => ({
      id: mid,
      name: pconf.models[mid].name || mid,
    }));
    providers.push(
      normalizeProvider({
        id: pid,
        name: pconf.name || pid,
        baseUrl: options.baseURL || options.baseUrl || '',
        apiKey: options.apiKey || '',
        models,
      })
    );
  }
  let activeProviderId = null;
  let activeModelId = null;
  if (typeof json.model === 'string' && json.model.includes('/')) {
    const [a, b] = json.model.split('/');
    activeProviderId = slug(a);
    activeModelId = b;
  }
  return { providers: providers.filter(Boolean), activeProviderId, activeModelId };
}

function defaultOpencodePath() {
  return path.join(os.homedir(), '.config', 'opencode', 'opencode.jsonc');
}

module.exports = {
  setDb,
  load,
  save,
  getActive,
  invalidate,
  normalizeProvider,
  parseOpencodeConfig,
  defaultOpencodePath,
  defaultState,
};
