'use strict';

/**
 * Per-key FIFO serialization queue.
 *
 * Guarantees that tasks for the same key (e.g. one WhatsApp sender) run one at
 * a time, while different keys run in parallel. This prevents two computer-use
 * tasks from fighting over the mouse/keyboard at once, and prevents a rapid
 * double-send from starting two overlapping runs.
 *
 * A timeout is a safety net: if a task hangs, the queue unblocks and the next
 * task can run. (The underlying operation may still be running; the orchestrator
 * has its own deadline to stop it.)
 */

const logger = require('./logger').make('queue');

const tails = new Map(); // key -> Promise (tail of the chain)

function withTimeout(promise, ms, label) {
  if (!ms || ms <= 0) return promise;
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`${label || 'operation'} timed out after ${ms}ms`));
    }, ms);
    Promise.resolve(promise).then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (err) => {
        clearTimeout(timer);
        reject(err);
      }
    );
  });
}

/**
 * Enqueue a task for a key. Returns the task's result.
 * @param {string} key
 * @param {Function} task  async function
 * @param {Object} opts { timeoutMs }
 */
function enqueue(key, task, { timeoutMs = 0 } = {}) {
  const prev = tails.get(key) || Promise.resolve();
  const run = prev.then(() => withTimeout(Promise.resolve().then(task), timeoutMs, key));
  const settled = run.catch(() => {});
  tails.set(key, settled);
  settled.then(() => {
    if (tails.get(key) === settled) tails.delete(key);
  });
  return run;
}

function pending(key) {
  return tails.has(key);
}

function size() {
  return tails.size;
}

module.exports = { enqueue, pending, size };
