'use strict';

/**
 * Computer Use Agent — modular entrypoint.
 *
 * Wires together config, activity, safety, context, queue, dedupe, tools and the
 * orchestrator, and exposes:
 *   - router: Express router mounted at /api/agent (control plane for the web UI)
 *   - handleIncoming: called by the WhatsApp bridge for incoming DMs
 *
 * Deps injected by the host server:
 *   { db, getSessionIds, sendMessage, sendToContact }
 */

const express = require('express');

const config = require('./config');
const activity = require('./activity');
const safety = require('./safety');
const orchestrator = require('./orchestrator');
const tools = require('./tools');
const llm = require('./llm');
const providers = require('./providers');
const context = require('./context');
const queue = require('./queue');
const dedupe = require('./dedupe');
const logger = require('./logger').make('agent');

const TERMINAL = new Set(['completed', 'failed', 'stopped', 'timeout']);
const QUEUE_TIMEOUT_MS = orchestrator.TASK_TIMEOUT_MS + 60000;

const CONTROL_WORDS = {
  stop: ['stop', 'cancel', 'abort', 'halt', 'stop task', 'cancel task'],
  pause: ['pause', 'hold', 'pause task'],
  resume: ['resume', 'unpause', 'resume task'],
  status: ['status', 'progress', 'state', 'status task'],
};

function parseControl(text) {
  const t = String(text || '').trim().toLowerCase().replace(/[.!?]+$/, '');
  for (const [cmd, words] of Object.entries(CONTROL_WORDS)) {
    if (words.includes(t)) return cmd;
  }
  return null;
}

