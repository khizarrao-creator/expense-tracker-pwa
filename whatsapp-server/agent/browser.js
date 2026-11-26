'use strict';

/**
 * Browser Automation Engine (Playwright).
 * Lazily launches a Chromium browser the first time it is used.
 * Tabs are tracked by id so the agent can manage multiple pages.
 *
 * Headless by default can be overridden with AGENT_BROWSER_HEADLESS=true.
 */

const path = require('path');
const fsp = require('fs/promises');

let chromium = null;
try {
  // eslint-disable-next-line global-require
  ({ chromium } = require('playwright'));
} catch (e) {
  console.warn('[AgentBrowser] playwright not available:', e.message);
}

const HEADLESS = process.env.AGENT_BROWSER_HEADLESS === 'true';
const TMP_DIR = path.join(__dirname, '.tmp');
const NAV_TIMEOUT = 45000;

let browser = null;
let context = null;
const pages = new Map(); // tabId -> page
let tabSeq = 0;

function isAvailable() {
  return !!chromium;
}

function idOf(page) {
  for (const [id, p] of pages.entries()) if (p === page) return id;
  return null;
}

async function launchBrowser() {
  const preferred = process.env.AGENT_BROWSER_CHANNEL;
  const attempts = [];
  if (preferred) attempts.push(preferred);
  attempts.push('chrome', 'msedge', null); // system Chrome → Edge → bundled Chromium
  let lastErr;
  for (const channel of attempts) {
    try {
      const opts = { headless: HEADLESS, args: ['--start-maximized'] };
      if (channel) opts.channel = channel;
      return await chromium.launch(opts);
    } catch (e) {
      lastErr = e;
      console.warn(`[AgentBrowser] launch (${channel || 'bundled'}) failed: ${String(e.message).split('\n')[0]}`);
    }
  }
  throw new Error(`Could not launch a browser: ${lastErr ? String(lastErr.message).split('\n')[0] : 'none found'}`);
}

async function getContext() {
  if (context) return context;
  if (!chromium) throw new Error('Browser automation is unavailable (playwright not installed).');
  browser = await launchBrowser();
  context = await browser.newContext({ viewport: null, acceptDownloads: true });
  context.on('page', (p) => {
    if (!idOf(p)) {
      const id = `tab${++tabSeq}`;
      pages.set(id, p);
      p.on('close', () => pages.delete(id));
    }
  });
  return context;
}

async function newTab(url) {
  const ctx = await getContext();
  const page = await ctx.newPage();
  const id = `tab${++tabSeq}`;
  pages.set(id, page);
  page.on('close', () => pages.delete(id));
  if (url) await page.goto(url, { waitUntil: 'domcontentloaded', timeout: NAV_TIMEOUT });
  return describeTab(id, page);
}

async function describeTab(id, page) {
  return {
    tabId: id,
    url: page.url(),
    title: await page.title().catch(() => ''),
  };
}

function getPage(tabId) {
  if (tabId && pages.has(tabId)) return pages.get(tabId);
  const first = pages.values().next().value;
  if (!first) throw new Error('No open browser tab. Use browser_open to start one.');
  return first;
}

async function open({ url } = {}) {
  if (!pages.size) return newTab(url);
  const page = getPage();
  if (url) await page.goto(url, { waitUntil: 'domcontentloaded', timeout: NAV_TIMEOUT });
  return describeTab(idOf(page), page);
}

async function goto({ url, tabId } = {}) {
  if (!url) throw new Error('url is required');
  const page = getPage(tabId);
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: NAV_TIMEOUT });
  return describeTab(idOf(page), page);
}

async function click({ selector, tabId } = {}) {
  if (!selector) throw new Error('selector is required');
  const page = getPage(tabId);
  await page.click(selector, { timeout: 15000 });
  return { clicked: selector, url: page.url() };
}

async function type({ selector, text = '', tabId, clear = true } = {}) {
  if (!selector) throw new Error('selector is required');
  const page = getPage(tabId);
  if (clear) await page.fill(selector, '');
  await page.fill(selector, String(text));
  return { typed: String(text).length, selector };
}

