'use strict';

/**
 * Permission & Safety Manager.
 *
 * Risk classes (per spec):
 *   A - low risk (read / inspect / open / search) -> auto-run for authorized senders.
 *   B - consequential (write, send, submit, install, run commands) -> require confirmation.
 *   C - restricted (delete, financial, security, credential exposure) -> require confirmation.
 */

const A = 'A';
const B = 'B';
const C = 'C';

const TOOL_RISK = {
  // File system reads
  fs_list_dir: A,
  fs_search: A,
  fs_read_file: A,
  fs_stat: A,
  // File system writes
  fs_create_dir: B,
  fs_write_file: B,
  fs_rename: B,
  fs_copy: B,
  fs_move: B,
  // File system destructive
  fs_delete: C,
  // Screen
  screen_capture: A,
  screen_describe: A,
  // Input / apps
  input_move_mouse: B,
  input_click: B,
  input_type: B,
  input_key: B,
  input_scroll: B,
  app_launch: B,
  // Browser
  browser_open: A,
  browser_goto: A,
  browser_tabs: A,
  browser_switch_tab: A,
  browser_close_tab: A,
  browser_wait: A,
  browser_extract: A,
  browser_screenshot: A,
  browser_back: A,
  browser_forward: A,
  browser_close: A,
  browser_click: B,
  browser_type: B,
  browser_fill_form: B,
  browser_press: B,
  browser_upload: B,
  browser_download: B,
  browser_eval: C,
  // WhatsApp
  whatsapp_send: B,
  // Meta
  finish: A,
  ask_user: A,
};

function riskOf(toolName) {
  return TOOL_RISK[toolName] || B; // unknown tools default to requiring confirmation
}

const CONFIRM_POLICIES = {
  confirm_all_except_reads: (risk) => risk !== A,
  confirm_only_destructive: (risk) => risk === C,
  confirm_everything: () => true,
};

function requiresConfirmation(toolName, policy = 'confirm_all_except_reads') {
  const check = CONFIRM_POLICIES[policy] || CONFIRM_POLICIES.confirm_all_except_reads;
  return check(riskOf(toolName));
}

/** Pending confirmations, keyed by `${accountId}:${senderDigits}`. */
const pending = new Map();

function makeConfirmation(entry) {
  const key = `${entry.accountId}:${entry.sender}`;
  const record = { ...entry, key, createdAt: Date.now() };
  pending.set(key, record);
  return record;
}

function peekConfirmation(accountId, sender) {
  return pending.get(`${accountId}:${sender}`) || null;
}

function takeConfirmation(accountId, sender) {
  const key = `${accountId}:${sender}`;
  const entry = pending.get(key) || null;
  if (entry) pending.delete(key);
  return entry;
}

function clearConfirmation(accountId, sender) {
  pending.delete(`${accountId}:${sender}`);
}

const AFFIRMATIVE = /^(y|yes|yeah|yep|ok|okay|sure|confirm|confirmed|go ahead|do it|proceed|approve|approved)\b/i;
const NEGATIVE = /^(n|no|nope|cancel|stop|abort|don'?t|dont|negative|reject|rejected)\b/i;

function parseConfirmation(text) {
  const t = String(text || '').trim();
  if (AFFIRMATIVE.test(t)) return 'yes';
  if (NEGATIVE.test(t)) return 'no';
  return 'unknown';
}

module.exports = {
  A,
  B,
  C,
  TOOL_RISK,
  riskOf,
  requiresConfirmation,
  makeConfirmation,
  peekConfirmation,
  takeConfirmation,
  clearConfirmation,
  parseConfirmation,
};
