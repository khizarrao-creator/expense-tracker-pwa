'use strict';

/**
 * Desktop / application automation for the Computer Use Agent (Phase 7).
 *
 * Targets Windows desktop apps: VS Code, Office (Word/Excel/PowerPoint/Outlook),
 * File Explorer and PowerShell. Commands run detached so the bridge is never
 * blocked, and outputs are truncated to keep LLM prompts small.
 *
 * The module is dependency-free (child_process only) and safe to require on any
 * platform — non-Windows callers receive a clear error instead of crashing.
 */

const { spawn } = require('child_process');
const os = require('os');
const path = require('path');

const IS_WINDOWS = process.platform === 'win32';

function ensureWindows() {
  if (!IS_WINDOWS) throw new Error('Desktop automation is only supported on Windows.');
}

/** Expand `~` and environment variables, then resolve to an absolute path. */
function expandPath(p) {
  let out = String(p || '').trim();
  if (!out) return out;
  if (out === '~') out = os.homedir();
  else if (out.startsWith('~')) out = path.join(os.homedir(), out.slice(1));
  out = out.replace(/%([^%]+)%/g, (m, name) => process.env[name] ?? m);
  return path.resolve(out);
}

/** Quote a value for a single-quoted PowerShell string literal. */
function psQuote(value) {
  return `'${String(value).replace(/'/g, "''")}'`;
}

function truncate(text, max) {
  const s = String(text || '');
  return s.length > max ? `${s.slice(0, max)}\n…[truncated ${s.length - max} chars]` : s;
}

/** Run a PowerShell script and capture stdout/stderr. Args are passed as argv,
 *  so no shell-level quoting of the caller's data is required. */
function runPowerShell(script, { timeoutMs = 30000 } = {}) {
  return new Promise((resolve) => {
    let child;
    try {
      child = spawn(
        'powershell.exe',
        ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', script],
        { windowsHide: true }
      );
    } catch (e) {
      resolve({ stdout: '', stderr: e.message, code: -1 });
      return;
    }
    let stdout = '';
    let stderr = '';
    const timer = setTimeout(() => {
      try { child.kill(); } catch { /* ignore */ }
    }, Math.max(1000, Number(timeoutMs) || 30000));
    child.stdout.on('data', (d) => { stdout += d.toString(); });
    child.stderr.on('data', (d) => { stderr += d.toString(); });
    child.on('error', (e) => {
      clearTimeout(timer);
      resolve({ stdout: stdout.trim(), stderr: `${stderr}${e.message}`.trim(), code: -1 });
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      resolve({ stdout: stdout.trim(), stderr: stderr.trim(), code: typeof code === 'number' ? code : -1 });
    });
  });
}

/** Launch an external program detached (through cmd.exe so `.cmd` shims such as
 *  VS Code's `code` resolve correctly). */
function launchExternal(exe, args = []) {
  ensureWindows();
  return new Promise((resolve, reject) => {
    let child;
    try {
      child = spawn('cmd.exe', ['/c', exe, ...args], {
        detached: true,
        stdio: 'ignore',
        windowsHide: true,
        cwd: os.homedir(),
      });
    } catch (e) {
      reject(e);
      return;
    }
    child.once('error', reject);
    child.once('spawn', () => {
      child.unref();
      resolve({ launched: exe, args });
    });
  });
}

/** Run an arbitrary PowerShell command and return its output (risk class C). */
async function shellRun({ command, cwd, timeoutMs } = {}) {
  ensureWindows();
  if (!command || !String(command).trim()) throw new Error('command is required');
  const script = cwd
    ? `Set-Location -LiteralPath ${psQuote(expandPath(cwd))}; ${command}`
    : String(command);
  const { stdout, stderr, code } = await runPowerShell(script, { timeoutMs });
  return { exitCode: code, stdout: truncate(stdout, 8000), stderr: truncate(stderr, 4000) };
}

