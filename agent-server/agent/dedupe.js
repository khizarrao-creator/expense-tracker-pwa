'use strict';

/**
 * Idempotency guard for inbound events.
 *
 * WhatsApp (Baileys) can redeliver the same message more than once (reconnects,
 * retries, multi-device sync). Running a computer-use task twice for one message
 * is dangerous, so we remember recently-seen message ids and drop duplicates.
 *
 * Keys expire after AGENT_DEDUPE_TTL_MS (default 10 minutes) and the map is
 * capped so memory cannot grow unbounded.
 */

const TTL_MS = Number(process.env.AGENT_DEDUPE_TTL_MS) || 10 * 60 * 1000;
const MAX_KEYS = Number(process.env.AGENT_DEDUPE_MAX) || 5000;

const seen = new Map(); // key -> expiresAt

function prune(now = Date.now()) {
  for (const [key, expiresAt] of seen) {
    if (expiresAt > now) break; // Map preserves insertion order
    seen.delete(key);
  }
  while (seen.size > MAX_KEYS) {
    const oldest = seen.keys().next().value;
    seen.delete(oldest);
  }
}

/**
 * Returns true when the key was already seen (i.e. this is a duplicate).
 * Marks the key as seen when it is new.
 */
function isDuplicate(key) {
  if (!key) return false;
  const now = Date.now();
  if (seen.size >= MAX_KEYS) prune(now);
  const expiresAt = seen.get(key);
  if (expiresAt && expiresAt > now) return true;
  seen.set(key, now + TTL_MS);
  return false;
}

function has(key) {
  const expiresAt = seen.get(key);
  return !!expiresAt && expiresAt > Date.now();
}

function forget(key) {
  seen.delete(key);
}

function size() {
  return seen.size;
}

module.exports = { isDuplicate, has, forget, size, TTL_MS };
