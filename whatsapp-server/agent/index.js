'use strict';

/**
 * Computer Use Agent — modular entrypoint.
 *
 * Wires together config, activity, safety, tools and the orchestrator, and
 * exposes:
 *   - router: Express router mounted at /api/agent (control plane for the web UI)
 *   - handleIncoming: called by the WhatsApp bridge for incoming DMs
 *
 * Deps injected by the host server:
 *   { db, getSessionIds, sendMessage }
 *     db            - firebase-admin Firestore instance (may be null)
 *     getSessionIds - () => string[] of linked account ids
 *     sendMessage   - async (accountId, phoneDigits, text) => void
 */

const express = require('express');

const config = require('./config');
const activity = require('./activity');
const safety = require('./safety');
const orchestrator = require('./orchestrator');
const tools = require('./tools');
const screen = require('./screen');
const input = require('./input');
const llm = require('./llm');
const providers = require('./providers');

function createAgent({ db, getSessionIds, sendMessage, sendToContact }) {
  const router = express.Router();
  const running = new Map(); // `${accountId}:${senderDigits}` -> state
  const taskStates = new Map(); // taskId -> state
  providers.setDb(db);
  tools.setWhatsAppSender(sendToContact);

  const keyOf = (accountId, sender) => `${accountId}:${sender}`;
  const isTarget = (v) => String(v || '').includes('@') || /^\d{7,}$/.test(String(v || ''));

  async function notify(accountId, jid, text) {
    if (!sendMessage || !isTarget(jid) || !text) return;
    try {
      await sendMessage(accountId, jid, text);
    } catch (e) {
      console.warn('[Agent] notify failed:', e.message);
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
    };
    return map[toolName] || `Run ${toolName} ${JSON.stringify(args)}`;
  }

  async function finalize(task, out, ctx) {
    const { accountId, sender, replyJid } = ctx;
    const target = replyJid || sender;

    if (out.type === 'confirm') {
      const summary = describeAction(out.toolName, out.args);
      await activity.updateTask(db, task, { status: 'awaiting_confirmation', summary });
      await activity.addStep(db, task, { type: 'confirmation', tool: out.toolName, args: out.args, detail: summary });
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
      await activity.updateTask(db, task, { status: 'awaiting_input' });
      await activity.addStep(db, task, { type: 'question', detail: out.question });
      await notify(accountId, target, out.question);
      return { status: 'awaiting_input', taskId: task.id, question: out.question };
    }

    if (out.type === 'stopped') {
      await activity.updateTask(db, task, { status: 'stopped', summary: 'Stopped by user.' });
      await activity.addStep(db, task, { type: 'stopped', detail: 'Stopped by user.' });
      await notify(accountId, target, '🛑 Stopped.');
      running.delete(keyOf(accountId, sender));
      taskStates.delete(task.id);
      return { status: 'stopped', taskId: task.id };
    }

    const summary = out.summary || 'Task completed.';
    await activity.updateTask(db, task, { status: 'completed', summary });
    await activity.addStep(db, task, { type: 'result', detail: summary });
    await notify(accountId, target, `✅ ${summary}`);
    running.delete(keyOf(accountId, sender));
    taskStates.delete(task.id);
    return { status: 'completed', taskId: task.id, summary };
  }

  async function startTask({ accountId, instruction, requesterNumber, requesterName, replyJid }) {
    const cfg = await config.getConfig(db, accountId);
    const policy = cfg.permissions?.confirmationPolicy || 'confirm_all_except_reads';
    const target = replyJid || requesterNumber;

    const task = await activity.createTask(db, { accountId, requesterNumber, requesterName, instruction });
    const state = {
      taskId: task.id,
      accountId,
      requesterNumber,
      replyJid: target,
      instruction,
      contents: null,
      pending: null,
      steps: 0,
    };
    running.set(keyOf(accountId, requesterNumber), state);
    taskStates.set(task.id, state);

    await activity.updateTask(db, task, { status: 'running' });
    await activity.addStep(db, task, { type: 'instruction', detail: instruction });

    try {
      const out = await orchestrator.run(state, { onProgress: makeProgress(accountId, target, task), policy, permissions: cfg.permissions });
      return await finalize(task, out, { accountId, sender: requesterNumber, replyJid: target });
    } catch (e) {
      await activity.updateTask(db, task, { status: 'failed', error: e.message });
      await activity.addStep(db, task, { type: 'error', detail: e.message });
      await notify(accountId, target, `❌ Failed: ${e.message}`);
      running.delete(keyOf(accountId, requesterNumber));
      return { status: 'failed', taskId: task.id, error: e.message };
    }
  }

  async function handleConfirmation({ accountId, sender, approved, text, replyJid }) {
    const entry = safety.takeConfirmation(accountId, sender);
    if (!entry) return { status: 'no_pending' };
    const state = entry.state || running.get(keyOf(accountId, sender));
    const target = replyJid || entry.replyJid || sender;
    const task = await activity.getTask(db, entry.taskId);
    await activity.addStep(db, task, { type: 'confirmation_response', detail: text || (approved ? 'yes' : 'no') });
    const cfg = await config.getConfig(db, accountId);
    const policy = cfg.permissions?.confirmationPolicy || 'confirm_all_except_reads';
    try {
      const out = await orchestrator.resumeAfterConfirmation(state, {
        approved,
        onProgress: makeProgress(accountId, target, task),
        policy,
        permissions: cfg.permissions,
      });
      return await finalize(task, out, { accountId, sender, replyJid: target });
    } catch (e) {
      await activity.updateTask(db, task, { status: 'failed', error: e.message });
      await notify(accountId, target, `❌ Failed: ${e.message}`);
      return { status: 'failed', error: e.message };
    }
  }

  /**
   * Entry point for incoming WhatsApp DMs. Authorization is checked against the
   * real sender JID. Returns a summary of what happened (or why it was ignored).
   */
  async function handleIncoming({ accountId, senderJid, replyJid, senderName, text }) {
    const auth = await config.isAuthorized(db, accountId, senderJid);
    if (!auth.authorized) return { ignored: true, reason: auth.reason };

    const sender = config.digitsOnly(senderJid);
    const target = replyJid || sender;

    const pendingEntry = safety.peekConfirmation(accountId, sender);
    if (pendingEntry) {
      const verdict = safety.parseConfirmation(text);
      if (verdict === 'unknown') {
        await notify(accountId, target, 'Please reply *yes* to confirm or *no* to cancel.');
        return { status: 'awaiting_confirmation' };
      }
      return handleConfirmation({ accountId, sender, approved: verdict === 'yes', text: verdict, replyJid: target });
    }

    return startTask({ accountId, instruction: text, requesterNumber: sender, requesterName: senderName, replyJid: target });
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

  // Run a task directly (web UI / testing).
  router.post('/execute', async (req, res) => {
    try {
      const { accountId = 'account1', instruction, requesterNumber = 'web-ui' } = req.body || {};
      if (!instruction) return res.status(400).json({ success: false, error: 'instruction is required' });
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
      const result = await handleConfirmation({ accountId, sender, approved: !!approved });
      res.json({ success: true, ...result });
    } catch (e) {
      res.status(500).json({ success: false, error: e.message });
    }
  });

  // Stop: cancel any pending confirmation for a sender.
  router.post('/control', async (req, res) => {
    try {
      const { accountId = 'account1', sender = 'web-ui', action, taskId } = req.body || {};
      if (action === 'stop') {
        // Signal any running task to stop at its next step.
        const state = (taskId && taskStates.get(taskId)) || running.get(keyOf(accountId, sender));
        if (state) state.cancelled = true;
        safety.clearConfirmation(accountId, sender);
        running.delete(keyOf(accountId, sender));
        if (taskId) taskStates.delete(taskId);
        // Mark an already-paused task as stopped immediately.
        if (taskId) {
          const task = await activity.getTask(db, taskId);
          if (task && ['running', 'awaiting_confirmation', 'awaiting_input'].includes(task.status)) {
            await activity.updateTask(db, task, { status: 'stopped', summary: 'Stopped by user.' });
          }
        }
        res.json({ success: true, status: 'stopped' });
      } else {
        res.json({ success: true, status: 'noop' });
      }
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
      console.warn('[AgentProviders] app_config sync failed:', e.message);
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

  return { router, handleIncoming, startTask, handleConfirmation };
}

module.exports = { createAgent };