/** List visible top-level windows (title / process / pid). Risk class A. */
async function windowList() {
  ensureWindows();
  const script =
    "Get-Process | Where-Object { $_.MainWindowTitle -ne '' } | " +
    'Select-Object Id, ProcessName, MainWindowTitle | ConvertTo-Json -Compress';
  const { stdout, stderr, code } = await runPowerShell(script, { timeoutMs: 20000 });
  if (code !== 0 && !stdout) return { windows: [], error: truncate(stderr, 500) };
  let parsed;
  try {
    parsed = JSON.parse(stdout || '[]');
  } catch {
    return { windows: [], error: 'Could not parse window list.' };
  }
  const arr = Array.isArray(parsed) ? parsed : [parsed];
  const windows = arr.map((w) => ({
    pid: w.Id,
    process: w.ProcessName,
    title: w.MainWindowTitle,
  }));
  return { count: windows.length, windows };
}

/** Bring a window to the foreground by matching part of its title. Risk class B. */
async function windowFocus({ title } = {}) {
  ensureWindows();
  if (!title || !String(title).trim()) throw new Error('title is required');
  const script = [
    '$sig = @"',
    'using System;',
    'using System.Runtime.InteropServices;',
    'public class AgentWin {',
    '  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr hWnd);',
    '  [DllImport("user32.dll")] public static extern bool ShowWindowAsync(IntPtr hWnd, int nCmdShow);',
    '  [DllImport("user32.dll")] public static extern bool IsIconic(IntPtr hWnd);',
    '}',
    '"@',
    'Add-Type $sig',
    `$p = Get-Process | Where-Object { $_.MainWindowTitle -like ${psQuote(`*${title}*`)} } | Select-Object -First 1`,
    "if (-not $p) { Write-Output 'AGENT_NOT_FOUND'; exit 0 }",
    'if ([AgentWin]::IsIconic($p.MainWindowHandle)) { [AgentWin]::ShowWindowAsync($p.MainWindowHandle, 9) | Out-Null }',
    'else { [AgentWin]::ShowWindowAsync($p.MainWindowHandle, 5) | Out-Null }',
    '[AgentWin]::SetForegroundWindow($p.MainWindowHandle) | Out-Null',
    'Write-Output ("AGENT_FOCUSED:" + $p.MainWindowTitle)',
  ].join('\n');
  const { stdout, stderr } = await runPowerShell(script, { timeoutMs: 20000 });
  if (stdout.includes('AGENT_NOT_FOUND')) return { focused: false, title, error: `No window matching "${title}".` };
  if (stdout.includes('AGENT_FOCUSED:')) {
    return { focused: true, title: stdout.split('AGENT_FOCUSED:')[1].trim() };
  }
  return { focused: false, title, error: truncate(stderr, 500) || 'Could not focus window.' };
}

/** Friendly app aliases -> Windows executables. */
const APP_ALIASES = {
  code: 'code',
  vscode: 'code',
  'vs code': 'code',
  explorer: 'explorer.exe',
  files: 'explorer.exe',
  notepad: 'notepad.exe',
  word: 'winword.exe',
  excel: 'excel.exe',
  powerpoint: 'powerpnt.exe',
  ppt: 'powerpnt.exe',
  outlook: 'outlook.exe',
  powershell: 'powershell.exe',
  ps: 'powershell.exe',
  terminal: 'wt.exe',
  cmd: 'cmd.exe',
  chrome: 'chrome.exe',
  edge: 'msedge.exe',
  paint: 'mspaint.exe',
  calculator: 'calc.exe',
};

/** Open a file or folder in a named app (code, excel, explorer, …). Risk class B. */
async function openInApp({ path: target, app } = {}) {
  ensureWindows();
  if (!target) throw new Error('path is required');
  const key = String(app || '').toLowerCase().trim();
  const exe = APP_ALIASES[key] || key;
  if (!exe) throw new Error('app is required (e.g. code, explorer, excel, word, powershell)');
  const full = expandPath(target);
  await launchExternal(exe, [full]);
  return { opened: full, app: exe };
}

/** Open a file or folder in VS Code, optionally jumping to a line. Risk class B. */
async function vscodeOpen({ path: target, line } = {}) {
  ensureWindows();
  if (!target) throw new Error('path is required');
  const full = expandPath(target);
  const args = line ? ['-g', `${full}:${Number(line) || 1}`] : [full];
  await launchExternal('code', args);
  return { opened: full, app: 'code', line: line ? Number(line) : undefined };
}

module.exports = {
  isAvailable: () => IS_WINDOWS,
  shellRun,
  windowList,
  windowFocus,
  openInApp,
  vscodeOpen,
};
