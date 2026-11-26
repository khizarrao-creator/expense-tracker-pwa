import React, { useEffect, useState } from 'react';
import { Bot, Loader2, ShieldCheck, Smartphone, AlertTriangle } from 'lucide-react';
import { AgentPanel } from '../components/agent/AgentPanel';
import AgentProviders from '../components/agent/AgentProviders';
import { getAgentHealth, type AgentHealth } from '../services/agentService';
import { getWhatsAppStatus, type WhatsAppAccount } from '../services/whatsappService';

const AIAgents: React.FC = () => {
  const [accounts, setAccounts] = useState<WhatsAppAccount[]>([]);
  const [activeId, setActiveId] = useState<string>('account1');
  const [health, setHealth] = useState<AgentHealth | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const [status, h] = await Promise.all([
          getWhatsAppStatus().catch(() => ({ accounts: [] as WhatsAppAccount[] })),
          getAgentHealth().catch(() => null),
        ]);
        setAccounts(status.accounts || []);
        if (status.accounts?.length) setActiveId(status.accounts[0].id);
        setHealth(h);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const active = accounts.find((a) => a.id === activeId);
  const providerOk = !!health?.provider?.hasKey;

  return (
    <div className="max-w-5xl mx-auto p-4 md:p-6 space-y-5">
      {/* Header */}
      <div className="flex items-start gap-3">
        <div className="p-2.5 rounded-2xl border bg-primary/10 text-primary border-primary/20">
          <Bot size={22} />
        </div>
        <div>
          <h1 className="text-lg md:text-xl font-bold">AI Computer Use Agents</h1>
          <p className="text-xs text-muted-foreground mt-0.5 max-w-2xl">
            Configure autonomous agents that operate this computer on your behalf. Authorized WhatsApp numbers can
            send instructions; the agent plans, executes and reports — asking for confirmation before consequential
            actions.
          </p>
        </div>
      </div>

      {/* Provider / capability banner */}
      <div className="bg-card border border-border rounded-3xl p-4 flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2 text-xs font-semibold">
          <ShieldCheck size={15} className={providerOk ? 'text-emerald-500' : 'text-amber-500'} />
          AI Provider
        </div>
        {loading ? (
          <span className="text-xs text-muted-foreground flex items-center gap-1.5">
            <Loader2 size={12} className="animate-spin" /> checking…
          </span>
        ) : health ? (
          <>
            <span className="text-[11px] px-2 py-1 rounded-lg border border-border bg-muted/20 font-mono">
              {health.provider?.provider || 'unknown'} · {health.model}
            </span>
            {!providerOk && (
              <span className="text-[11px] text-amber-600 dark:text-amber-400 flex items-center gap-1">
                <AlertTriangle size={12} /> No API key configured for the provider
              </span>
            )}
          </>
        ) : (
          <span className="text-[11px] text-amber-600 dark:text-amber-400 flex items-center gap-1">
            <AlertTriangle size={12} /> Bridge server offline — start it (npm start in the server folder)
          </span>
        )}
      </div>

      {/* Provider registry */}
      <AgentProviders />

      {/* Account selector */}
      {accounts.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">WhatsApp account</span>
          {accounts.map((acc) => (
            <button
              key={acc.id}
              onClick={() => setActiveId(acc.id)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-xs font-semibold transition-all ${
                acc.id === activeId
                  ? 'bg-primary text-primary-foreground border-primary'
                  : 'bg-card border-border text-muted-foreground hover:text-foreground'
              }`}
            >
              <Smartphone size={12} />
              {acc.name}
              <span className={`w-1.5 h-1.5 rounded-full ${acc.status === 'connected' ? 'bg-emerald-400' : 'bg-muted-foreground/40'}`} />
            </button>
          ))}
        </div>
      )}

      {/* Per-account agent config */}
      <AgentPanel accountId={activeId} accountName={active?.name} />
    </div>
  );
};

export default AIAgents;
