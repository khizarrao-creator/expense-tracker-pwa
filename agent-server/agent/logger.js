'use strict';

/**
 * Minimal structured logger for the agent runtime.
 *
 * Levels: error < warn < info < debug  (set with AGENT_LOG_LEVEL).
 * Every line is timestamped and scoped so task-related logs are easy to trace.
 */

const LEVELS = { error: 0, warn: 1, info: 2, debug: 3 };
const threshold = LEVELS[String(process.env.AGENT_LOG_LEVEL || 'info').toLowerCase()] ?? LEVELS.info;

function make(scope = 'agent') {
  function emit(level, message, meta) {
    if (LEVELS[level] > threshold) return;
    const line = `[${new Date().toISOString()}] [${level.toUpperCase()}] [${scope}] ${message}`;
    const args = meta && typeof meta === 'object' && Object.keys(meta).length ? [line, meta] : [line];
    if (level === 'error') console.error(...args);
    else if (level === 'warn') console.warn(...args);
    else console.log(...args);
  }

  return {
    error: (message, meta) => emit('error', message, meta),
    warn: (message, meta) => emit('warn', message, meta),
    info: (message, meta) => emit('info', message, meta),
    debug: (message, meta) => emit('debug', message, meta),
    child: (childScope) => make(`${scope}:${childScope}`),
  };
}

module.exports = { make, logger: make('agent'), LEVELS };
