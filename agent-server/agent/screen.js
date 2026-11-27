'use strict';

/**
 * Screen Observation Engine.
 * Captures the screen and uses Gemini vision to describe / answer questions.
 * `screenshot-desktop` is optional so the server still boots without it.
 */

const path = require('path');
const fsp = require('fs/promises');
const llm = require('./llm');

let screenshot = null;
try {
  // eslint-disable-next-line global-require
  screenshot = require('screenshot-desktop');
} catch (e) {
  console.warn('[AgentScreen] screenshot-desktop not available:', e.message);
}

const TMP_DIR = path.join(__dirname, '.tmp');

function isAvailable() {
  return !!screenshot;
}

async function capture({ display } = {}) {
  if (!screenshot) throw new Error('Screen capture is unavailable (screenshot-desktop not installed).');
  const opts = {};
  if (display !== undefined && display !== null) opts.screen = Number(display);
  return screenshot(opts); // Buffer (PNG)
}

async function captureBase64(opts) {
  const buf = await capture(opts);
  return { base64: buf.toString('base64'), mimeType: 'image/png' };
}

async function saveCapture({ display } = {}) {
  const buf = await capture({ display });
  await fsp.mkdir(TMP_DIR, { recursive: true });
  const file = path.join(TMP_DIR, `screen_${Date.now()}.png`);
  await fsp.writeFile(file, buf);
  return { path: file, bytes: buf.length };
}

async function describe({ prompt = 'Describe what is currently on screen.', display } = {}) {
  const { base64, mimeType } = await captureBase64({ display });
  const description = await llm.describeImage({ prompt, base64, mimeType });
  return { description };
}

async function listDisplays() {
  if (!screenshot || !screenshot.listDisplays) return [];
  try {
    return await screenshot.listDisplays();
  } catch {
    return [];
  }
}

module.exports = { isAvailable, capture, captureBase64, saveCapture, describe, listDisplays };
