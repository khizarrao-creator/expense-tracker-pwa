import React, { useCallback, useEffect, useState } from 'react';
import {
  Bot, Shield, Plus, Trash2, Loader2, Play, Monitor, MousePointer2, FolderTree,
  Globe, RefreshCw, ChevronDown, ChevronRight, CheckCircle2, XCircle, Clock, AlertTriangle,
} from 'lucide-react';
import { toast } from 'sonner';
import {
  getAgentConfigs,
  saveAgentConfig,
  getAgentActivity,
  getAgentHealth,
  runAgentTask,
  stopAgentTask,
  pauseAgentTask,
  resumeAgentTask,
  type AgentConfig,
  type AgentTask,
  type AgentHealth,
  type ConfirmationPolicy,
} from '../../services/agentService';

interface AgentPanelProps {
  accountId: string;
  accountName?: string;
}

const STATUS_META: Record<string, { label: string; cls: string; icon: React.ReactNode }> = {
  completed: { label: 'Completed', cls: 'text-emerald-600 dark:text-emerald-400', icon: <CheckCircle2 size={12} /> },
  failed: { label: 'Failed', cls: 'text-destructive', icon: <XCircle size={12} /> },
  running: { label: 'Running', cls: 'text-primary', icon: <Loader2 size={12} className="animate-spin" /> },
  planning: { label: 'Planning', cls: 'text-primary', icon: <Loader2 size={12} className="animate-spin" /> },
  awaiting_confirmation: { label: 'Awaiting confirmation', cls: 'text-amber-500', icon: <AlertTriangle size={12} /> },
  awaiting_input: { label: 'Awaiting input', cls: 'text-amber-500', icon: <Clock size={12} /> },
  paused: { label: 'Paused', cls: 'text-amber-500', icon: <Clock size={12} /> },
  stopped: { label: 'Stopped', cls: 'text-muted-foreground', icon: <XCircle size={12} /> },
  timeout: { label: 'Timed out', cls: 'text-destructive', icon: <XCircle size={12} /> },
  queued: { label: 'Queued', cls: 'text-muted-foreground', icon: <Clock size={12} /> },
};

const POLICY_LABELS: Record<ConfirmationPolicy, string> = {
  confirm_all_except_reads: 'Confirm everything except safe reads (recommended)',
  confirm_only_destructive: 'Confirm only destructive / sensitive actions',
  confirm_everything: 'Confirm every computer action',
};

