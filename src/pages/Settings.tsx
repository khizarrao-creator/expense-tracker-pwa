import React, { useState, useRef } from 'react';
import * as XLSX from 'xlsx';
import { getTransactions, exportAllData, importAllData, clearAllData, vacuumDB, normalizeCategories, getDBSizeMB, getAiAgentLogs } from '../db/queries';
import { Download, CloudSync, FileJson, Upload, AlertTriangle, LayoutList, ChevronRight, User as UserIcon, Mail, Shield, LogOut, CheckCircle2, X, Eye, EyeOff, Key, MessageSquare, Sparkles, ShieldCheck, Zap, Loader2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useCurrency } from '../contexts/CurrencyContext';
import { useTheme } from '../contexts/ThemeContext';
import { useSync } from '../contexts/SyncContext';
import { useAuth } from '../contexts/AuthContext';
import { useApp } from '../contexts/AppContext';
import { toast } from 'sonner';
import { syncManager } from '../db/SyncManager';
import ConfirmModal from '../components/ConfirmModal';
import AdminTransitionOverlay from '../components/AdminTransitionOverlay';
import { getQuotaUsage, type QuotaStatus } from '../services/ai';

const Settings: React.FC = () => {
  const { currency, setCurrency, currencies } = useCurrency();
  const navigate = useNavigate();
  const { theme, setTheme } = useTheme();
  const { forceSync, isSyncing, lastSynced } = useSync();
  const { user, isPro, signOut } = useAuth();
  const { config: appConfig, userPlan, plansConfig, planLimits } = useApp();

  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [showMasterWipeConfirm, setShowMasterWipeConfirm] = useState(false);
  const [showImportConfirm, setShowImportConfirm] = useState(false);
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
  const [pendingImportData, setPendingImportData] = useState<any>(null);
  const [isWiping, setIsWiping] = useState(false);
  const [isOptimizing, setIsOptimizing] = useState(false);
  const [username, setUsername] = useState('');
  const [dbSize, setDbSize] = useState<string>('0');
  const [isSavingUsername, setIsSavingUsername] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [showAdminTransition, setShowAdminTransition] = useState(false);

  // AI Quota & Rate Limit States
  const [quotaUsage, setQuotaUsage] = useState<QuotaStatus>(() => getQuotaUsage());

  // Exchange Settings States
  const [isExchangeSettingsOpen, setIsExchangeSettingsOpen] = useState(false);
  const [selectedExchangeId, setSelectedExchangeId] = useState('mexc');
  const [apiKeyInput, setApiKeyInput] = useState('');
  const [apiSecretInput, setApiSecretInput] = useState('');
  const [showApiKeys, setShowApiKeys] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [testStatus, setTestStatus] = useState<{ success: boolean; message: string } | null>(null);
  const [connectionStatus, setConnectionStatus] = useState<'idle' | 'connected' | 'not_configured'>('idle');
  const [isSavingKeys, setIsSavingKeys] = useState(false);

  // AI Agent Approval Settings States
  const [aiApproveMode, setAiApproveMode] = useState<'auto' | 'manual'>(() => {
    return (localStorage.getItem('ai_agent_approve_mode') as 'auto' | 'manual') || 'manual';
  });

  const handleAiApproveModeChange = (mode: 'auto' | 'manual') => {
    localStorage.setItem('ai_agent_approve_mode', mode);
    setAiApproveMode(mode);
    toast.success(`AI Agent operations set to ${mode === 'auto' ? 'Auto-Approve' : 'Manual Approval'}`);
  };

  // AI Agent Activity Log States
  const [isLogsOpen, setIsLogsOpen] = useState(false);
  const [logs, setLogs] = useState<any[]>([]);
  const [isLoadingLogs, setIsLoadingLogs] = useState(false);

  const fetchLogs = async () => {
    setIsLoadingLogs(true);
    try {
      const data = await getAiAgentLogs();
      setLogs(data);
    } catch (e) {
      console.error('[Settings] Failed to fetch AI logs:', e);
      toast.error('Failed to load AI activity logs');
    } finally {
      setIsLoadingLogs(false);
    }
  };

  const openChatSession = (sessId: string) => {
    localStorage.setItem('ledger_ai_session_id', sessId);
    navigate('/ai-chat');
    toast.success('Loading conversation session...');
  };

  const handleThemeChange = (newTheme: 'light' | 'dark' | 'eye-comfort' | 'system' | 'system-comfort') => {
    setTheme(newTheme);
    const names = {
      'light': 'Light',
      'dark': 'iOS Black',
      'eye-comfort': 'Eye Comfort',
      'system': 'System Light/Dark',
      'system-comfort': 'System Light/Comfort'
    };
    toast.success(`${names[newTheme]} theme applied`);
  };

  React.useEffect(() => {
    const handleUpdate = () => {
      setQuotaUsage(getQuotaUsage());
    };

    window.addEventListener('ai_quota_updated', handleUpdate);

    // Periodically refresh to show cooling down of sliding window (RPM/TPM)
    const interval = setInterval(handleUpdate, 1000);

    return () => {
      window.removeEventListener('ai_quota_updated', handleUpdate);
      clearInterval(interval);
    };
  }, []);

  React.useEffect(() => {
    const loadData = async () => {
      const queries = await import('../db/queries');
      const saved = await queries.getConfig('username');
      if (saved) setUsername(saved);

      // Get live DB size from the in-memory SQLite instance (post-VACUUM accurate)
      setDbSize(getDBSizeMB().toString());
    };
    loadData();
  }, []);

  // Fetch Exchange API Keys when selection or modal state changes
  React.useEffect(() => {
    const loadExchangeKeys = async () => {
      const { getConfig } = await import('../db/queries');
      const keyName = `${selectedExchangeId}_api_key`;
      const secretName = `${selectedExchangeId}_api_secret`;

      const [key, secret] = await Promise.all([
        getConfig(keyName),
        getConfig(secretName)
      ]);

      if (key && secret) {
        setApiKeyInput(key);
        setApiSecretInput(secret);
        setConnectionStatus('connected');
      } else {
        setApiKeyInput('');
        setApiSecretInput('');
        setConnectionStatus('not_configured');
      }
      setTestStatus(null);
    };
    if (isExchangeSettingsOpen) {
      loadExchangeKeys();
    }
  }, [selectedExchangeId, isExchangeSettingsOpen]);

  const handleSaveKeys = async () => {
    if (!apiKeyInput.trim() || !apiSecretInput.trim()) {
      toast.error('Both API Key and API Secret are required');
      return;
    }
    setIsSavingKeys(true);
    try {
      const { setConfig } = await import('../db/queries');
      const keyName = `${selectedExchangeId}_api_key`;
      const secretName = `${selectedExchangeId}_api_secret`;

      await Promise.all([
        setConfig(keyName, apiKeyInput.trim()),
        setConfig(secretName, apiSecretInput.trim())
      ]);

      toast.success('Exchange credentials saved successfully');
      setConnectionStatus('connected');
    } catch (e) {
      toast.error('Failed to save exchange credentials');
    } finally {
      setIsSavingKeys(false);
    }
  };

  const handleClearKeys = async () => {
    if (!confirm('Are you sure you want to remove this exchange configuration?')) return;
    setIsSavingKeys(true);
    try {
      const { setConfig } = await import('../db/queries');
      const keyName = `${selectedExchangeId}_api_key`;
      const secretName = `${selectedExchangeId}_api_secret`;

      await Promise.all([
        setConfig(keyName, ''),
        setConfig(secretName, '')
      ]);

      setApiKeyInput('');
      setApiSecretInput('');
      setConnectionStatus('not_configured');
      setTestStatus(null);
      toast.success('Exchange credentials removed');
    } catch (e) {
      toast.error('Failed to clear credentials');
    } finally {
      setIsSavingKeys(false);
    }
  };

  const handleTestConnection = async () => {
    if (!apiKeyInput.trim() || !apiSecretInput.trim()) {
      toast.error('Please enter API Key and Secret first');
      return;
    }
    setIsTesting(true);
    setTestStatus(null);
    try {
      if (selectedExchangeId === 'mexc') {
        const { getMEXCData } = await import('../db/queries');
        const res = await getMEXCData(apiKeyInput.trim(), apiSecretInput.trim());
        if (res && res.error) {
          setTestStatus({ success: false, message: `Error: ${res.error}` });
          toast.error(`Connection failed: ${res.error}`);
        } else if (res && res.balances) {
          const activeBalances = res.balances.filter((b: any) => parseFloat(b.free) > 0 || parseFloat(b.locked) > 0);
          setTestStatus({
            success: true,
            message: `Connected successfully! Verified ${activeBalances.length} active asset wallets.`
          });
          toast.success('Connection test passed!');
        } else {
          setTestStatus({ success: false, message: 'Invalid response from exchange API' });
          toast.error('Invalid response format');
        }
      } else {
        setTestStatus({ success: true, message: `Connectivity simulation successful for ${selectedExchangeId}` });
        toast.success(`Simulation passed for ${selectedExchangeId}`);
      }
    } catch (e: any) {
      setTestStatus({ success: false, message: e.message || 'Network error connecting to exchange' });
      toast.error('Connection test failed');
    } finally {
      setIsTesting(false);
    }
  };

  const handleSaveUsername = async () => {
    if (!username.trim()) {
      toast.error('Please enter a valid username');
      return;
    }
    setIsSavingUsername(true);
    try {
      await import('../db/queries').then(m => m.setConfig('username', username.trim()));
      toast.success('Username updated successfully');
    } catch (error) {
      toast.error('Failed to update username');
    } finally {
      setIsSavingUsername(false);
    }
  };



  const exportCSV = async () => {
    try {
      const data = await getTransactions(10000);

      const worksheetData = data.map(t => ({
        'ID': t.id,
        'Type': t.type,
        'Amount': t.amount,
        'Category': t.category,
        'Description': t.description,
        'Date': t.date,
        'Bank/Account': t.account_name || 'N/A',
        'Payment Method': t.payment_method,
        'Created At': t.created_at
      }));

      const worksheet = XLSX.utils.json_to_sheet(worksheetData);
      const csv = XLSX.utils.sheet_to_csv(worksheet);

      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.setAttribute('href', url);
      link.setAttribute('download', `expense_tracker_export_${new Date().toISOString().split('T')[0]}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      toast.success('CSV exported successfully');
    } catch (error) {
      console.error('Failed to export CSV', error);
      toast.error('CSV Export failed');
    }
  };

  const exportXLSX = async () => {
    try {
      const data = await getTransactions(10000);

      const worksheetData = data.map(t => ({
        'ID': t.id,
        'Type': t.type,
        'Amount': t.amount,
        'Category': t.category,
        'Description': t.description,
        'Date': t.date,
        'Bank/Account': t.account_name || 'N/A',
        'Payment Method': t.payment_method,
        'Created At': t.created_at
      }));

      const worksheet = XLSX.utils.json_to_sheet(worksheetData);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, 'Transactions');

      XLSX.writeFile(workbook, `expense_tracker_export_${new Date().toISOString().split('T')[0]}.xlsx`);
      toast.success('XLSX exported successfully');
    } catch (error) {
      console.error('Failed to export XLSX', error);
      toast.error('XLSX Export failed');
    }
  };

  const handleJsonExport = async () => {
    try {
      const data = await exportAllData();
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.setAttribute('href', url);
      link.setAttribute('download', `expense_tracker_backup_${new Date().toISOString().split('T')[0]}.json`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      toast.success('Backup created successfully');
      return true;
    } catch (error) {
      console.error('Failed to export JSON', error);
      toast.error('Backup failed');
      return false;
    }
  };

  const handleDataImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      toast.loading('Analyzing file...', { id: 'importProcess' });
      const extension = file.name.split('.').pop()?.toLowerCase();

      if (extension === 'json') {
        const text = await file.text();
        const data = JSON.parse(text);
        setPendingImportData(data);
      } else if (extension === 'csv' || extension === 'xlsx') {
        const dataBuffer = await file.arrayBuffer();
        const workbook = XLSX.read(dataBuffer, { type: 'array' });
        const firstSheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[firstSheetName];
        const json = XLSX.utils.sheet_to_json<any>(worksheet);

        const deviceId = localStorage.getItem('deviceId') || 'unknown';
        const transactions = json.map((row: any) => ({
          id: row['ID'] || crypto.randomUUID(),
          type: row['Type']?.toLowerCase() || 'expense',
          amount: parseFloat(row['Amount']) || 0,
          category: row['Category'] || 'Other',
          description: row['Description'] || '',
          date: row['Date'] || new Date().toISOString().split('T')[0],
          payment_method: row['Payment Method'] || '',
          created_at: row['Created At'] || new Date().toISOString(),
          updated_at: new Date().toISOString(),
          deviceId
        }));

        setPendingImportData({ transactions });
      } else {
        toast.dismiss('importProcess');
        toast.error('Unsupported file format');
        return;
      }

      toast.dismiss('importProcess');
      setShowImportConfirm(true);
    } catch (error) {
      console.error('Import failed', error);
      toast.dismiss('importProcess');
      toast.error('Invalid or corrupted file');
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const confirmImportData = async () => {
    if (!pendingImportData) return;
    try {
      await importAllData(pendingImportData);
      toast.success('Data imported successfully. Syncing...');
      forceSync();
      setTimeout(() => window.location.reload(), 2000);
    } catch (error) {
      console.error('Import failed', error);
      toast.error('Failed to import data');
    } finally {
      setPendingImportData(null);
      setShowImportConfirm(false);
    }
  };

  const handleMasterWipe = async () => {
    setIsWiping(true);
    try {
      // 1. Download Backup first as safety measure
      toast.loading('Creating emergency backup...');
      const backupSuccess = await handleJsonExport();
      if (!backupSuccess) {
        if (!confirm("Emergency backup failed. Do you want to proceed with deletion anyway?")) {
          setIsWiping(false);
          return;
        }
      }

      // 2. Wipe Remote (Firestore)
      toast.loading('Wiping cloud data...');
      await syncManager.wipeRemoteData();

      // 3. Wipe Local (SQLite)
      toast.loading('Wiping local database...');
      await clearAllData();

      toast.success('All data erased. Signing out...');
      setTimeout(async () => {
        await signOut();
        window.location.href = '/login';
      }, 2000);
    } catch (error) {
      console.error('Master wipe failed', error);
      toast.error('Failed to complete data wipe');
    } finally {
      setIsWiping(false);
      setShowMasterWipeConfirm(false);
    }
  };

  const confirmClearLocal = async () => {
    try {
      await clearAllData();
      toast.success('Local database cleared. Reloading...');
      setTimeout(() => window.location.reload(), 1500);
    } catch (error) {
      toast.error('Failed to clear database');
    } finally {
      setShowClearConfirm(false);
    }
  };

  const [titleClicks, setTitleClicks] = useState(0);

  const handleTitleClick = () => {
    const nextClicks = titleClicks + 1;
    if (nextClicks >= 5) {
      setTitleClicks(0);
      setShowAdminTransition(true);
    } else {
      setTitleClicks(nextClicks);
    }
  };

  const handleAdminTransitionComplete = () => {
    setShowAdminTransition(false);
    navigate('/admin');
  };

  return (
    <div className="max-w-xl mx-auto space-y-8">
      <AdminTransitionOverlay
        isActive={showAdminTransition}
        onComplete={handleAdminTransitionComplete}
      />
      <h1
        className="text-2xl font-bold cursor-default select-none"
        onClick={handleTitleClick}
      >
        Settings
      </h1>

      <ConfirmModal
        isOpen={showClearConfirm}
        title="Clear Local Database?"
        message="This will permanently erase ALL local data. Cloud data will remain and will be re-downloaded next time you sync."
        onConfirm={confirmClearLocal}
        onCancel={() => setShowClearConfirm(false)}
        variant="danger"
        confirmText="Clear Local"
      />

      <ConfirmModal
        isOpen={showMasterWipeConfirm}
        title="ERASE ALL DATA EVERYWHERE?"
        message="CRITICAL WARNING: This will permanently delete your data from both this device AND the cloud server. We will download a backup for you before starting, but this action is otherwise irreversible."
        onConfirm={handleMasterWipe}
        onCancel={() => setShowMasterWipeConfirm(false)}
        variant="danger"
        confirmText="Yes, Wipe Everything"
      />

      <ConfirmModal
        isOpen={showImportConfirm}
        title="Import Backup Data?"
        message="This will merge the imported data with your existing records. Duplicate IDs will be overwritten. Proceed?"
        onConfirm={confirmImportData}
        onCancel={() => { setShowImportConfirm(false); setPendingImportData(null); }}
        variant="danger"
        confirmText="Import & Merge"
      />

      <ConfirmModal
        isOpen={showLogoutConfirm}
        title="Sign Out?"
        message="Are you sure you want to sign out of your account? You will need to sign in again to access your synced data."
        onConfirm={() => signOut()}
        onCancel={() => setShowLogoutConfirm(false)}
        variant="danger"
        confirmText="Sign Out"
      />

      {/* Currency & Appearance sections remain same but with updated styles if needed */}
      {/* Profile Section */}
      <div className="bg-card p-6 rounded-2xl shadow-sm border border-border relative overflow-hidden">
        <div className="absolute top-0 right-0 w-32 h-32 bg-primary/5 rounded-full -mr-16 -mt-16 blur-3xl" />

        <div className="flex flex-col md:flex-row items-center gap-6 mb-8">
          <div className="relative">
            {(user?.photoURL || user?.providerData?.[0]?.photoURL) ? (
              <img
                src={user.photoURL || user.providerData[0].photoURL || ''}
                alt="Profile"
                className="w-24 h-24 rounded-2xl object-cover ring-4 ring-background shadow-xl"
                onError={(e) => {
                  (e.target as HTMLImageElement).style.display = 'none';
                  (e.target as HTMLImageElement).parentElement?.querySelector('.avatar-fallback')?.classList.remove('hidden');
                }}
              />
            ) : null}
            {(!(user?.photoURL || user?.providerData?.[0]?.photoURL)) && (
              <div className="avatar-fallback w-24 h-24 rounded-2xl bg-primary/10 flex items-center justify-center text-primary ring-4 ring-background shadow-xl">
                <UserIcon size={40} />
              </div>
            )}
            <div className="avatar-fallback hidden w-24 h-24 rounded-2xl bg-primary/10 flex items-center justify-center text-primary ring-4 ring-background shadow-xl">
              <UserIcon size={40} />
            </div>
            <div className="absolute -bottom-2 -right-2 bg-emerald-500 text-white p-1.5 rounded-full ring-4 ring-background shadow-lg">
              <CheckCircle2 size={14} />
            </div>
          </div>

          <div className="flex-1 text-center md:text-left space-y-1">
            <h2 className="text-2xl font-bold tracking-tight">{user?.displayName || username || 'Guest User'}</h2>
            <div className="flex items-center justify-center md:justify-start gap-2 text-muted-foreground text-sm">
              <Mail size={14} />
              <span>{user?.email || 'No email linked'}</span>
            </div>
            <div className="flex items-center justify-center md:justify-start gap-2 mt-2">
              <span className="px-2.5 py-0.5 bg-primary/10 text-primary text-[10px] font-bold uppercase tracking-wider rounded-full flex items-center gap-1 border border-primary/20">
                <Shield size={10} /> Account Active
              </span>
              {isPro && (
                <span className="px-2.5 py-0.5 bg-emerald-500/10 text-emerald-500 text-[10px] font-bold uppercase tracking-wider rounded-full border border-emerald-500/20">
                  Pro Verified
                </span>
              )}
            </div>
          </div>

          <button
            onClick={() => setShowLogoutConfirm(true)}
            className="flex items-center gap-2 px-5 py-2.5 bg-destructive/10 text-destructive font-semibold rounded-xl hover:bg-destructive/20 transition-all active:scale-95 text-sm"
          >
            <LogOut size={18} />
            Sign Out
          </button>
        </div>

        <div className="space-y-4 pt-6 border-t border-border/50">
          <div>
            <label className="block text-xs font-bold uppercase tracking-widest text-muted-foreground mb-2 ml-1">Custom Display Name</label>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <div className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground">
                  <UserIcon size={18} />
                </div>
                <input
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="Change your display name..."
                  className="w-full pl-11 pr-4 py-3 bg-background/50 border border-border rounded-xl focus:outline-none focus:ring-2 focus:ring-primary outline-none transition-all"
                />
              </div>
              <button
                onClick={handleSaveUsername}
                disabled={isSavingUsername}
                className="px-8 py-3 bg-primary text-primary-foreground rounded-xl font-bold hover:shadow-lg hover:opacity-95 transition-all disabled:opacity-50 shadow-md"
              >
                {isSavingUsername ? '...' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="bg-card p-6 rounded-2xl shadow-sm border border-border">
        <h2 className="text-lg font-semibold mb-4 border-b border-border pb-4">Currency</h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {currencies.map((c) => (
            <button
              key={c.code}
              onClick={() => {
                setCurrency(c.code);
                toast.success(`Currency changed to ${c.code}`);
              }}
              className={`flex flex-col items-center justify-center p-4 rounded-xl border-2 transition-all ${currency.code === c.code ? 'border-primary bg-primary/5 text-primary' : 'border-border text-muted-foreground hover:bg-muted'
                }`}
            >
              <span className="text-xl font-bold mb-1">{c.symbol}</span>
              <span className="text-xs font-medium uppercase">{c.code}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="bg-card p-6 rounded-2xl shadow-sm border border-border">
        <h2 className="text-lg font-semibold mb-4 border-b border-border pb-4">Organization</h2>
        <button
          onClick={() => navigate('/categories')}
          className="w-full flex items-center justify-between p-4 rounded-xl border border-border hover:bg-muted transition-colors text-left group"
        >
          <div className="flex items-center gap-3">
            <div className="bg-primary/10 text-primary p-2 rounded-lg group-hover:bg-primary/20 transition-colors">
              <LayoutList size={20} />
            </div>
            <div>
              <h3 className="font-medium text-foreground">Manage Categories</h3>
              <p className="text-sm text-muted-foreground">Add, edit, or remove expense and income categories</p>
            </div>
          </div>
          <ChevronRight size={20} className="text-muted-foreground group-hover:translate-x-1 transition-transform" />
        </button>
      </div>

      {/* Exchange Integration Card */}
      <div className="bg-card p-6 rounded-2xl shadow-sm border border-border">
        <h2 className="text-lg font-semibold mb-4 border-b border-border pb-4">Integrations</h2>
        <div className="space-y-3">
          <button
            onClick={() => setIsExchangeSettingsOpen(true)}
            className="w-full flex items-center justify-between p-4 rounded-xl border border-border hover:bg-muted transition-colors text-left group"
          >
            <div className="flex items-center gap-3">
              <div className="bg-primary/10 text-primary p-2 rounded-lg group-hover:bg-primary/20 transition-colors">
                <CloudSync size={20} />
              </div>
              <div>
                <h3 className="font-medium text-foreground">Exchange Connections</h3>
                <p className="text-sm text-muted-foreground">Manage and test secure API integrations for live wallets</p>
              </div>
            </div>
            <ChevronRight size={20} className="text-muted-foreground group-hover:translate-x-1 transition-transform" />
          </button>

          <button
            onClick={() => navigate('/whatsapp?tab=settings')}
            className="w-full flex items-center justify-between p-4 rounded-xl border border-border hover:bg-muted transition-colors text-left group"
          >
            <div className="flex items-center gap-3">
              <div className="bg-emerald-500/10 text-emerald-500 p-2 rounded-lg group-hover:bg-emerald-500/20 transition-colors">
                <MessageSquare size={20} />
              </div>
              <div>
                <h3 className="font-medium text-foreground">WhatsApp Linked Devices</h3>
                <p className="text-sm text-muted-foreground">Link and manage multiple WhatsApp accounts for reminders</p>
              </div>
            </div>
            <ChevronRight size={20} className="text-muted-foreground group-hover:translate-x-1 transition-transform" />
          </button>
        </div>
      </div>

      {/* AI Assistant Settings Card */}
      <div className="bg-card p-6 rounded-2xl shadow-sm border border-border space-y-4">
        <h2 className="text-lg font-semibold border-b border-border pb-4 flex items-center gap-2">
          <Sparkles size={20} className="text-primary" />
          AI Assistant Settings
        </h2>
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground leading-relaxed">
            Configure how the AI Copilot performs updates or deletions in your financial records.
          </p>
          <div className="grid grid-cols-2 gap-3 pt-2">
            <button
              onClick={() => handleAiApproveModeChange('manual')}
              className={`flex flex-col items-center justify-center p-4 rounded-xl border-2 transition-all ${aiApproveMode === 'manual'
                  ? 'border-primary bg-primary/5 text-primary'
                  : 'border-border text-muted-foreground hover:bg-muted'
                }`}
            >
              <ShieldCheck size={22} className="mb-1.5" />
              <span className="text-xs font-bold uppercase tracking-wider">Approve Manually</span>
              <span className="text-[10px] opacity-80 mt-0.5 text-center leading-tight">Prompt for validation before any mutation</span>
            </button>
            <button
              onClick={() => handleAiApproveModeChange('auto')}
              className={`flex flex-col items-center justify-center p-4 rounded-xl border-2 transition-all ${aiApproveMode === 'auto'
                  ? 'border-primary bg-primary/5 text-primary'
                  : 'border-border text-muted-foreground hover:bg-muted'
                }`}
            >
              <Zap size={22} className="mb-1.5" />
              <span className="text-xs font-bold uppercase tracking-wider">Always Auto-Approve</span>
              <span className="text-[10px] opacity-80 mt-0.5 text-center leading-tight">Execute updates and deletes instantly</span>
            </button>
          </div>



          <div className="pt-4 border-t border-border/50">
            <button
              onClick={() => {
                fetchLogs();
                setIsLogsOpen(true);
              }}
              className="w-full flex items-center justify-between p-3.5 bg-muted/40 hover:bg-muted rounded-xl transition-colors text-left group"
            >
              <div className="flex items-center gap-3">
                <div className="bg-primary/10 text-primary p-2 rounded-lg group-hover:bg-primary/20 transition-colors">
                  <LayoutList size={18} />
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-foreground">AI Action History Logs</h3>
                  <p className="text-xs text-muted-foreground">View logs of all actions performed by the AI agent</p>
                </div>
              </div>
              <ChevronRight size={18} className="text-muted-foreground group-hover:translate-x-1 transition-transform" />
            </button>
          </div>
        </div>
      </div>

      {/* AI Plan Quota Tracker Card */}
      <div className="bg-card p-6 rounded-2xl shadow-sm border border-border space-y-6">
        <div className="flex items-center justify-between border-b border-border pb-4">
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <Sparkles size={20} className="text-primary" />
            AI Plan Quota Tracker
          </h2>
          <button
            onClick={() => navigate('/upgrade')}
            className="text-xs text-primary font-bold hover:underline flex items-center gap-1 bg-primary/5 px-2.5 py-1.5 rounded-lg border border-primary/10 transition-all hover:bg-primary/10"
          >
            Manage Subscription <ChevronRight size={12} />
          </button>
        </div>

        {/* Current Plan Details */}
        {(() => {
          const currentPlan = plansConfig[userPlan] || {
            name: userPlan.toUpperCase(),
            price: 0,
            currency: 'PKR',
            billingCycle: 'forever',
            features: [],
            limits: { aiCallsPerDay: 0, maxTransactions: 10000 },
            badgeIcon: 'shield',
            badgeColor: '#6B7280'
          };
          
          const maxCalls = planLimits?.aiCallsPerDay || 0;
          const isCallsUnlimited = maxCalls === -1;

          return (
            <div className="space-y-6">
              <div className="flex items-center justify-between p-4 bg-muted/30 border border-border/50 rounded-2xl">
                <div className="flex items-center gap-3">
                  <div 
                    className="w-10 h-10 rounded-xl flex items-center justify-center text-white font-bold"
                    style={{ backgroundColor: currentPlan.badgeColor || '#3B82F6' }}
                  >
                    <Sparkles size={20} />
                  </div>
                  <div>
                    <h3 className="font-bold text-sm text-foreground flex items-center gap-2">
                      {currentPlan.name} Plan
                      <span className="text-[10px] uppercase font-bold px-2 py-0.5 rounded-full bg-primary/10 text-primary border border-primary/20">
                        Active
                      </span>
                    </h3>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {currentPlan.price > 0 ? `${currentPlan.price} ${currentPlan.currency} / ${currentPlan.billingCycle}` : 'Free Forever'}
                    </p>
                  </div>
                </div>
                
                <div className="text-right">
                  <span className="text-xs font-bold text-muted-foreground uppercase block tracking-wider">Transaction Limit</span>
                  <span className="text-sm font-black text-foreground">
                    {currentPlan.limits?.maxTransactions === -1 ? 'Unlimited' : `${currentPlan.limits?.maxTransactions?.toLocaleString()}`}
                  </span>
                </div>
              </div>

              {/* Progress Bar for Daily AI Calls */}
              <div className="space-y-2">
                <div className="flex justify-between text-xs font-bold">
                  <span className="text-foreground">Daily AI Copilot Calls</span>
                  <span className="text-muted-foreground">
                    {isCallsUnlimited 
                      ? `${quotaUsage.rpd} / Unlimited calls` 
                      : `${quotaUsage.rpd} / ${maxCalls} calls`
                    }
                  </span>
                </div>
                
                {maxCalls > 0 ? (
                  <div className="h-2.5 w-full bg-muted/60 rounded-full overflow-hidden border border-border/20">
                    <div
                      className={`h-full transition-all duration-500 rounded-full ${
                        !isCallsUnlimited && quotaUsage.rpd >= maxCalls * 0.8
                          ? 'bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.4)]'
                          : !isCallsUnlimited && quotaUsage.rpd >= maxCalls * 0.5
                          ? 'bg-amber-500 shadow-[0_0_8px_rgba(245,158,11,0.4)]'
                          : 'bg-primary'
                      }`}
                      style={{
                        width: `${isCallsUnlimited ? 100 : Math.min(100, (quotaUsage.rpd / maxCalls) * 100)}%`
                      }}
                    />
                  </div>
                ) : (
                  <div className="bg-destructive/5 border border-destructive/15 p-4 rounded-xl space-y-3 text-center">
                    <p className="text-xs text-destructive font-semibold">
                      AI Copilot is disabled on the Standard Plan.
                    </p>
                    <button
                      onClick={() => navigate('/upgrade')}
                      className="px-4 py-2 bg-destructive/10 hover:bg-destructive/20 text-destructive text-xs font-bold rounded-xl transition-all"
                    >
                      Upgrade Subscription to Unlock
                    </button>
                  </div>
                )}
                
                <p className="text-[10px] text-muted-foreground/80 leading-normal">
                  Daily quota resets automatically at midnight local time.
                </p>
              </div>
            </div>
          );
        })()}
      </div>

      <div className="bg-card p-6 rounded-2xl shadow-sm border border-border">
        <h2 className="text-lg font-semibold mb-4 border-b border-border pb-4">Appearance</h2>
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
          {(['light', 'dark', 'eye-comfort', 'system', 'system-comfort'] as const).map((t) => {
            const label = {
              'light': 'Light',
              'dark': 'iOS Black',
              'eye-comfort': 'Eye Comfort',
              'system': 'System',
              'system-comfort': 'System + Comfort'
            }[t];
            const desc = {
              'light': 'Classic view',
              'dark': 'True black OLED',
              'eye-comfort': 'Warm & warm-tinted',
              'system': 'Auto Light/Black',
              'system-comfort': 'Auto Light/Comfort'
            }[t];

            return (
              <button
                key={t}
                onClick={() => handleThemeChange(t)}
                className={`flex flex-col items-center p-3 rounded-2xl border-2 text-center transition-all duration-300 relative overflow-hidden group ${
                  theme === t
                    ? 'border-primary bg-primary/[0.02] ring-1 ring-primary/20 shadow-sm scale-[1.02]'
                    : 'border-border/60 hover:border-muted-foreground/30 hover:bg-muted/15'
                }`}
              >
                {/* Visual Mini-Preview */}
                <div className="w-full h-14 rounded-lg mb-3 border border-border/40 relative overflow-hidden shadow-inner flex items-center justify-center bg-muted/30">
                  {t === 'light' && (
                    <div className="absolute inset-0 bg-[#fbfbfb] flex flex-col p-1.5 gap-1">
                      <div className="h-1.5 w-8 bg-primary/20 rounded"></div>
                      <div className="h-4 w-full bg-white border border-black/5 rounded shadow-sm"></div>
                    </div>
                  )}
                  {t === 'dark' && (
                    <div className="absolute inset-0 bg-[#000000] flex flex-col p-1.5 gap-1">
                      <div className="h-1.5 w-8 bg-white/20 rounded"></div>
                      <div className="h-4 w-full bg-[#0d0d0d] border border-white/5 rounded shadow-sm"></div>
                    </div>
                  )}
                  {t === 'eye-comfort' && (
                    <div className="absolute inset-0 bg-[#f7f3eb] flex flex-col p-1.5 gap-1">
                      <div className="h-1.5 w-8 bg-[#473f33]/20 rounded"></div>
                      <div className="h-4 w-full bg-[#fefdfb] border border-[#e6e1d5] rounded shadow-sm"></div>
                    </div>
                  )}
                  {t === 'system' && (
                    <div className="absolute inset-0 flex">
                      <div className="w-1/2 bg-[#fbfbfb] p-1.5 gap-1 flex flex-col">
                        <div className="h-1.5 w-full bg-primary/20 rounded"></div>
                        <div className="h-4 w-full bg-white border border-black/5 rounded"></div>
                      </div>
                      <div className="w-1/2 bg-[#000000] p-1.5 gap-1 flex flex-col">
                        <div className="h-1.5 w-full bg-white/20 rounded"></div>
                        <div className="h-4 w-full bg-[#0d0d0d] border border-white/5 rounded"></div>
                      </div>
                    </div>
                  )}
                  {t === 'system-comfort' && (
                    <div className="absolute inset-0 flex">
                      <div className="w-1/2 bg-[#fbfbfb] p-1.5 gap-1 flex flex-col">
                        <div className="h-1.5 w-full bg-primary/20 rounded"></div>
                        <div className="h-4 w-full bg-white border border-black/5 rounded"></div>
                      </div>
                      <div className="w-1/2 bg-[#f7f3eb] p-1.5 gap-1 flex flex-col">
                        <div className="h-1.5 w-full bg-[#473f33]/20 rounded"></div>
                        <div className="h-4 w-full bg-[#fefdfb] border border-[#e6e1d5] rounded"></div>
                      </div>
                    </div>
                  )}
                  
                  {/* Select indicator dot */}
                  {theme === t && (
                    <div className="absolute top-1 right-1 w-1.5 h-1.5 rounded-full bg-primary animate-pulse"></div>
                  )}
                </div>

                <span className="font-semibold text-xs text-foreground mb-0.5">{label}</span>
                <span className="text-[9px] text-muted-foreground leading-tight">{desc}</span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="bg-card p-6 rounded-2xl shadow-sm border border-border">
        <h2 className="text-lg font-semibold mb-4 border-b border-border pb-4">Account & Sync</h2>
        <div className="flex items-center justify-between">
          <div>
            <h3 className="font-medium text-foreground">Synchronize Data</h3>
            <p className="text-sm text-muted-foreground">
              Last synced: {lastSynced ? lastSynced.toLocaleTimeString() : 'Never'}
            </p>
          </div>
          <button
            onClick={forceSync}
            disabled={isSyncing}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-all ${isSyncing ? 'bg-muted text-muted-foreground' : 'bg-primary/10 text-primary hover:bg-primary/20'
              }`}
          >
            <CloudSync size={18} className={isSyncing ? 'animate-spin' : ''} />
            {isSyncing ? 'Syncing...' : 'Sync Now'}
          </button>
        </div>
      </div>

      <div className="bg-card p-6 rounded-2xl shadow-sm border border-border space-y-6">
        <h2 className="text-lg font-semibold border-b border-border pb-4 text-destructive">Danger Zone</h2>

        <div className="space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h3 className="font-medium">Data Portability</h3>
              <p className="text-sm text-muted-foreground">Backup or restore your complete database</p>
            </div>
            <div className="flex gap-2">
              <button
                onClick={handleJsonExport}
                className="flex items-center gap-2 px-4 py-2 bg-muted text-foreground font-medium rounded-lg hover:bg-muted/80 transition-colors text-sm"
              >
                <FileJson size={16} />
                Backup JSON
              </button>
              <button
                onClick={() => fileInputRef.current?.click()}
                className="flex items-center gap-2 px-4 py-2 bg-muted text-foreground font-medium rounded-lg hover:bg-muted/80 transition-colors text-sm"
              >
                <Upload size={16} />
                Import
              </button>
              <input
                type="file"
                ref={fileInputRef}
                onChange={handleDataImport}
                className="hidden"
                accept=".json,.csv,.xlsx"
              />
            </div>
          </div>

          <div className="pt-4 border-t border-border flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h3 className="font-medium">Export CSV</h3>
              <p className="text-sm text-muted-foreground">Download transactions for spreadsheet apps</p>
            </div>
            <div className="flex gap-2">
              <button
                onClick={exportCSV}
                className="flex items-center gap-2 px-4 py-2 bg-muted text-foreground font-medium rounded-lg hover:bg-muted/80 transition-colors text-sm"
              >
                <Download size={16} />
                CSV
              </button>
              <button
                onClick={exportXLSX}
                className="flex items-center gap-2 px-4 py-2 bg-muted text-foreground font-medium rounded-lg hover:bg-muted/80 transition-colors text-sm"
              >
                <Download size={16} />
                XLSX
              </button>
            </div>
          </div>

          <div className="pt-4 border-t border-border flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h3 className="font-medium">Optimize Database</h3>
              <p className="text-sm text-muted-foreground">Compact unused space. Current size: <span className="font-mono font-bold text-primary">{dbSize} MB</span></p>
            </div>
            <button
              onClick={async () => {
                setIsOptimizing(true);
                try {
                  await vacuumDB();
                  // Refresh displayed size immediately after compaction
                  setDbSize(getDBSizeMB().toString());
                } finally {
                  setIsOptimizing(false);
                }
              }}
              disabled={isOptimizing}
              className="flex items-center gap-2 px-4 py-2 bg-emerald-500/10 text-emerald-500 font-medium rounded-lg hover:bg-emerald-500/20 transition-colors text-sm disabled:opacity-50"
            >
              <LayoutList size={16} className={isOptimizing ? 'animate-spin' : ''} />
              {isOptimizing ? 'Optimizing...' : 'Optimize Now'}
            </button>
          </div>

          <div className="pt-4 border-t border-border flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h3 className="font-medium">Fix Category Duplicates</h3>
              <p className="text-sm text-muted-foreground">Merge categories with same names to fix mapping issues</p>
            </div>
            <button
              onClick={async () => {
                const count = await normalizeCategories();
                if (count > 0) toast.success(`Merged ${count} duplicate categories`);
                else toast.info('No duplicate categories found');
              }}
              className="flex items-center gap-2 px-4 py-2 bg-blue-500/10 text-blue-500 font-medium rounded-lg hover:bg-blue-500/20 transition-colors text-sm"
            >
              <LayoutList size={16} />
              Fix Categories
            </button>
          </div>

          <div className="pt-4 border-t border-border flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h3 className="font-medium text-destructive">Erase All Data</h3>
              <p className="text-sm text-muted-foreground">Completely wipe local and cloud records</p>
            </div>
            <button
              onClick={() => setShowMasterWipeConfirm(true)}
              disabled={isWiping}
              className="flex items-center gap-2 px-4 py-2 bg-destructive/10 text-destructive font-medium rounded-lg hover:bg-destructive/20 transition-colors text-sm"
            >
              <AlertTriangle size={16} />
              Wipe Everything
            </button>
          </div>
        </div>
      </div>
      {/* Exchange Connections Modal */}
      {isExchangeSettingsOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-300">
          <div className="bg-card w-full max-w-md rounded-3xl p-6 border border-border shadow-2xl space-y-6 animate-in zoom-in duration-300 relative max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center pb-4 border-b border-border">
              <div>
                <h2 className="text-xl font-bold">Exchange Connections</h2>
                <p className="text-xs text-muted-foreground">Integrate live crypto exchange balances & data</p>
              </div>
              <button
                onClick={() => setIsExchangeSettingsOpen(false)}
                className="p-2 text-muted-foreground hover:bg-muted rounded-full transition-colors"
              >
                <X size={20} />
              </button>
            </div>

            {/* Selection of available exchanges */}
            <div className="space-y-2">
              <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Select Exchange</label>
              <div className="grid grid-cols-2 gap-2">
                {(appConfig.exchanges || [
                  { id: 'mexc', name: 'MEXC Global', enabled: true }
                ]).filter(ex => ex.enabled).map((ex) => (
                  <button
                    key={ex.id}
                    onClick={() => setSelectedExchangeId(ex.id)}
                    className={`flex flex-col items-center justify-center p-4 rounded-2xl border-2 transition-all ${selectedExchangeId === ex.id
                      ? 'border-primary bg-primary/5 text-primary'
                      : 'border-border text-muted-foreground hover:bg-muted'
                      }`}
                  >
                    <span className="text-sm font-bold">{ex.name}</span>
                    <span className="text-[10px] text-muted-foreground font-mono mt-0.5">{ex.id}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Credentials */}
            <div className="space-y-4">
              <div className="flex justify-between items-center">
                <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Credentials</label>
                <span className={`px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-wider ${connectionStatus === 'connected' ? 'bg-emerald-500/10 text-emerald-500' : 'bg-muted text-muted-foreground'
                  }`}>
                  {connectionStatus === 'connected' ? 'Connected' : 'Not Configured'}
                </span>
              </div>

              <div className="space-y-3">
                <div className="relative">
                  <div className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                    <Key size={16} />
                  </div>
                  <input
                    type={showApiKeys ? 'text' : 'password'}
                    placeholder="Exchange API Key"
                    value={apiKeyInput}
                    onChange={(e) => setApiKeyInput(e.target.value)}
                    className="w-full pl-10 pr-10 py-3 bg-muted/30 border border-border rounded-xl focus:outline-none focus:ring-2 focus:ring-primary text-sm font-medium"
                  />
                  <button
                    type="button"
                    onClick={() => setShowApiKeys(!showApiKeys)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                  >
                    {showApiKeys ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>

                <div className="relative">
                  <div className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                    <Key size={16} />
                  </div>
                  <input
                    type={showApiKeys ? 'text' : 'password'}
                    placeholder="Exchange API Secret"
                    value={apiSecretInput}
                    onChange={(e) => setApiSecretInput(e.target.value)}
                    className="w-full pl-10 pr-10 py-3 bg-muted/30 border border-border rounded-xl focus:outline-none focus:ring-2 focus:ring-primary text-sm font-medium"
                  />
                </div>
              </div>
            </div>

            {/* Test Status Panel */}
            {testStatus && (
              <div className={`p-4 rounded-2xl border text-xs leading-normal animate-in slide-in-from-top-2 ${testStatus.success
                ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-600 dark:text-emerald-400'
                : 'bg-destructive/10 border-destructive/20 text-destructive'
                }`}>
                <p className="font-bold mb-1">{testStatus.success ? '✓ Connection Verified' : '✗ Connection Failed'}</p>
                <p className="opacity-90">{testStatus.message}</p>
              </div>
            )}

            {/* Buttons */}
            <div className="space-y-2 pt-2">
              <div className="flex gap-2">
                <button
                  onClick={handleTestConnection}
                  disabled={isTesting || !apiKeyInput || !apiSecretInput}
                  className="flex-1 py-3 bg-muted hover:bg-muted/80 text-foreground font-bold rounded-xl text-xs uppercase tracking-wider transition-all disabled:opacity-50"
                >
                  {isTesting ? 'Testing...' : 'Test Connection'}
                </button>

                <button
                  onClick={handleSaveKeys}
                  disabled={isSavingKeys || !apiKeyInput || !apiSecretInput}
                  className="flex-1 py-3 bg-primary hover:opacity-90 text-primary-foreground font-bold rounded-xl text-xs uppercase tracking-wider transition-all disabled:opacity-50"
                >
                  {isSavingKeys ? 'Saving...' : 'Save Config'}
                </button>
              </div>

              {connectionStatus === 'connected' && (
                <button
                  onClick={handleClearKeys}
                  disabled={isSavingKeys}
                  className="w-full py-3 bg-destructive/10 hover:bg-destructive/20 text-destructive font-bold rounded-xl text-xs uppercase tracking-wider transition-all"
                >
                  Remove Connection Configuration
                </button>
              )}
            </div>
          </div>
        </div>
      )}



      {isLogsOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-300">
          <div className="bg-card w-full max-w-2xl rounded-3xl p-6 border border-border shadow-2xl space-y-6 animate-in zoom-in duration-300 relative max-h-[90vh] flex flex-col">
            <div className="flex justify-between items-center pb-4 border-b border-border shrink-0">
              <div>
                <h2 className="text-xl font-bold flex items-center gap-2">
                  <Sparkles className="text-primary h-5 w-5" />
                  AI Agent Activity Logs
                </h2>
                <p className="text-xs text-muted-foreground">Historical records of functions executed by the AI copilot</p>
              </div>
              <button
                onClick={() => setIsLogsOpen(false)}
                className="p-2 text-muted-foreground hover:bg-muted rounded-full transition-colors"
              >
                <X size={20} />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto space-y-4 pr-1">
              {isLoadingLogs ? (
                <div className="flex flex-col items-center justify-center py-12 gap-2 text-muted-foreground">
                  <Loader2 className="animate-spin text-primary" size={24} />
                  <p className="text-xs font-bold uppercase tracking-wider">Loading activity log…</p>
                </div>
              ) : logs.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-12">No AI actions have been logged yet.</p>
              ) : (
                logs.map((log) => {
                  let formattedArgs = log.arguments;
                  try {
                    formattedArgs = JSON.stringify(JSON.parse(log.arguments), null, 2);
                  } catch (err) { }

                  return (
                    <div key={log.id} className="p-4 bg-muted/40 border border-border rounded-2xl space-y-3 text-xs">
                      <div className="flex items-center justify-between gap-3">
                        <div className="flex items-center gap-2">
                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${log.status === 'success'
                              ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20'
                              : log.status === 'declined'
                                ? 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20'
                                : 'bg-destructive/10 text-destructive border border-destructive/20'
                            }`}>
                            {log.status}
                          </span>
                          <code className="text-primary font-mono font-bold">{log.action_name}</code>
                        </div>
                        <span className="text-[10px] text-muted-foreground font-medium">
                          {new Date(log.timestamp).toLocaleString()}
                        </span>
                      </div>

                      <div className="space-y-1.5">
                        <p className="text-muted-foreground italic font-medium">
                          Query: <span className="text-foreground not-italic font-bold">"{log.user_query}"</span>
                        </p>
                        <div className="bg-background/60 p-2.5 rounded-xl border border-border/50 font-mono text-[11px] overflow-x-auto">
                          <p className="font-bold text-foreground/80 mb-1">Arguments:</p>
                          <pre className="whitespace-pre-wrap leading-relaxed">{formattedArgs}</pre>
                        </div>
                        {log.error_message && (
                          <p className="text-destructive font-semibold">
                            Error: <span className="font-medium text-destructive/95">{log.error_message}</span>
                          </p>
                        )}
                      </div>

                      <div className="pt-2 border-t border-border/40 flex justify-end">
                        <button
                          onClick={() => openChatSession(log.session_id)}
                          className="px-3.5 py-1.5 bg-primary/10 text-primary hover:bg-primary/20 font-bold rounded-lg text-[10px] uppercase tracking-wider transition-colors flex items-center gap-1.5"
                        >
                          <MessageSquare size={12} />
                          View Conversation
                        </button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};


export default Settings;
