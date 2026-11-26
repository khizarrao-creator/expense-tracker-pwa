'use strict';

/**
 * Retry helper with exponential backoff + jitter for transient failures.
 *
 * Only transient errors are retried. Anything else fails fast so real bugs are
 * not masked by repeated attempts.
 */

const logger = require('./logger').make('retry');

const TRANSIENT =
  /high demand|overloaded|rate limit|too many requests|temporar|unavailable|timeout|timed out|ECONNRESET|ECONNREFUSED|ETIMEDOUT|EAI_AGAIN|ENOTFOUND|socket hang up|fetch failed|network|\b429\b|\b500\b|\b502\b|\b503\b|\b504\b/i;

function isTransient(err) {
  const msg = String((err && err.message) || err || '');
  return TRANSIENT.test(msg);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * @param {Function} fn  async function; receives the attempt number (0-based)
 * @param {Object} opts
 * @param {number} opts.retries   additional attempts after the first (default 2)
 * @param {number} opts.baseMs    first backoff delay (default 400)
 * @param {number} opts.maxMs     maximum backoff delay (default 8000)
 * @param {string} opts.label     used in logs
 * @param {Function} opts.onRetry optional callback(err, attempt, delay)
 */
async function withRetry(fn, { retries = 2, baseMs = 400, maxMs = 8000, label = 'operation', onRetry } = {}) {
  let attempt = 0;
  for (;;) {
    try {
      return await fn(attempt);
    } catch (err) {
      if (attempt >= retries || !isTransient(err)) throw err;
      const delay = Math.min(maxMs, baseMs * Math.pow(2, attempt)) + Math.floor(Math.random() * 250);
      attempt += 1;
      logger.warn(`${label} failed (attempt ${attempt}/${retries}); retrying in ${delay}ms`, {
        error: String((err && err.message) || err),
      });
      if (typeof onRetry === 'function') {
        try {
          onRetry(err, attempt, delay);
        } catch {
          /* ignore callback errors */
        }
      }
      await sleep(delay);
    }
  }
}

module.exports = { withRetry, isTransient, sleep };
