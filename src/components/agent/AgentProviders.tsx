import React, { useEffect, useState } from 'react';
import { Server, Plus, Trash2, Loader2, Check, RefreshCw, Download, KeyRound, X } from 'lucide-react';
import { toast } from 'sonner';
import {
  getProviders,
  saveProvider,
  deleteProvider,
  setActiveProvider,
  importOpencodeProviders,
  type ProvidersState,
  type AIProvider,
} from '../../services/agentService';

const AgentProviders: React.FC = () => {
  const [state, setState] = useState<ProvidersState | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const [selectedModel, setSelectedModel] = useState<Record<string, string>>({});

  const [name, setName] = useState('');
  const [baseUrl, setBaseUrl] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [models, setModels] = useState('');
  const [importPath, setImportPath] = useState('');

  const load = async () => {
    setLoading(true);
    try {
      setState(await getProviders());
    } catch (e: any) {
      toast.error('Failed to load providers: ' + (e.message || e));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const handleAdd = async () => {
    if (!name.trim() || !baseUrl.trim()) {
      toast.error('Name and Base URL are required.');
      return;
    }
    setBusy(true);
    try {
      const s = await saveProvider({
        name: name.trim(),
        baseUrl: baseUrl.trim(),
        apiKey: apiKey.trim(),
        models: models.split(',').map((m) => m.trim()).filter(Boolean),
      });
      setState(s);
      setName('');
      setBaseUrl('');
      setApiKey('');
      setModels('');
      setShowAdd(false);
      toast.success('Provider saved.');
    } catch (e: any) {
      toast.error('Save failed: ' + (e.message || e));
    } finally {
      setBusy(false);
    }
  };

  const handleUse = async (p: AIProvider) => {
    const model = selectedModel[p.id] || p.models[0]?.id;
    if (!model) {
      toast.error('This provider has no models — add at least one.');
      return;
    }
    setBusy(true);
    try {
      setState(await setActiveProvider(p.id, model));
      toast.success(`Active provider: ${p.name} · ${model}`);
    } catch (e: any) {
      toast.error('Failed: ' + (e.message || e));
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = async (p: AIProvider) => {
    if (!confirm(`Remove provider "${p.name}"?`)) return;
    setBusy(true);
    try {
      setState(await deleteProvider(p.id));
      toast.success('Provider removed.');
    } catch (e: any) {
      toast.error('Failed: ' + (e.message || e));
    } finally {
      setBusy(false);
    }
  };

  const handleImport = async () => {
    setBusy(true);
    try {
      const r = await importOpencodeProviders(importPath.trim() || undefined);
      setState(r);
      toast.success(`Imported ${r.imported} provider(s) from ${r.path}`);
    } catch (e: any) {
      toast.error('Import failed: ' + (e.message || e));
    } finally {
      setBusy(false);
    }
  };

  const activeProvider = state?.providers.find((p) => p.id === state.activeProviderId);

  return (
    <div className="bg-card border border-border rounded-3xl p-5 space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <div className="p-2 rounded-xl border bg-primary/10 text-primary border-primary/20">
            <Server size={18} />
          </div>
          <div>
            <h3 className="font-bold text-sm">AI Providers</h3>
            <p className="text-[11px] text-muted-foreground mt-0.5 max-w-xl">
              Add OpenAI-compatible providers (base URL + key + models). The agent uses the active provider.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={load} className="text-[10px] text-muted-foreground hover:text-foreground flex items-center gap-1">
            <RefreshCw size={12} /> Refresh
          </button>
          <button
            onClick={() => setShowAdd((v) => !v)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-primary text-primary-foreground text-xs font-bold hover:opacity-90"
          >
            {showAdd ? <X size={13} /> : <Plus size={13} />} {showAdd ? 'Close' : 'Add Provider'}
          </button>
        </div>
      </div>

      {/* Active indicator */}
      <div className="flex flex-wrap items-center gap-2 border-t border-border/40 pt-3 text-xs">
        <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Active</span>
        {activeProvider ? (
          <span className="px-2 py-1 rounded-lg border border-emerald-500/30 bg-emerald-500/5 text-emerald-600 dark:text-emerald-400 font-semibold">
            {activeProvider.name} · {state?.activeModelId}
          </span>
        ) : (
          <span className="text-muted-foreground italic">None selected — the agent falls back to env/Gemini config.</span>
        )}
      </div>

      {/* Add form */}
      {showAdd && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 border border-border/60 rounded-2xl p-3 bg-muted/10">
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Provider name (e.g. LiteLLM)"
            className="bg-muted/20 border border-border/60 rounded-xl px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-primary/40" />
          <input value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} placeholder="Base URL (e.g. https://llm02.itserver.biz/v1)"
            className="bg-muted/20 border border-border/60 rounded-xl px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-primary/40" />
          <input value={apiKey} onChange={(e) => setApiKey(e.target.value)} placeholder="API key (sk-...)" type="password"
            className="bg-muted/20 border border-border/60 rounded-xl px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-primary/40" />
          <input value={models} onChange={(e) => setModels(e.target.value)} placeholder="Models, comma-separated (deepseek-v4.1-flash, glm-5.3-flash)"
            className="bg-muted/20 border border-border/60 rounded-xl px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-primary/40" />
          <div className="sm:col-span-2 flex justify-end">
            <button onClick={handleAdd} disabled={busy}
              className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-primary text-primary-foreground text-xs font-bold hover:opacity-90 disabled:opacity-50">
              {busy ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />} Save Provider
            </button>
          </div>
        </div>
      )}

      {/* Import from opencode */}
      <div className="flex flex-col sm:flex-row gap-2 border border-dashed border-border/60 rounded-2xl p-3">
        <input value={importPath} onChange={(e) => setImportPath(e.target.value)}
          placeholder="~/.config/opencode/opencode.jsonc (leave blank for default)"
          className="flex-1 bg-muted/20 border border-border/60 rounded-xl px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-primary/40" />
        <button onClick={handleImport} disabled={busy}
          className="flex items-center justify-center gap-1.5 px-4 py-2 rounded-xl border border-border bg-muted/20 text-xs font-bold hover:bg-muted/40 disabled:opacity-50">
          {busy ? <Loader2 size={13} className="animate-spin" /> : <Download size={13} />} Import from opencode.jsonc
        </button>
      </div>

      {/* Providers list */}
      {loading ? (
        <div className="flex items-center gap-2 text-xs text-muted-foreground py-4 justify-center">
          <Loader2 size={14} className="animate-spin" /> Loading providers…
        </div>
      ) : !state || state.providers.length === 0 ? (
        <p className="text-[11px] text-muted-foreground italic">No providers yet. Add one, or import from opencode.jsonc.</p>
      ) : (
        <div className="space-y-2">
          {state.providers.map((p) => {
            const isActive = state.activeProviderId === p.id;
            return (
              <div key={p.id} className={`border rounded-2xl p-3 ${isActive ? 'border-emerald-500/40 bg-emerald-500/[0.03]' : 'border-border/60'}`}>
                <div className="flex items-center gap-2">
                  <KeyRound size={14} className="text-muted-foreground shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-bold flex items-center gap-2">
                      {p.name}
                      {isActive && <span className="text-[9px] uppercase tracking-wider text-emerald-600 dark:text-emerald-400">active</span>}
                    </p>
                    <p className="text-[10px] text-muted-foreground font-mono truncate">{p.baseUrl}</p>
                  </div>
                  <button onClick={() => handleDelete(p)} className="p-1.5 text-muted-foreground hover:text-destructive" title="Remove">
                    <Trash2 size={14} />
                  </button>
                </div>

                {p.models.length > 0 && (
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <select
                      value={selectedModel[p.id] || p.models[0].id}
                      onChange={(e) => setSelectedModel((m) => ({ ...m, [p.id]: e.target.value }))}
                      className="bg-muted/20 border border-border/60 rounded-lg px-2 py-1 text-[11px] focus:outline-none"
                    >
                      {p.models.map((m) => (
                        <option key={m.id} value={m.id}>{m.name || m.id}</option>
                      ))}
                    </select>
                    <button onClick={() => handleUse(p)} disabled={busy}
                      className="px-3 py-1 rounded-lg bg-primary/10 text-primary border border-primary/20 text-[11px] font-bold hover:bg-primary/20 disabled:opacity-50">
                      Set active
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default AgentProviders;
