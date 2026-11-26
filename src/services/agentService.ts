import { getApiUrl } from './whatsappService';

/** Types mirroring the bridge's /api/agent contract. */

export interface AuthorizedNumber {
  id: string;
  phone: string;
  label: string;
  enabled: boolean;
  addedAt?: string;
}

export type ConfirmationPolicy =
  | 'confirm_all_except_reads'
  | 'confirm_only_destructive'
  | 'confirm_everything';

export interface AgentPermissions {
  fileSystem: boolean;
  screen: boolean;
  input: boolean;
  browser: boolean;
  confirmationPolicy: ConfirmationPolicy;
}

export interface AgentConfig {
  accountId: string;
  enabled: boolean;
  authorizedNumbers: AuthorizedNumber[];
  permissions: AgentPermissions;
  updatedAt?: string;
}

export interface AgentTaskStep {
  at: string;
  type: string;
  tool?: string;
  args?: any;
  result?: string | null;
  error?: string | null;
  detail?: string;
}

export interface AgentTask {
  id: string;
  accountId: string;
  requesterNumber: string;
  requesterName?: string;
  instruction: string;
  status: string;
  steps: AgentTaskStep[];
  summary?: string | null;
  error?: string | null;
  durationSec?: number | null;
  createdAt: string;
  updatedAt: string;
}

export interface AgentHealth {
  ok: boolean;
  model: string;
  capabilities: { fileSystem: boolean; screen: boolean; input: boolean; browser?: boolean };
}

async function parse(res: Response) {
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as any).error || `HTTP ${res.status}`);
  return data as any;
}

export const getAgentHealth = async (): Promise<AgentHealth> =>
  parse(await fetch(getApiUrl('/api/agent/health')));

export const getAgentConfigs = async (): Promise<AgentConfig[]> =>
  (await parse(await fetch(getApiUrl('/api/agent/config')))).configs || [];

export const saveAgentConfig = async (
  accountId: string,
  patch: Partial<AgentConfig>
): Promise<AgentConfig> =>
  (
    await parse(
      await fetch(getApiUrl('/api/agent/config'), {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accountId, ...patch }),
      })
    )
  ).config;

export const getAgentActivity = async (accountId?: string): Promise<AgentTask[]> =>
  (
    await parse(
      await fetch(getApiUrl(`/api/agent/activity${accountId ? `?accountId=${encodeURIComponent(accountId)}` : ''}`))
    )
  ).tasks || [];

export const runAgentTask = async (accountId: string, instruction: string) =>
  parse(
    await fetch(getApiUrl('/api/agent/execute'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ accountId, instruction }),
    })
  );

export const confirmAgentTask = async (accountId: string, approved: boolean, sender = 'web-ui') =>
  parse(
    await fetch(getApiUrl('/api/agent/confirm'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ accountId, approved, sender }),
    })
  );

export type AgentControlAction = 'stop' | 'pause' | 'resume' | 'status';

export const controlAgentTask = async (
  accountId: string,
  action: AgentControlAction,
  opts: { sender?: string; taskId?: string } = {}
) =>
  parse(
    await fetch(getApiUrl('/api/agent/control'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ accountId, action, sender: opts.sender || 'web-ui', taskId: opts.taskId }),
    })
  );

export const stopAgentTask = async (accountId: string, sender = 'web-ui', taskId?: string) =>
  controlAgentTask(accountId, 'stop', { sender, taskId });

export const pauseAgentTask = async (accountId: string, sender = 'web-ui') =>
  controlAgentTask(accountId, 'pause', { sender });

export const resumeAgentTask = async (accountId: string, sender = 'web-ui') =>
  controlAgentTask(accountId, 'resume', { sender });

export const getAgentTaskStatus = async (accountId: string, sender = 'web-ui') =>
  controlAgentTask(accountId, 'status', { sender });

export const clearAgentContext = async (accountId: string, sender: string) =>
  parse(
    await fetch(getApiUrl('/api/agent/context/clear'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ accountId, sender }),
    })
  );

/** ── AI Providers ─────────────────────────────────────────────────────────── */

export interface ProviderModel {
  id: string;
  name: string;
}

export interface AIProvider {
  id: string;
  name: string;
  baseUrl: string;
  apiKey: string;
  models: ProviderModel[];
}

export interface ProvidersState {
  providers: AIProvider[];
  activeProviderId: string | null;
  activeModelId: string | null;
  updatedAt?: string;
}

export const getProviders = async (): Promise<ProvidersState> =>
  parse(await fetch(getApiUrl('/api/agent/providers')));

export const saveProvider = async (
  provider: { name: string; baseUrl: string; apiKey: string; models: string[] }
): Promise<ProvidersState> =>
  parse(
    await fetch(getApiUrl('/api/agent/providers'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(provider),
    })
  );

export const deleteProvider = async (id: string): Promise<ProvidersState> =>
  parse(await fetch(getApiUrl(`/api/agent/providers/${encodeURIComponent(id)}`), { method: 'DELETE' }));

export const setActiveProvider = async (providerId: string, modelId?: string): Promise<ProvidersState> =>
  parse(
    await fetch(getApiUrl('/api/agent/providers/active'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ providerId, modelId }),
    })
  );

export const importOpencodeProviders = async (path?: string): Promise<ProvidersState & { imported: number; path: string }> =>
  parse(
    await fetch(getApiUrl('/api/agent/providers/import-opencode'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(path ? { path } : {}),
    })
  );
