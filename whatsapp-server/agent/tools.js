'use strict';

/**
 * Tool registry for the Computer Use Agent.
 * Each tool: { name, description, parameters (Gemini schema), run(args) }.
 * Risk class is looked up from safety.js by tool name.
 */

const files = require('./files');
const screen = require('./screen');
const input = require('./input');
const browser = require('./browser');
const safety = require('./safety');

/** Injected by the host so the agent can send WhatsApp messages to contacts. */
let whatsappSender = null;
function setWhatsAppSender(fn) {
  whatsappSender = fn;
}

const TOOLS = {
  // ── File system ───────────────────────────────────────────────────────────
  fs_list_dir: {
    description: 'List files and folders in a directory. Defaults to the user home directory.',
    parameters: { type: 'object', properties: { dir: { type: 'string', description: 'Directory path; ~ is allowed.' } } },
    run: (a) => files.listDir(a),
  },
  fs_search: {
    description: 'Search for files by name pattern, extension and/or modified time.',
    parameters: {
      type: 'object',
      properties: {
        dir: { type: 'string', description: 'Root directory to search; ~ allowed.' },
        pattern: { type: 'string', description: 'Regular expression matched against the file name.' },
        ext: { type: 'string', description: 'Comma-separated extensions, e.g. "pdf,xlsx".' },
        modifiedAfter: { type: 'string', description: 'ISO date; only files modified after this.' },
        limit: { type: 'number' },
      },
    },
    run: (a) => files.search(a),
  },
  fs_read_file: {
    description: 'Read a text file (returns metadata for binary files).',
    parameters: { type: 'object', properties: { file: { type: 'string' }, maxChars: { type: 'number' } }, required: ['file'] },
    run: (a) => files.readFile(a),
  },
  fs_stat: {
    description: 'Get metadata (type, size, modified time) for a file or folder.',
    parameters: { type: 'object', properties: { target: { type: 'string' } }, required: ['target'] },
    run: (a) => files.stat(a),
  },
  fs_create_dir: {
    description: 'Create a folder (recursively).',
    parameters: { type: 'object', properties: { dir: { type: 'string' } }, required: ['dir'] },
    run: (a) => files.createDir(a),
  },
  fs_write_file: {
    description: 'Create or overwrite a text file.',
    parameters: { type: 'object', properties: { file: { type: 'string' }, content: { type: 'string' }, append: { type: 'boolean' } }, required: ['file', 'content'] },
    run: (a) => files.writeFile(a),
  },
  fs_rename: {
    description: 'Rename a file or folder.',
    parameters: { type: 'object', properties: { from: { type: 'string' }, to: { type: 'string' } }, required: ['from', 'to'] },
    run: (a) => files.rename(a),
  },
  fs_copy: {
    description: 'Copy a file or folder.',
    parameters: { type: 'object', properties: { from: { type: 'string' }, to: { type: 'string' } }, required: ['from', 'to'] },
    run: (a) => files.copy(a),
  },
  fs_move: {
    description: 'Move a file or folder.',
    parameters: { type: 'object', properties: { from: { type: 'string' }, to: { type: 'string' } }, required: ['from', 'to'] },
    run: (a) => files.move(a),
  },
  fs_delete: {
    description: 'Permanently delete a file or folder.',
    parameters: { type: 'object', properties: { target: { type: 'string' }, recursive: { type: 'boolean', description: 'Required true to delete a non-empty folder.' } }, required: ['target'] },
    run: (a) => files.remove(a),
  },

  // ── Screen ────────────────────────────────────────────────────────────────
  screen_capture: {
    description: 'Capture the current screen and save it as a PNG (returns the file path).',
    parameters: { type: 'object', properties: { display: { type: 'number' } } },
    run: (a) => screen.saveCapture(a || {}),
  },
  screen_describe: {
    description: 'Look at the current screen and describe it, or answer a specific question about what is visible.',
    parameters: { type: 'object', properties: { prompt: { type: 'string' } } },
    run: (a) => screen.describe(a || {}),
  },
  screen_info: {
    description: 'Get the primary screen resolution in pixels (useful before clicking coordinates).',
    parameters: { type: 'object', properties: {} },
    run: () => input.screenSize(),
  },

  // ── Input / apps ──────────────────────────────────────────────────────────
  input_move_mouse: {
    description: 'Move the mouse cursor to absolute screen coordinates (pixels).',
    parameters: { type: 'object', properties: { x: { type: 'number' }, y: { type: 'number' } }, required: ['x', 'y'] },
    run: (a) => input.moveMouse(a),
  },
  input_click: {
    description: 'Click the mouse (left/right/middle; optional double-click).',
    parameters: { type: 'object', properties: { button: { type: 'string' }, double: { type: 'boolean' } } },
    run: (a) => input.click(a || {}),
  },
  input_scroll: {
    description: 'Scroll the mouse wheel up or down.',
    parameters: { type: 'object', properties: { direction: { type: 'string' }, amount: { type: 'number' } } },
    run: (a) => input.scroll(a || {}),
  },
  input_type: {
    description: 'Type text using the keyboard.',
    parameters: { type: 'object', properties: { text: { type: 'string' } }, required: ['text'] },
    run: (a) => input.typeText(a),
  },
  input_key: {
    description: 'Press a key or key combination, e.g. "enter", "ctrl+s", "alt+tab".',
    parameters: { type: 'object', properties: { key: { type: 'string' } }, required: ['key'] },
    run: (a) => input.pressKey(a),
  },
  app_launch: {
    description: 'Launch an application or open a file/folder by command or path (Windows).',
    parameters: { type: 'object', properties: { command: { type: 'string' } }, required: ['command'] },
    run: (a) => input.launchApp(a),
  },

  // ── Browser ───────────────────────────────────────────────────────────────
  browser_open: {
    description: 'Open a URL in the browser (creates a tab if none is open).',
    parameters: { type: 'object', properties: { url: { type: 'string' } } },
    run: (a) => browser.open(a || {}),
  },
  browser_goto: {
    description: 'Navigate the current (or given) browser tab to a URL.',
    parameters: { type: 'object', properties: { url: { type: 'string' }, tabId: { type: 'string' } }, required: ['url'] },
    run: (a) => browser.goto(a),
  },
  browser_click: {
    description: 'Click an element matching a CSS selector.',
    parameters: { type: 'object', properties: { selector: { type: 'string' }, tabId: { type: 'string' } }, required: ['selector'] },
    run: (a) => browser.click(a),
  },
  browser_type: {
    description: 'Type text into an input matching a CSS selector.',
    parameters: { type: 'object', properties: { selector: { type: 'string' }, text: { type: 'string' }, tabId: { type: 'string' } }, required: ['selector', 'text'] },
    run: (a) => browser.type(a),
  },
  browser_fill_form: {
    description: 'Fill multiple form fields at once (array of {selector, value}).',
    parameters: { type: 'object', properties: { fields: { type: 'array', items: { type: 'object', properties: { selector: { type: 'string' }, value: { type: 'string' } }, required: ['selector'] } }, tabId: { type: 'string' } }, required: ['fields'] },
    run: (a) => browser.fillForm(a),
  },
  browser_press: {
    description: 'Press a keyboard key in the page (e.g. "Enter").',
    parameters: { type: 'object', properties: { key: { type: 'string' }, tabId: { type: 'string' } }, required: ['key'] },
    run: (a) => browser.press(a),
  },
  browser_extract: {
    description: 'Extract visible text from the page, or from an element matching a selector.',
    parameters: { type: 'object', properties: { selector: { type: 'string' }, tabId: { type: 'string' }, maxChars: { type: 'number' } } },
    run: (a) => browser.extract(a || {}),
  },
  browser_screenshot: {
    description: 'Take a screenshot of the current page (saves a PNG, returns the path).',
    parameters: { type: 'object', properties: { tabId: { type: 'string' }, fullPage: { type: 'boolean' } } },
    run: (a) => browser.screenshot(a || {}),
  },
  browser_tabs: {
    description: 'List open browser tabs.',
    parameters: { type: 'object', properties: {} },
    run: () => browser.tabs(),
  },
  browser_switch_tab: {
    description: 'Focus a browser tab by id.',
    parameters: { type: 'object', properties: { tabId: { type: 'string' } }, required: ['tabId'] },
    run: (a) => browser.switchTab(a),
  },
  browser_close_tab: {
    description: 'Close a browser tab by id.',
    parameters: { type: 'object', properties: { tabId: { type: 'string' } }, required: ['tabId'] },
    run: (a) => browser.closeTab(a),
  },
  browser_wait: {
    description: 'Wait for an element matching a selector to appear.',
    parameters: { type: 'object', properties: { selector: { type: 'string' }, tabId: { type: 'string' }, timeout: { type: 'number' } }, required: ['selector'] },
    run: (a) => browser.wait(a),
  },
  browser_back: {
    description: 'Go back in the current browser tab.',
    parameters: { type: 'object', properties: { tabId: { type: 'string' } } },
    run: (a) => browser.back(a || {}),
  },
  browser_forward: {
    description: 'Go forward in the current browser tab.',
    parameters: { type: 'object', properties: { tabId: { type: 'string' } } },
    run: (a) => browser.forward(a || {}),
  },
  browser_upload: {
    description: 'Upload a file to a file input matching a selector.',
    parameters: { type: 'object', properties: { selector: { type: 'string' }, filePath: { type: 'string' }, tabId: { type: 'string' } }, required: ['selector', 'filePath'] },
    run: (a) => browser.upload(a),
  },
  browser_download: {
    description: 'Click a link/button and save the downloaded file to savePath.',
    parameters: { type: 'object', properties: { selector: { type: 'string' }, savePath: { type: 'string' }, tabId: { type: 'string' } }, required: ['selector', 'savePath'] },
    run: (a) => browser.download(a),
  },
  browser_eval: {
    description: 'Run arbitrary JavaScript in the page (advanced).',
    parameters: { type: 'object', properties: { script: { type: 'string' }, tabId: { type: 'string' } }, required: ['script'] },
    run: (a) => browser.evaluate(a),
  },
  browser_close: {
    description: 'Close the browser.',
    parameters: { type: 'object', properties: {} },
    run: () => browser.close(),
  },

  // ── WhatsApp ──────────────────────────────────────────────────────────────
  whatsapp_send: {
    description: 'Send a WhatsApp message to a contact by name or phone number, from the linked account.',
    parameters: {
      type: 'object',
      properties: {
        to: { type: 'string', description: 'Contact name (e.g. "Shairq Masood") or phone number with country code.' },
        message: { type: 'string', description: 'The message text to send.' },
      },
      required: ['to', 'message'],
    },
    run: (a, ctx) => {
      if (!whatsappSender) throw new Error('WhatsApp sending is unavailable.');
      return whatsappSender(ctx?.accountId, a.to, a.message);
    },
  },
};

for (const [name, tool] of Object.entries(TOOLS)) tool.name = name;

function declarations({ includeRestricted = true } = {}) {
  return Object.values(TOOLS)
    .filter((t) => includeRestricted || safety.riskOf(t.name) !== safety.C)
    .map((t) => ({ name: t.name, description: t.description, parameters: t.parameters }));
}

function get(name) {
  return TOOLS[name] || null;
}

function capabilities() {
  return {
    fileSystem: true,
    screen: screen.isAvailable(),
    input: input.isAvailable(),
    browser: browser.isAvailable(),
  };
}

module.exports = { TOOLS, declarations, get, capabilities, setWhatsAppSender };
