'use strict';

/**
 * Per-sender conversation memory for follow-up context.
 *
 * Each authorized sender gets a compact rolling transcript so follow-ups like
 * "now open it" or "do the same in Downloads" resolve against the previous
 * exchange. Stored in Firestore (agent_context/{accountId}_{sender}) with an
 * in-memory cache and a TTL so stale context does not leak into new sessions.
 *
 * Only user instructions and assistant summaries are kept — not raw tool output
 * — to keep the transcript small and the prompt cheap.
 */

const logger = require('./logger').make('context');

const MAX_TURNS = Number(process.env.AGENT_CONTEXT_MAX_TURNS) || 12;
const TTL_MS = Number(process.env.AGENT_CONTEXT_TTL_MS) || 60 * 60 * 1000; // 1 hour

const cache = new Map(); // key -> { turns, updatedAt }

const keyOf = (accountId, sender) => `${accountId}:${sender}`;
const docId = (accountId, sender) => `${accountId}_${sender}`.replace(/[^a-zA-Z0-9_-]/g, '_');

function prune(turns, now = Date.now()) {
  const cutoff = now - TTL_MS;
  const kept = (turns || []).filter((turn) => {
    const at = turn && turn.at ? new Date(turn.at).getTime() : 0;
    return at >= cutoff;
  });
  return kept.slice(-MAX_TURNS);
}

async function load(db, accountId, sender) {
  const key = keyOf(accountId, sender);
  if (cache.has(key)) {
    const entry = cache.get(key);
    const turns = prune(entry.turns);
    if (turns.length !== entry.turns.length) cache.set(key, { turns, updatedAt: entry.updatedAt });
    return turns;
  }
  if (!db) return [];
  try {
    const snap = await db.collection('agent_context').doc(docId(accountId, sender)).get();
    const turns = snap.exists ? prune(snap.data().turns || []) : [];
    cache.set(key, { turns, updatedAt: new Date().toISOString() });
    return turns;
  } catch (err) {
    logger.warn('load failed', { error: err.message, accountId, sender });
    return [];
  }
}

async function save(db, accountId, sender, turns) {
  const key = keyOf(accountId, sender);
  const clean = prune(turns);
  cache.set(key, { turns: clean, updatedAt: new Date().toISOString() });
  if (!db) return clean;
  try {
    await db
      .collection('agent_context')
      .doc(docId(accountId, sender))
      .set({ accountId, sender, turns: clean, updatedAt: new Date().toISOString() }, { merge: true });
  } catch (err) {
    logger.warn('save failed', { error: err.message, accountId, sender });
  }
  return clean;
}

async function append(db, accountId, sender, role, text) {
  if (!text) return load(db, accountId, sender);
  const turns = await load(db, accountId, sender);
  turns.push({ role, text: String(text).slice(0, 2000), at: new Date().toISOString() });
  return save(db, accountId, sender, turns);
}

async function clear(db, accountId, sender) {
  cache.delete(keyOf(accountId, sender));
  if (!db) return;
  try {
    await db.collection('agent_context').doc(docId(accountId, sender)).delete();
  } catch (err) {
    logger.warn('clear failed', { error: err.message, accountId, sender });
  }
}

/**
 * Convert stored turns into the neutral message format the orchestrator uses.
 * Keeps only user/assistant text turns.
 */
function toHistory(turns) {
  return (turns || [])
    .filter((turn) => turn && turn.text && (turn.role === 'user' || turn.role === 'assistant' || turn.role === 'model'))
    .map((turn) => ({ role: turn.role === 'assistant' ? 'model' : turn.role, text: turn.text }));
}

module.exports = { load, save, append, clear, toHistory, MAX_TURNS, TTL_MS };