export const AgentPanel: React.FC<AgentPanelProps> = ({ accountId, accountName }) => {
  const [config, setConfig] = useState<AgentConfig | null>(null);
  const [health, setHealth] = useState<AgentHealth | null>(null);
  const [tasks, setTasks] = useState<AgentTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [running, setRunning] = useState(false);
  const [instruction, setInstruction] = useState('');
  const [expanded, setExpanded] = useState<string | null>(null);
  const [newPhone, setNewPhone] = useState('');
  const [newLabel, setNewLabel] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [cfgs, h, t] = await Promise.all([
        getAgentConfigs(),
        getAgentHealth().catch(() => null),
        getAgentActivity(accountId).catch(() => []),
      ]);
      setConfig(cfgs.find((c) => c.accountId === accountId) || null);
      setHealth(h);
      setTasks(t);
    } catch (e: any) {
      toast.error('Could not load agent settings: ' + (e.message || e));
    } finally {
      setLoading(false);
    }
  }, [accountId]);

  useEffect(() => {
    load();
  }, [load]);

  const persist = async (patch: Partial<AgentConfig>) => {
    if (!config) return;
    setSaving(true);
    try {
      const saved = await saveAgentConfig(accountId, patch);
      setConfig(saved);
    } catch (e: any) {
      toast.error('Save failed: ' + (e.message || e));
    } finally {
      setSaving(false);
    }
  };

  const addNumber = async () => {
    if (!config) return;
    const phone = newPhone.trim();
    const label = newLabel.trim();
    if (!phone) {
      toast.error('Enter a phone number (with country code, e.g. +923001234567).');
      return;
    }
    const digits = phone.replace(/\D/g, '');
    if (config.authorizedNumbers.some((n) => n.phone.replace(/\D/g, '') === digits)) {
      toast.info('That number is already authorized.');
      return;
    }
    const next = [
      ...config.authorizedNumbers,
      { id: `${Date.now()}`, phone, label, enabled: true, addedAt: new Date().toISOString() },
    ];
    await persist({ authorizedNumbers: next });
    setNewPhone('');
    setNewLabel('');
  };

  const updateNumber = async (id: string, patch: Partial<AgentConfig['authorizedNumbers'][number]>) => {
    if (!config) return;
    const next = config.authorizedNumbers.map((n) => (n.id === id ? { ...n, ...patch } : n));
    await persist({ authorizedNumbers: next });
  };

  const removeNumber = async (id: string) => {
    if (!config) return;
    await persist({ authorizedNumbers: config.authorizedNumbers.filter((n) => n.id !== id) });
  };

  const setPermission = async (key: keyof AgentConfig['permissions'], value: any) => {
    if (!config) return;
    await persist({ permissions: { ...config.permissions, [key]: value } });
  };

  const handleRun = async () => {
    const text = instruction.trim();
    if (!text) return;
    setRunning(true);
    try {
      const res = await runAgentTask(accountId, text);
      if (res.status === 'completed') toast.success(res.summary || 'Task completed.');
      else if (res.status === 'awaiting_confirmation') toast.warning('Action needs confirmation.');
      else if (res.status === 'awaiting_input') toast.info(res.question || 'The agent asked a question.');
      else if (res.status === 'failed') toast.error(res.error || 'Task failed.');
      setInstruction('');
      await load();
    } catch (e: any) {
      toast.error('Task error: ' + (e.message || e));
    } finally {
      setRunning(false);
    }
  };

  const handleStop = async (taskId: string) => {
    try {
      await stopAgentTask(accountId, 'web-ui', taskId);
      toast.success('Stop requested.');
      await load();
    } catch (e: any) {
      toast.error('Stop failed: ' + (e.message || e));
    }
  };

  const handlePause = async (taskId: string) => {
    try {
      await pauseAgentTask(accountId, 'web-ui');
      toast.success('Pause requested.');
      await load();
    } catch (e: any) {
      toast.error('Pause failed: ' + (e.message || e));
    }
  };

  const handleResume = async (taskId: string) => {
    try {
      await resumeAgentTask(accountId, 'web-ui');
      toast.success('Resume requested.');
      await load();
    } catch (e: any) {
      toast.error('Resume failed: ' + (e.message || e));
    }
  };

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-xs text-muted-foreground py-6 justify-center">
        <Loader2 size={14} className="animate-spin" /> Loading agent settings…
      </div>
    );
  }

  if (!config) {
    return <div className="text-xs text-muted-foreground">Agent configuration unavailable.</div>;
  }

  const Cap = ({ ok, icon, label }: { ok: boolean; icon: React.ReactNode; label: string }) => (
    <span
      className={`inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-1 rounded-lg border ${
        ok ? 'text-emerald-600 dark:text-emerald-400 border-emerald-500/20 bg-emerald-500/5' : 'text-muted-foreground border-border bg-muted/20'
      }`}
    >
      {icon} {label} {ok ? '✓' : '✗'}
    </span>
  );

  return (
    <div className="space-y-5">
      {/* Header + enable */}
      <div className="bg-card border border-border rounded-3xl p-5 space-y-4">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="p-2 rounded-xl border bg-primary/10 text-primary border-primary/20">
              <Bot size={20} />
            </div>
            <div>
              <h3 className="font-bold text-sm flex items-center gap-2">
                AI Computer Use Agent
                <span className="text-[9px] uppercase tracking-wider text-muted-foreground font-bold">
                  {accountName || accountId}
                </span>
              </h3>
              <p className="text-[11px] text-muted-foreground mt-0.5 max-w-xl">
                Let authorized WhatsApp numbers instruct this computer to perform tasks — files, screen and input.
                Actions are confirmed before they run.
              </p>
            </div>
          </div>

          <button
            onClick={() => persist({ enabled: !config.enabled })}
            disabled={saving}
            className={`shrink-0 flex items-center gap-2 px-3 py-2 rounded-xl border text-xs font-bold transition-all ${
              config.enabled
                ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30'
                : 'bg-muted/20 text-muted-foreground border-border hover:text-foreground'
            }`}
          >
            {saving ? <Loader2 size={13} className="animate-spin" /> : <Shield size={13} />}
            {config.enabled ? 'AI Agent: ON' : 'AI Agent: OFF'}
          </button>
        </div>

        {health && (
          <div className="flex flex-wrap items-center gap-2 border-t border-border/40 pt-3">
            <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Capabilities</span>
            <Cap ok={health.capabilities.fileSystem} icon={<FolderTree size={11} />} label="Files" />
            <Cap ok={health.capabilities.screen} icon={<Monitor size={11} />} label="Screen" />
            <Cap ok={health.capabilities.input} icon={<MousePointer2 size={11} />} label="Input" />
            <span className="text-[10px] text-muted-foreground ml-auto">model: {health.model}</span>
          </div>
        )}
      </div>

      {/* Authorized numbers */}
      <div className="bg-card border border-border rounded-3xl p-5 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="font-bold text-sm flex items-center gap-2">
            <Shield size={15} className="text-primary" /> Authorized Numbers
          </h3>
          <span className="text-[10px] text-muted-foreground">
            {config.authorizedNumbers.filter((n) => n.enabled).length} active
          </span>
        </div>

        {config.authorizedNumbers.length === 0 ? (
          <p className="text-[11px] text-muted-foreground italic">
            No numbers authorized yet. Only authorized numbers can send instructions to the agent.
          </p>
        ) : (
          <div className="space-y-2">
            {config.authorizedNumbers.map((n) => (
              <div key={n.id} className="flex items-center gap-2 bg-muted/20 border border-border/60 rounded-2xl px-3 py-2">
                <input
                  type="checkbox"
                  checked={n.enabled}
                  onChange={(e) => updateNumber(n.id, { enabled: e.target.checked })}
                  className="accent-primary"
                  title="Enable/disable this number"
                />
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-bold font-mono truncate">{n.phone}</p>
                  <input
                    defaultValue={n.label}
                    onBlur={(e) => e.target.value !== n.label && updateNumber(n.id, { label: e.target.value })}
                    placeholder="Label (e.g. Khizar)"
                    className="mt-0.5 w-full bg-transparent text-[10px] text-muted-foreground focus:outline-none"
                  />
                </div>
                <span className={`text-[9px] font-bold uppercase px-2 py-0.5 rounded-full ${n.enabled ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400' : 'bg-muted text-muted-foreground'}`}>
                  {n.enabled ? 'active' : 'off'}
                </span>
                <button onClick={() => removeNumber(n.id)} className="p-1.5 text-muted-foreground hover:text-destructive" title="Remove">
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
          </div>
        )}

        <div className="flex flex-col sm:flex-row gap-2 border-t border-border/40 pt-3">
          <input
            value={newPhone}
            onChange={(e) => setNewPhone(e.target.value)}
            placeholder="+923001234567"
            className="flex-1 bg-muted/20 border border-border/60 rounded-xl px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-primary/40"
          />
          <input
            value={newLabel}
            onChange={(e) => setNewLabel(e.target.value)}
            placeholder="Label"
            className="sm:w-40 bg-muted/20 border border-border/60 rounded-xl px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-primary/40"
          />
          <button
            onClick={addNumber}
            disabled={saving}
            className="flex items-center justify-center gap-1.5 px-4 py-2 bg-primary text-primary-foreground rounded-xl text-xs font-bold hover:opacity-90"
          >
            <Plus size={13} /> Add
          </button>
        </div>
      </div>

      {/* Permissions */}
      <div className="bg-card border border-border rounded-3xl p-5 space-y-3">
        <h3 className="font-bold text-sm">Permissions & Confirmation</h3>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
          {([
            ['fileSystem', 'File system', <FolderTree size={13} key="f" />],
            ['screen', 'Screen capture', <Monitor size={13} key="s" />],
            ['input', 'Mouse & keyboard', <MousePointer2 size={13} key="i" />],
            ['browser', 'Browser', <Globe size={13} key="b" />],
          ] as const).map(([key, label, icon]) => (
            <label key={key} className="flex items-center gap-2 bg-muted/20 border border-border/60 rounded-2xl px-3 py-2 text-xs cursor-pointer">
              <input
                type="checkbox"
                checked={(config.permissions as any)[key]}
                onChange={(e) => setPermission(key as any, e.target.checked)}
                className="accent-primary"
              />
              <span className="flex items-center gap-1.5 font-semibold">{icon}{label}</span>
            </label>
          ))}
        </div>
        <div>
          <label className="text-[11px] font-semibold text-muted-foreground block mb-1">Confirmation policy</label>
          <select
            value={config.permissions.confirmationPolicy}
            onChange={(e) => setPermission('confirmationPolicy', e.target.value as ConfirmationPolicy)}
            className="w-full bg-muted/20 border border-border/60 rounded-xl px-3 py-2 text-xs focus:outline-none"
          >
            {(Object.keys(POLICY_LABELS) as ConfirmationPolicy[]).map((p) => (
              <option key={p} value={p}>{POLICY_LABELS[p]}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Test run */}
      <div className="bg-card border border-border rounded-3xl p-5 space-y-3">
        <h3 className="font-bold text-sm flex items-center gap-2">
          <Play size={15} className="text-primary" /> Run a task now
        </h3>
        <div className="flex gap-2">
          <input
            value={instruction}
            onChange={(e) => setInstruction(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleRun()}
            placeholder='e.g. "List the files in my Downloads folder"'
            className="flex-1 bg-muted/20 border border-border/60 rounded-xl px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-primary/40"
          />
          <button
            onClick={handleRun}
            disabled={running || !instruction.trim()}
            className="flex items-center gap-1.5 px-4 py-2 bg-primary text-primary-foreground rounded-xl text-xs font-bold hover:opacity-90 disabled:opacity-50"
          >
            {running ? <Loader2 size={13} className="animate-spin" /> : <Play size={13} />} Run
          </button>
          <button
            onClick={() => stopAgentTask(accountId)}
            className="px-3 py-2 bg-muted/30 border border-border rounded-xl text-xs font-bold text-muted-foreground hover:text-foreground"
            title="Stop / cancel pending action"
          >
            Stop
          </button>
        </div>
      </div>

      {/* Activity */}
      <div className="bg-card border border-border rounded-3xl p-5 space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="font-bold text-sm">Activity History</h3>
          <button onClick={load} className="text-[10px] text-muted-foreground hover:text-foreground flex items-center gap-1">
            <RefreshCw size={12} /> Refresh
          </button>
        </div>

        {tasks.length === 0 ? (
          <p className="text-[11px] text-muted-foreground italic">No agent activity yet.</p>
        ) : (
          <div className="space-y-2">
            {tasks.map((t) => {
              const meta = STATUS_META[t.status] || { label: t.status, cls: 'text-muted-foreground', icon: <Clock size={12} /> };
              const open = expanded === t.id;
              return (
                <div key={t.id} className="border border-border/60 rounded-2xl overflow-hidden">
                  <button
                    onClick={() => setExpanded(open ? null : t.id)}
                    className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-muted/10"
                  >
                    {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                    <span className="flex-1 text-xs truncate">{t.instruction}</span>
                    <span className={`flex items-center gap-1 text-[10px] font-bold ${meta.cls}`}>{meta.icon}{meta.label}</span>
                  </button>
                  {open && (
                    <div className="px-4 pb-3 space-y-1.5 bg-muted/5">
                      <p className="text-[10px] text-muted-foreground">
                        {new Date(t.createdAt).toLocaleString()} · from {t.requesterName || t.requesterNumber}
                        {typeof t.durationSec === 'number' ? ` · ${t.durationSec}s` : ''}
                      </p>
                      {t.summary && <p className="text-[11px] font-medium">{t.summary}</p>}
                      {t.error && <p className="text-[11px] text-destructive">{t.error}</p>}
                      <div className="space-y-1 pt-1">
                        {t.steps.map((s, i) => (
                          <div key={i} className="text-[10px] flex gap-2">
                            <span className="text-muted-foreground/60 font-mono shrink-0">{s.type}</span>
                            <span className="truncate">
                              {s.tool ? `${s.tool} ` : ''}
                              {s.error ? `⚠️ ${s.error}` : (s.detail || s.result || '')}
                            </span>
                          </div>
                        ))}
                      </div>
                      {['running', 'planning', 'queued', 'awaiting_confirmation', 'awaiting_input', 'paused'].includes(t.status) && (
                        <div className="pt-2 flex flex-wrap gap-2">
                          {t.status === 'running' && (
                            <button
                              onClick={() => handlePause(t.id)}
                              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20 text-[11px] font-bold hover:bg-amber-500/20"
                            >
                              <Clock size={12} /> Pause
                            </button>
                          )}
                          {t.status === 'paused' && (
                            <button
                              onClick={() => handleResume(t.id)}
                              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 text-[11px] font-bold hover:bg-emerald-500/20"
                            >
                              <Play size={12} /> Resume
                            </button>
                          )}
                          <button
                            onClick={() => handleStop(t.id)}
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-destructive/10 text-destructive border border-destructive/20 text-[11px] font-bold hover:bg-destructive/20"
                          >
                            <XCircle size={12} /> Force stop
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
