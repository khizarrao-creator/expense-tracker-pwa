'use strict';

/**
 * Computer Action Engine — mouse, keyboard and app launching.
 * Uses @nut-tree-fork/nut-js (prebuilt binaries, no compiler needed).
 * The module is optional so the server still boots without it.
 */

const { exec } = require('child_process');

let nut = null;
try {
  // eslint-disable-next-line global-require
  nut = require('@nut-tree-fork/nut-js');
} catch (e) {
  console.warn('[AgentInput] @nut-tree-fork/nut-js not available:', e.message);
}

function isAvailable() {
  return !!nut;
}

function ensure() {
  if (!nut) throw new Error('Input control is unavailable (@nut-tree-fork/nut-js not installed).');
  return nut;
}

async function screenSize() {
  const { screen } = ensure();
  const width = await screen.width();
  const height = await screen.height();
  return { width, height };
}

async function moveMouse({ x, y } = {}) {
  const { mouse, Point } = ensure();
  await mouse.setPosition(new Point(Math.round(Number(x) || 0), Math.round(Number(y) || 0)));
  return { moved: { x: Number(x), y: Number(y) } };
}

async function click({ button = 'left', double = false } = {}) {
  const { mouse, Button } = ensure();
  const btn =
    button === 'right' ? Button.RIGHT : button === 'middle' ? Button.MIDDLE : Button.LEFT;
  if (double) await mouse.doubleClick(btn);
  else await mouse.click(btn);
  return { clicked: button, double: !!double };
}

async function scroll({ direction = 'down', amount = 3 } = {}) {
  const { mouse } = ensure();
  const n = Math.abs(Number(amount) || 3);
  if (direction === 'up') await mouse.scrollUp(n);
  else await mouse.scrollDown(n);
  return { scrolled: direction, amount: n };
}

async function typeText({ text = '' } = {}) {
  const { keyboard } = ensure();
  await keyboard.type(String(text));
  return { typed: String(text).length };
}

const KEY_MAP = {
  ctrl: 'LeftControl',
  control: 'LeftControl',
  shift: 'LeftShift',
  alt: 'LeftAlt',
  win: 'LeftSuper',
  meta: 'LeftSuper',
  enter: 'Enter',
  return: 'Enter',
  tab: 'Tab',
  esc: 'Escape',
  escape: 'Escape',
  space: 'Space',
  backspace: 'Backspace',
  delete: 'Delete',
  del: 'Delete',
  up: 'Up',
  down: 'Down',
  left: 'Left',
  right: 'Right',
  home: 'Home',
  end: 'End',
  pageup: 'PageUp',
  pagedown: 'PageDown',
  capslock: 'CapsLock',
};

function resolveKey(Key, token) {
  const t = String(token || '').trim().toLowerCase();
  if (!t) return undefined;
  if (KEY_MAP[t]) return Key[KEY_MAP[t]];
  if (t.startsWith('f') && /^f\d{1,2}$/.test(t)) return Key[t.toUpperCase()];
  if (t.length === 1) return Key[t.toUpperCase()];
  return undefined;
}

async function pressKey({ key = '' } = {}) {
  const { keyboard, Key } = ensure();
  const parts = String(key)
    .toLowerCase()
    .split('+')
    .map((s) => s.trim())
    .filter(Boolean);
  if (!parts.length) throw new Error('key is required');
  const resolved = parts.map((p) => resolveKey(Key, p));
  if (resolved.some((k) => k === undefined)) throw new Error(`Unknown key: ${key}`);
  await keyboard.pressKey(...resolved);
  await keyboard.releaseKey(...resolved);
  return { pressed: key };
}

function launchApp({ command } = {}) {
  if (!command) throw new Error('command is required');
  return new Promise((resolve, reject) => {
    exec(`start "" ${command}`, { shell: 'cmd.exe' }, (err) => {
      if (err) reject(err);
      else resolve({ launched: command });
    });
  });
}

module.exports = {
  isAvailable,
  screenSize,
  moveMouse,
  click,
  scroll,
  typeText,
  pressKey,
  launchApp,
};