async function fillForm({ fields = [], tabId } = {}) {
  if (!Array.isArray(fields) || !fields.length) throw new Error('fields[] is required');
  const page = getPage(tabId);
  const done = [];
  for (const f of fields) {
    if (!f || !f.selector) continue;
    await page.fill(f.selector, f.value == null ? '' : String(f.value));
    done.push(f.selector);
  }
  return { filled: done };
}

async function press({ key, tabId } = {}) {
  if (!key) throw new Error('key is required');
  const page = getPage(tabId);
  await page.keyboard.press(key);
  return { pressed: key };
}

async function extract({ selector, tabId, maxChars = 8000 } = {}) {
  const page = getPage(tabId);
  let text;
  if (selector) {
    text = await page.locator(selector).first().innerText({ timeout: 15000 });
  } else {
    text = await page.evaluate(() => document.body ? document.body.innerText : '');
  }
  const truncated = text.length > maxChars;
  return { url: page.url(), title: await page.title().catch(() => ''), truncated, text: truncated ? text.slice(0, maxChars) : text };
}

async function screenshot({ tabId, fullPage = false } = {}) {
  const page = getPage(tabId);
  const buf = await page.screenshot({ fullPage: !!fullPage });
  await fsp.mkdir(TMP_DIR, { recursive: true });
  const file = path.join(TMP_DIR, `browser_${Date.now()}.png`);
  await fsp.writeFile(file, buf);
  return { path: file, url: page.url(), bytes: buf.length };
}

async function tabs() {
  const list = [];
  for (const [id, page] of pages.entries()) {
    list.push({ tabId: id, url: page.url(), title: await page.title().catch(() => '') });
  }
  return { count: list.length, tabs: list };
}

async function switchTab({ tabId } = {}) {
  if (!tabId || !pages.has(tabId)) throw new Error('Unknown tabId');
  const page = pages.get(tabId);
  await page.bringToFront();
  return describeTab(tabId, page);
}

async function closeTab({ tabId } = {}) {
  if (!tabId || !pages.has(tabId)) throw new Error('Unknown tabId');
  await pages.get(tabId).close();
  pages.delete(tabId);
  return { closed: tabId };
}

async function wait({ selector, tabId, timeout = 15000 } = {}) {
  if (!selector) throw new Error('selector is required');
  const page = getPage(tabId);
  await page.waitForSelector(selector, { timeout });
  return { found: selector };
}

async function back({ tabId } = {}) {
  const page = getPage(tabId);
  await page.goBack({ waitUntil: 'domcontentloaded', timeout: NAV_TIMEOUT });
  return describeTab(idOf(page), page);
}

async function forward({ tabId } = {}) {
  const page = getPage(tabId);
  await page.goForward({ waitUntil: 'domcontentloaded', timeout: NAV_TIMEOUT });
  return describeTab(idOf(page), page);
}

async function upload({ selector, filePath, tabId } = {}) {
  if (!selector || !filePath) throw new Error('selector and filePath are required');
  const page = getPage(tabId);
  await page.setInputFiles(selector, filePath);
  return { uploaded: filePath, selector };
}

async function download({ selector, savePath, tabId } = {}) {
  if (!selector || !savePath) throw new Error('selector and savePath are required');
  const page = getPage(tabId);
  const [dl] = await Promise.all([
    page.waitForEvent('download', { timeout: 60000 }),
    page.click(selector, { timeout: 15000 }),
  ]);
  await dl.saveAs(savePath);
  return { downloaded: savePath, suggestedFilename: dl.suggestedFilename() };
}

async function evaluate({ script, tabId } = {}) {
  if (!script) throw new Error('script is required');
  const page = getPage(tabId);
  const result = await page.evaluate(script);
  return { result };
}

async function close() {
  try {
    if (browser) await browser.close();
  } catch {
    /* ignore */
  }
  browser = null;
  context = null;
  pages.clear();
  return { closed: true };
}

module.exports = {
  isAvailable,
  open,
  goto,
  click,
  type,
  fillForm,
  press,
  extract,
  screenshot,
  tabs,
  switchTab,
  closeTab,
  wait,
  back,
  forward,
  upload,
  download,
  evaluate,
  close,
};