function createAgent({ db, getSessionIds, sendMessage, sendToContact }) {
  const router = express.Router();

  const active = new Map(); // `${accountId}:${senderDigits}` -> state (running / awaiting)
  const paused = new Map(); // `${accountId}:${senderDigits}` -> state (paused)
  const taskStates = new Map(); // taskId -> state
  const lastTaskBySender = new Map(); // `${accountId}:${senderDigits}` -> taskId

  providers.setDb(db);
  tools.setWhatsAppSender(sendToContact);

  const keyOf = (accountId, sender) => `${accountId}:${sender}`;
  const isTarget = (v) => String(v || '').includes('@') || /^\d{7,}$/.test(String(v || ''));

  function clearSenderState(accountId, sender, taskId) {
    const key = keyOf(accountId, sender);
    const a = active.get(key);
    if (!a || a.taskId === taskId) active.delete(key);
    const p = paused.get(key);
    if (!p || p.taskId === taskId) paused.delete(key);
    if (taskId) taskStates.delete(taskId);
  }

  async function notify(accountId, jid, text) {
    if (!sendMessage || !isTarget(jid) || !text) return;
    try {
      await sendMessage(accountId, jid, text);
    } catch (e) {
      logger.warn('notify failed', { error: e.message });
    }
  }

  function makeProgress(accountId, jid, task) {
    return async (evt) => {
      await activity.addStep(db, task, {
        type: 'tool',
        tool: evt.tool,
        args: evt.args || null,
        result: evt.error ? null : orchestrator.summarizeResult(evt.result),
        error: evt.error || null,
      });
      if (evt.tool) {
        const detail = evt.error ? `⚠️ ${evt.error}` : orchestrator.summarizeResult(evt.result) || 'ok';
        await notify(accountId, jid, `⚙️ ${evt.tool}: ${detail}`);
      }
    };
  }

  function describeAction(toolName, args = {}) {
    const map = {
      fs_write_file: `Write file ${args.file}`,
      fs_create_dir: `Create folder ${args.dir}`,
      fs_rename: `Rename ${args.from} → ${args.to}`,
      fs_copy: `Copy ${args.from} → ${args.to}`,
      fs_move: `Move ${args.from} → ${args.to}`,
      fs_delete: `DELETE ${args.target}${args.recursive ? ' (recursive)' : ''}`,
      input_move_mouse: `Move mouse to (${args.x}, ${args.y})`,
      input_click: `Click ${args.button || 'left'}${args.double ? ' (double)' : ''}`,
      input_type: `Type text (${String(args.text || '').length} chars)`,
      input_key: `Press ${args.key}`,
      input_scroll: `Scroll ${args.direction || 'down'}`,
      app_launch: `Launch ${args.command}`,
      screen_capture: 'Capture the screen',
      browser_open: `Open ${args.url}`,
      browser_goto: `Go to ${args.url}`,
      browser_click: `Click ${args.selector}`,
      browser_type: `Type into ${args.selector}`,
      browser_fill_form: `Fill ${(args.fields || []).length} form field(s)`,
      browser_press: `Press ${args.key}`,
      browser_upload: `Upload to ${args.selector}`,
      browser_download: `Download to ${args.savePath}`,
      browser_eval: 'Run JavaScript in the page',
      whatsapp_send: `Send WhatsApp message to ${args.to}`,
    };
    return map[toolName] || `Run ${toolName} ${JSON.stringify(args)}`;
  }

  async function finalize(task, out, ctx) {
    const { accountId, sender, replyJid } = ctx;
    const target = replyJid || sender;
    const key = keyOf(accountId, sender);
    const elapsedSec = task.createdAt ? Math.round((Date.now() - new Date(task.createdAt).getTime()) / 1000) : null;

    if (out.type === 'confirm') {
      const summary = describeAction(out.toolName, out.args);
      await activity.updateTask(db, task, { status: 'awaiting_confirmation', summary });
      await activity.addStep(db, task, { type: 'confirmation', tool: out.toolName, args: out.args, detail: summary });
      if (out.state) out.state.status = 'awaiting_confirmation';
      safety.makeConfirmation({
        accountId,
        sender,
        replyJid: target,
        taskId: task.id,
        toolName: out.toolName,
        args: out.args,
        summary,
        state: out.state,
      });
      await notify(accountId, target, `⚠️ Confirm action:\n${summary}\n\nReply *yes* to proceed or *no* to cancel.`);
      return { status: 'awaiting_confirmation', taskId: task.id, summary };
    }

    if (out.type === 'ask') {
      await activity.updateTask(db, task, { status: 'awaiting_input', summary: out.question });
      await activity.addStep(db, task, { type: 'question', detail: out.question });
      if (out.state) out.state.status = 'awaiting_input';
      await context.append(db, accountId, sender, 'assistant', `Asked the user: ${out.question}`);
      await notify(accountId, target, out.question);
      return { status: 'awaiting_input', taskId: task.id, question: out.question };
    }

    if (out.type === 'paused') {
      await activity.updateTask(db, task, { status: 'paused', summary: 'Paused by user.' });
      await activity.addStep(db, task, { type: 'paused', detail: 'Paused by user.' });
      if (out.state) {
        out.state.status = 'paused';
        active.delete(key);
        paused.set(key, out.state);
      }
      await notify(accountId, target, '⏸️ Paused. Reply *resume* to continue or *stop* to cancel.');
      return { status: 'paused', taskId: task.id };
    }

    // Terminal states: completed | failed | stopped | timeout
    let status;
    let summary;
    if (out.type === 'stopped') {
      status = 'stopped';
      summary = 'Stopped by user.';
    } else if (out.type === 'timeout') {
      status = 'failed';
      summary = out.summary || 'Task timed out.';
    } else if (out.type === 'failed') {
      status = 'failed';
      summary = out.error || 'Task failed.';
    } else {
      status = 'completed';
      summary = out.summary || 'Task completed.';
    }

    await activity.updateTask(db, task, {
      status,
      summary,
      error: status === 'failed' ? summary : null,
      durationSec: elapsedSec,
    });
    await activity.addStep(db, task, { type: 'result', detail: summary });
    await context.append(db, accountId, sender, 'assistant', summary);

    const emoji = status === 'completed' ? '✅' : status === 'stopped' ? '🛑' : '❌';
    await notify(accountId, target, `${emoji} ${summary}`);

    clearSenderState(accountId, sender, task.id);
    return { status, taskId: task.id, summary };
  }

  /** Core task execution (not queued — callers wrap this in the queue). */
  async function runTask({ accountId, instruction, requesterNumber, requesterName, replyJid }) {
    const cfg = await config.getConfig(db, accountId);
    const policy = cfg.permissions?.confirmationPolicy || 'confirm_all_except_reads';
    const target = replyJid || requesterNumber;
    const key = keyOf(accountId, requesterNumber);

    const task = await activity.createTask(db, { accountId, requesterNumber, requesterName, instruction });
    lastTaskBySender.set(key, task.id);

    const history = await context.load(db, accountId, requesterNumber);
    const state = {
      taskId: task.id,
      accountId,
      requesterNumber,
      replyJid: target,
      instruction,
      contents: null,
      pending: null,
      steps: 0,
      status: 'running',
      history: context.toHistory(history),
      startedAt: Date.now(),
    };
    active.set(key, state);
    taskStates.set(task.id, state);

    await context.append(db, accountId, requesterNumber, 'user', instruction);
    await activity.updateTask(db, task, { status: 'running' });
    await activity.addStep(db, task, { type: 'instruction', detail: instruction });
    logger.info('task started', { taskId: task.id, accountId, requesterNumber, chars: String(instruction).length });

    try {
      const out = await orchestrator.run(state, {
        onProgress: makeProgress(accountId, target, task),
        policy,
        permissions: cfg.permissions,
      });
      const result = await finalize(task, out, { accountId, sender: requesterNumber, replyJid: target });
      logger.info('task finished', { taskId: task.id, status: result.status });
      return result;
    } catch (e) {
      logger.error('task crashed', { error: e.message, taskId: task.id });
      await activity.updateTask(db, task, { status: 'failed', error: e.message });
      await activity.addStep(db, task, { type: 'error', detail: e.message });
      await notify(accountId, target, `❌ Failed: ${e.message}`);
      clearSenderState(accountId, requesterNumber, task.id);
      return { status: 'failed', taskId: task.id, error: e.message };
    }
  }

  /** Public entry: serialized per sender. */
  async function startTask(opts) {
    const key = keyOf(opts.accountId, opts.requesterNumber);
    return queue.enqueue(key, () => runTask(opts), { timeoutMs: QUEUE_TIMEOUT_MS });
  }

  async function handleConfirmation({ accountId, sender, approved, text, replyJid }) {
    const entry = safety.takeConfirmation(accountId, sender);
    if (!entry) return { status: 'no_pending' };

    const key = keyOf(accountId, sender);
    const state = entry.state || taskStates.get(entry.taskId) || active.get(key) || paused.get(key);
    const target = replyJid || entry.replyJid || sender;

    if (!state) {
      await notify(accountId, target, '⚠️ That action expired (the agent restarted). Please re-issue the request.');
      return { status: 'expired', taskId: entry.taskId };
    }

    const task = await activity.getTask(db, entry.taskId);
    if (!task) {
      await notify(accountId, target, '⚠️ That action expired. Please re-issue the request.');
      return { status: 'expired', taskId: entry.taskId };
    }

    await activity.addStep(db, task, { type: 'confirmation_response', detail: text || (approved ? 'yes' : 'no') });
    const cfg = await config.getConfig(db, accountId);
    const policy = cfg.permissions?.confirmationPolicy || 'confirm_all_except_reads';

    state.status = 'running';
    state.startedAt = Date.now();
    paused.delete(key);
    active.set(key, state);

    try {
      const out = await orchestrator.resumeAfterConfirmation(state, {
        approved,
        onProgress: makeProgress(accountId, target, task),
        policy,
        permissions: cfg.permissions,
      });
      return await finalize(task, out, { accountId, sender, replyJid: target });
    } catch (e) {
      logger.error('confirmation resume crashed', { error: e.message, taskId: task.id });
      await activity.updateTask(db, task, { status: 'failed', error: e.message });
      await notify(accountId, target, `❌ Failed: ${e.message}`);
      clearSenderState(accountId, sender, task.id);
      return { status: 'failed', taskId: task.id, error: e.message };
    }
  }

  async function resumeTask(state) {
    const task = await activity.getTask(db, state.taskId);
    if (!task) return { status: 'expired' };
    const cfg = await config.getConfig(db, state.accountId);
    const policy = cfg.permissions?.confirmationPolicy || 'confirm_all_except_reads';
    const target = state.replyJid || state.requesterNumber;
    const key = keyOf(state.accountId, state.requesterNumber);

    state.paused = false;
    state.status = 'running';
    state.startedAt = Date.now();
    paused.delete(key);
    active.set(key, state);
    await activity.updateTask(db, task, { status: 'running' });

    try {
      const out = await orchestrator.run(state, {
        onProgress: makeProgress(state.accountId, target, task),
        policy,
        permissions: cfg.permissions,
      });
      return await finalize(task, out, { accountId: state.accountId, sender: state.requesterNumber, replyJid: target });
    } catch (e) {
      await activity.updateTask(db, task, { status: 'failed', error: e.message });
      await notify(state.accountId, target, `❌ Failed: ${e.message}`);
      clearSenderState(state.accountId, state.requesterNumber, task.id);
      return { status: 'failed', error: e.message };
    }
  }

  async function resumeTaskWithInput(state, text) {
    const task = await activity.getTask(db, state.taskId);
    if (!task) return { status: 'expired' };
    const cfg = await config.getConfig(db, state.accountId);
    const policy = cfg.permissions?.confirmationPolicy || 'confirm_all_except_reads';
    const target = state.replyJid || state.requesterNumber;

    state.status = 'running';
    state.startedAt = Date.now();
    await activity.updateTask(db, task, { status: 'running' });
    await activity.addStep(db, task, { type: 'user_input', detail: String(text).slice(0, 500) });
    await context.append(db, state.accountId, state.requesterNumber, 'user', text);

    try {
      const out = await orchestrator.resumeWithInput(state, text, {
        onProgress: makeProgress(state.accountId, target, task),
        policy,
        permissions: cfg.permissions,
      });
      return await finalize(task, out, { accountId: state.accountId, sender: state.requesterNumber, replyJid: target });
    } catch (e) {
      await activity.updateTask(db, task, { status: 'failed', error: e.message });
      await notify(state.accountId, target, `❌ Failed: ${e.message}`);
      clearSenderState(state.accountId, state.requesterNumber, task.id);
      return { status: 'failed', error: e.message };
    }
  }

  async function handleControl({ accountId, sender, target, cmd, taskId }) {
    const key = keyOf(accountId, sender);
    const st = (taskId && taskStates.get(taskId)) || active.get(key) || paused.get(key);
    const resolvedTaskId = (st && st.taskId) || taskId || lastTaskBySender.get(key);
    const task = resolvedTaskId ? await activity.getTask(db, resolvedTaskId) : null;
    const stateKey = st ? keyOf(st.accountId, st.requesterNumber) : key;

    if (cmd === 'status') {
      if (!task) {
        await notify(accountId, target, '📋 No recent task.');
        return { status: 'no_task' };
      }
      const elapsed = task.createdAt ? Math.round((Date.now() - new Date(task.createdAt).getTime()) / 1000) : null;
      const lines = [`📋 Status: ${task.status}`, `Task: ${task.instruction}`];
      if (task.summary) lines.push(`Summary: ${task.summary}`);
      if (task.error) lines.push(`Error: ${task.error}`);
      if (elapsed != null) lines.push(`Elapsed: ${elapsed}s`);
      if (Array.isArray(task.steps)) lines.push(`Steps: ${task.steps.length}`);
      await notify(accountId, target, lines.join('\n'));
      return { status: 'reported', taskStatus: task.status, taskId: resolvedTaskId };
    }

    if (cmd === 'stop') {
      if (st) {
        st.cancelled = true;
        st.paused = false;
      }
      safety.clearConfirmation(accountId, sender);
      if (task && !TERMINAL.has(task.status)) {
        await activity.updateTask(db, task, { status: 'stopped', summary: 'Stopped by user.' });
        await activity.addStep(db, task, { type: 'control', detail: 'Stopped by user' });
      }
      active.delete(stateKey);
      paused.delete(stateKey);
      if (resolvedTaskId) taskStates.delete(resolvedTaskId);
      await notify(accountId, target, '🛑 Stopped.');
      return { status: 'stopped', taskId: resolvedTaskId };
    }

    if (cmd === 'pause') {
      if (!st) {
        await notify(accountId, target, 'Nothing is running to pause.');
        return { status: 'no_running_task' };
      }
      if (task && task.status === 'awaiting_confirmation') {
        await notify(accountId, target, 'This task is waiting for confirmation. Reply *yes* or *no*.');
        return { status: 'awaiting_confirmation' };
      }
      st.paused = true;
      await notify(accountId, target, '⏸️ Pausing after the current step. Reply *resume* to continue.');
      return { status: 'pausing', taskId: resolvedTaskId };
    }

    if (cmd === 'resume') {
      if (!st) {
        await notify(accountId, target, 'Nothing is paused to resume.');
        return { status: 'no_paused_task' };
      }
      if (task && task.status === 'awaiting_confirmation') {
        await notify(accountId, target, 'This task is waiting for confirmation. Reply *yes* or *no*.');
        return { status: 'awaiting_confirmation' };
      }
      if (!st.paused && (!task || task.status !== 'paused')) {
        await notify(accountId, target, 'This task is already running.');
        return { status: 'already_running' };
      }
      await notify(accountId, target, '▶️ Resuming…');
      return queue.enqueue(stateKey, () => resumeTask(st), { timeoutMs: QUEUE_TIMEOUT_MS });
    }

    return { status: 'noop' };
  }

  /**
   * Entry point for incoming WhatsApp DMs.
   * Authorization is checked against the real sender JID. Idempotent per message id.
   */
  async function handleIncoming({ accountId, senderJid, replyJid, senderName, text, messageId }) {
    try {
      const dedupeKey = messageId ? `${accountId}:${messageId}` : null;
      if (dedupeKey && dedupe.isDuplicate(dedupeKey)) {
        logger.debug('duplicate message ignored', { dedupeKey });
        return { ignored: true, reason: 'duplicate' };
      }

      const auth = await config.isAuthorized(db, accountId, senderJid);
      if (!auth.authorized) return { ignored: true, reason: auth.reason };

      const sender = config.digitsOnly(senderJid);
      const target = replyJid || sender;
      const key = keyOf(accountId, sender);

      // Control commands bypass the queue for responsiveness.
      const cmd = parseControl(text);
      if (cmd) return handleControl({ accountId, sender, target, cmd });

      // A pending confirmation awaits yes/no.
      const pendingEntry = safety.peekConfirmation(accountId, sender);
      if (pendingEntry) {
        const verdict = safety.parseConfirmation(text);
        if (verdict === 'unknown') {
          await notify(accountId, target, 'You have a pending action. Reply *yes* to confirm, *no* to cancel, or *stop* to abort.');
          return { status: 'awaiting_confirmation' };
        }
        return queue.enqueue(key, () => handleConfirmation({ accountId, sender, approved: verdict === 'yes', text: verdict, replyJid: target }), {
          timeoutMs: QUEUE_TIMEOUT_MS,
        });
      }

      // Awaiting an answer to ask_user → treat this message as the answer.
      const activeState = active.get(key);
      if (activeState && activeState.status === 'awaiting_input') {
        return queue.enqueue(key, () => resumeTaskWithInput(activeState, text), { timeoutMs: QUEUE_TIMEOUT_MS });
      }

      // A paused task must be resolved before a new one starts.
      if (paused.get(key)) {
        await notify(accountId, target, 'You have a paused task. Reply *resume* to continue or *stop* to cancel it first.');
        return { status: 'paused' };
      }

      // A task is currently running → let the queue serialize the next one.
      if (activeState && activeState.status === 'running') {
        await notify(accountId, target, '⏳ A task is already running — I will start this one next.');
      }

      return startTask({ accountId, instruction: text, requesterNumber: sender, requesterName: senderName, replyJid: target });
    } catch (err) {
      logger.error('handleIncoming failed', { error: err.message, accountId });
      return { status: 'error', error: err.message };
    }
  }

  // ── Control-plane routes (used by the web UI) ─────────────────────────────

  router.get('/health', async (req, res) => {
    let provider = null;
    try {
      const c = await llm.getProviderConfig();
      provider = { provider: c.provider, model: c.model, hasKey: !!c.apiKey };
    } catch {
      /* ignore */
    }
    res.json({
      ok: true,
      model: provider?.model || orchestrator.MODEL,
      provider,
      capabilities: { ...tools.capabilities() },
      activeTasks: active.size,
      pausedTasks: paused.size,
      queuedSenders: queue.size(),
      dedupeKeys: dedupe.size(),
    });
  });

  router.get('/tools', (req, res) => {
    res.json({ success: true, tools: tools.declarations({ includeRestricted: true }) });
  });

  router.get('/config', async (req, res) => {
    try {
      const ids = getSessionIds ? getSessionIds() : [];
      res.json({ success: true, configs: await config.listConfigs(db, ids) });
    } catch (e) {
      res.status(500).json({ success: false, error: e.message });
    }
  });

  router.put('/config', async (req, res) => {
    try {
      const { accountId, ...patch } = req.body || {};
      if (!accountId) return res.status(400).json({ success: false, error: 'accountId is required' });
      const saved = await config.saveConfig(db, accountId, patch);
      res.json({ success: true, config: saved });
    } catch (e) {
      res.status(500).json({ success: false, error: e.message });
    }
  });

  router.get('/activity', async (req, res) => {
    try {
      const tasks = await activity.listTasks(db, {
        accountId: req.query.accountId,
        limit: Number(req.query.limit) || 50,
      });
      res.json({ success: true, tasks });
    } catch (e) {
      res.status(500).json({ success: false, error: e.message });
    }
  });

  router.get('/activity/:id', async (req, res) => {
    const task = await activity.getTask(db, req.params.id);
    if (!task) return res.status(404).json({ success: false, error: 'not found' });
    res.json({ success: true, task });
  });

  // Run a task directly (web UI / testing). Idempotent when idempotencyKey is given.
  router.post('/execute', async (req, res) => {
    try {
      const { accountId = 'account1', instruction, requesterNumber = 'web-ui', idempotencyKey } = req.body || {};
      if (!instruction) return res.status(400).json({ success: false, error: 'instruction is required' });
      if (idempotencyKey && dedupe.isDuplicate(`exec:${accountId}:${idempotencyKey}`)) {
        return res.json({ success: true, status: 'duplicate' });
      }
      const result = await startTask({ accountId, instruction, requesterNumber, requesterName: 'Web UI' });
      res.json({ success: true, ...result });
    } catch (e) {
      res.status(500).json({ success: false, error: e.message });
    }
  });

  // Confirm / cancel a pending action (web UI).
  router.post('/confirm', async (req, res) => {
    try {
      const { accountId = 'account1', sender = 'web-ui', approved } = req.body || {};
      const key = keyOf(accountId, sender);
      const result = await queue.enqueue(key, () => handleConfirmation({ accountId, sender, approved: !!approved }), { timeoutMs: QUEUE_TIMEOUT_MS });
      res.json({ success: true, ...result });
    } catch (e) {
      res.status(500).json({ success: false, error: e.message });
    }
  });

  // Control: stop | pause | resume | status
  router.post('/control', async (req, res) => {
    try {
      const { accountId = 'account1', sender = 'web-ui', action, taskId } = req.body || {};
      if (!['stop', 'pause', 'resume', 'status'].includes(action)) {
        return res.json({ success: true, status: 'noop' });
      }
      const result = await handleControl({ accountId, sender, target: sender, cmd: action, taskId });
      res.json({ success: true, ...result });
    } catch (e) {
      res.status(500).json({ success: false, error: e.message });
    }
  });

  // Clear a sender's follow-up context.
  router.post('/context/clear', async (req, res) => {
    try {
      const { accountId = 'account1', sender } = req.body || {};
      if (!sender) return res.status(400).json({ success: false, error: 'sender is required' });
      await context.clear(db, accountId, sender);
      res.json({ success: true });
    } catch (e) {
      res.status(500).json({ success: false, error: e.message });
    }
  });

  // ── Provider management ───────────────────────────────────────────────────

  async function syncAppProviderConfig(provider, modelId) {
    const url = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY;
    if (!url || !key) return;
    const rows = [
      { key: 'aiProvider', value: 'custom' },
      { key: 'aiBaseUrl', value: provider.baseUrl },
      { key: 'fallbackApiKey', value: provider.apiKey },
      { key: 'fallbackModelId', value: modelId || '' },
    ];
    try {
      await fetch(`${url}/rest/v1/app_config?on_conflict=key`, {
        method: 'POST',
        headers: {
          apikey: key,
          Authorization: `Bearer ${key}`,
          'Content-Type': 'application/json',
          Prefer: 'resolution=merge-duplicates',
        },
        body: JSON.stringify(rows),
      });
    } catch (e) {
      logger.warn('app_config sync failed', { error: e.message });
    }
  }

  router.get('/providers', async (req, res) => {
    try {
      res.json({ success: true, ...(await providers.load()) });
    } catch (e) {
      res.status(500).json({ success: false, error: e.message });
    }
  });

  router.post('/providers', async (req, res) => {
    try {
      const incoming = providers.normalizeProvider(req.body || {});
      if (!incoming || !incoming.id) {
        return res.status(400).json({ success: false, error: 'Provider name is required' });
      }
      const state = await providers.load();
      const idx = state.providers.findIndex((p) => p.id === incoming.id);
      if (idx >= 0) state.providers[idx] = incoming;
      else state.providers.push(incoming);
      await providers.save(state);
      llm.resetProvider();
      res.json({ success: true, ...state });
    } catch (e) {
      res.status(500).json({ success: false, error: e.message });
    }
  });

  router.delete('/providers/:id', async (req, res) => {
    try {
      const state = await providers.load();
      state.providers = state.providers.filter((p) => p.id !== req.params.id);
      if (state.activeProviderId === req.params.id) {
        state.activeProviderId = null;
        state.activeModelId = null;
      }
      await providers.save(state);
      llm.resetProvider();
      res.json({ success: true, ...state });
    } catch (e) {
      res.status(500).json({ success: false, error: e.message });
    }
  });

  router.post('/providers/active', async (req, res) => {
    try {
      const { providerId, modelId } = req.body || {};
      const state = await providers.load();
      const provider = state.providers.find((p) => p.id === providerId);
      if (!provider) return res.status(400).json({ success: false, error: 'Unknown provider' });
      state.activeProviderId = provider.id;
      state.activeModelId = modelId || provider.models[0]?.id || null;
      await providers.save(state);
      llm.resetProvider();
      await syncAppProviderConfig(provider, state.activeModelId);
      res.json({ success: true, ...state });
    } catch (e) {
      res.status(500).json({ success: false, error: e.message });
    }
  });

  router.post('/providers/import-opencode', async (req, res) => {
    try {
      const filePath = (req.body && req.body.path) || providers.defaultOpencodePath();
      const parsed = providers.parseOpencodeConfig(filePath);
      const state = await providers.load();
      for (const p of parsed.providers) {
        const idx = state.providers.findIndex((x) => x.id === p.id);
        if (idx >= 0) state.providers[idx] = p;
        else state.providers.push(p);
      }
      if (parsed.activeProviderId) {
        state.activeProviderId = parsed.activeProviderId;
        state.activeModelId = parsed.activeModelId || null;
      }
      await providers.save(state);
      llm.resetProvider();
      res.json({ success: true, imported: parsed.providers.length, path: filePath, ...state });
    } catch (e) {
      res.status(500).json({ success: false, error: `Import failed: ${e.message}` });
    }
  });

  return { router, handleIncoming, startTask, handleConfirmation, handleControl };
}

module.exports = { createAgent };
