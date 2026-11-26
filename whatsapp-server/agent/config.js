'use strict';

/**
 * Per-account AI Agent configuration, persisted in Firestore and cached in memory.
 * Collection: whatsapp_agent_config/{accountId}
 *
 * Shape:
 * {
 *   accountId, enabled,
 *   authorizedNumbers: [{ id, phone, label, enabled, addedAt }],
 *   permissions: { fileSystem, screen, input, browser, confirmationPolicy },
 *   updatedAt
 * }
 */

const DEFAULT_PERMISSIONS = {
  fileSystem: true,
  screen: true,
  input: true,
  browser: true,
  confirmationPolicy: 'confirm_all_except_reads',
};

const cache = new Map();

function defaultConfig(accountId) {
  return {
    accountId,
    enabled: false,
    authorizedNumbers: [],
    permissions: { ...DEFAULT_PERMISSIONS },
    updatedAt: new Date().toISOString(),
  };
}

function normalizeNumber(n) {
  if (!n) return null;
  const phone = String(n.phone || '').trim();
  if (!phone) return null;
  return {
    id: String(n.id || phone),
    phone,
    label: String(n.label || ''),
    enabled: n.enabled !== false,
    addedAt: n.addedAt || new Date().toISOString(),
  };
}

function normalize(raw, accountId) {
  const base = defaultConfig(accountId);
  if (!raw) return base;
  return {
    accountId,
    enabled: !!raw.enabled,
    authorizedNumbers: Array.isArray(raw.authorizedNumbers)
      ? raw.authorizedNumbers.map(normalizeNumber).filter(Boolean)
      : [],
    permissions: { ...DEFAULT_PERMISSIONS, ...(raw.permissions || {}) },
    updatedAt: raw.updatedAt || base.updatedAt,
  };
}

function digitsOnly(value) {
  return String(value || '').replace(/\D/g, '');
}

async function getConfig(db, accountId) {
  if (cache.has(accountId)) return cache.get(accountId);
  if (!db) return defaultConfig(accountId);
  try {
    const snap = await db.collection('whatsapp_agent_config').doc(accountId).get();
    const cfg = normalize(snap.exists ? snap.data() : null, accountId);
    cache.set(accountId, cfg);
    return cfg;
  } catch (e) {
    console.warn('[AgentConfig] load failed:', e.message);
    return defaultConfig(accountId);
  }
}

async function saveConfig(db, accountId, patch) {
  const current = await getConfig(db, accountId);
  const next = normalize({ ...current, ...patch, accountId }, accountId);
  next.updatedAt = new Date().toISOString();
  cache.set(accountId, next);
  if (db) {
    await db.collection('whatsapp_agent_config').doc(accountId).set(next, { merge: true });
  }
  return next;
}

async function listConfigs(db, accountIds) {
  const out = [];
  for (const id of accountIds) out.push(await getConfig(db, id));
  return out;
}

function invalidate(accountId) {
  if (accountId) cache.delete(accountId);
  else cache.clear();
}

/**
 * Authorization check against the ACTUAL WhatsApp sender (remoteJid), not any
 * phone number supplied inside the message body.
 */
async function isAuthorized(db, accountId, senderJid) {
  const cfg = await getConfig(db, accountId);
  if (!cfg.enabled) return { authorized: false, reason: 'agent_disabled', config: cfg };
  const senderDigits = digitsOnly(senderJid);
  if (!senderDigits) return { authorized: false, reason: 'no_sender', config: cfg };
  const match = cfg.authorizedNumbers.find((n) => n.enabled && digitsOnly(n.phone) === senderDigits);
  if (!match) return { authorized: false, reason: 'not_authorized', config: cfg };
  return { authorized: true, config: cfg, number: match };
}

module.exports = {
  DEFAULT_PERMISSIONS,
  defaultConfig,
  getConfig,
  saveConfig,
  listConfigs,
  invalidate,
  isAuthorized,
  digitsOnly,
};
