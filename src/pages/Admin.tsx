import React, { useState, useEffect } from 'react';
import * as XLSX from 'xlsx';
import {
  Users,
  Settings as SettingsIcon,
  Lock,
  ShieldCheck,
  TrendingUp,
  MessageSquare,
  AlertCircle,
  Save,
  LogOut,
  Search,
  Activity,
  BarChart3,
  PieChart as PieIcon,
  Zap,
  RefreshCw,
  X,
  Send,
  Sliders,
  Eye,
  EyeOff,
  Plus,
  Coins,
  ArrowUpDown
} from 'lucide-react';
import { syncManager } from '../db/SyncManager';
import { Bar, Pie, Line } from 'react-chartjs-2';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  ArcElement,
} from 'chart.js';

ChartJS.register(
  CategoryScale,
  LinearScale,
  BarElement,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  ArcElement
);
import { db } from '../firebase';
import { collection, getDocs, doc, setDoc, getDoc, updateDoc, addDoc, serverTimestamp, query, orderBy, limit } from 'firebase/firestore';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { executeQuery } from '../db/sqlite';
import ConfirmModal from '../components/ConfirmModal';

const ADMIN_USER = 'khizar';
const ADMIN_PASS = '159068';

const FEATURES = [
  { id: 'goals', name: 'Savings Goals', desc: 'Set and track financial objectives' },
  { id: 'reminders', name: 'Bill Reminders', desc: 'Never miss an upcoming payment' },
  { id: 'investments', name: 'Investments', desc: 'Track your portfolio growth' },
  { id: 'calculator', name: 'Calculator', desc: 'Quick math and percentages' },
  { id: 'converter', name: 'Currency Converter', desc: 'Real-time exchange rates' },
  { id: 'tasks', name: 'Task Manager', desc: 'Organize your daily activities and to-dos' },
  { id: 'loans', name: 'Loan Management', desc: 'Track borrowing and lending' },
  { id: 'events', name: 'Event Tracking', desc: 'Group related expenses and loans' },
  { id: 'fuel', name: 'Fuel Tracking', desc: 'Track fuel consumption and costs' },
  { id: 'reports', name: 'Analytics & Reports', desc: 'Comprehensive financial insights' },
  { id: 'ai-chat', name: 'AI Copilot', desc: 'Chat with your personal financial AI' },
  { id: 'subscriptions', name: 'Subscription Manager', desc: 'Track and analyze recurring subscriptions' }
];

interface UserProfile {
  id: string;
  email: string;
  displayName?: string;
  lastLogin: string;
  photoURL?: string;
  isPro?: boolean;
  isBanned?: boolean;
  lastIP?: string;
  stats?: {
    transactions: number;
    loans: number;
    events: number;
  };
  disabledFeatures?: string[];
}

interface AdminLog {
  id: string;
  action: string;
  timestamp: any;
  admin: string;
}

interface GlobalConfig {
  announcement: string;
  emergencyMessage: string;
  maintenanceMode: boolean;
  allowSignups: boolean;
  fuelTrackingEnabled: boolean;
  loansEnabled: boolean;
  supportedCurrencies: { code: string; symbol: string; name: string; }[];
  version: string;
  exchanges?: { id: string; name: string; logoUrl?: string; enabled: boolean; }[];
  disabledFeatures?: string[];
}

interface SystemStats {
  totalUsers: number;
  proUsers: number;
  activeToday: number;
  totalTransactions: number;
  totalLoans: number;
  totalEvents: number;
  lastScan: string | null;
}

const Admin: React.FC = () => {
  const [isAuthorized, setIsAuthorized] = useState(false);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isShake, setIsShake] = useState(false);

  useEffect(() => {
    if (localStorage.getItem('admin_authorized') === 'true') {
      setIsAuthorized(true);
    }
  }, []);

  const [users, setUsers] = useState<UserProfile[]>([]);
  const [globalSettings, setGlobalSettings] = useState<GlobalConfig>({
    announcement: '',
    emergencyMessage: '',
    maintenanceMode: false,
    allowSignups: true,
    fuelTrackingEnabled: true,
    loansEnabled: true,
    supportedCurrencies: [
      { code: 'PKR', symbol: 'Rs', name: 'Pakistani Rupee' },
      { code: 'USD', symbol: '$', name: 'US Dollar' },
      { code: 'EUR', symbol: '€', name: 'Euro' },
      { code: 'GBP', symbol: '£', name: 'British Pound' },
      { code: 'AED', symbol: 'د.إ', name: 'UAE Dirham' },
      { code: 'SAR', symbol: 'ر.س', name: 'Saudi Riyal' },
    ],
    version: '1.0.0',
    exchanges: [
      { id: 'mexc', name: 'MEXC Global', logoUrl: '', enabled: true }
    ]
  });

  const [hasBackup, setHasBackup] = useState(false);
  const [initialSettings, setInitialSettings] = useState<GlobalConfig | null>(null);

  const [selectedUserForFeatures, setSelectedUserForFeatures] = useState<UserProfile | null>(null);
  const [userDisabledFeatures, setUserDisabledFeatures] = useState<string[]>([]);

  const [newExchangeId, setNewExchangeId] = useState('');
  const [newExchangeName, setNewExchangeName] = useState('');
  const [newExchangeLogoUrl, setNewExchangeLogoUrl] = useState('');
  const [newExchangeEnabled, setNewExchangeEnabled] = useState(true);

  const handleAddExchange = () => {
    if (!newExchangeId.trim() || !newExchangeName.trim()) {
      toast.error('Exchange ID and Name are required');
      return;
    }
    const id = newExchangeId.trim().toLowerCase();
    const name = newExchangeName.trim();
    
    const currentExchanges = globalSettings.exchanges || [];
    if (currentExchanges.some(e => e.id === id)) {
      toast.error(`Exchange with ID "${id}" already exists`);
      return;
    }
    
    const updatedExchanges = [
      ...currentExchanges,
      { id, name, logoUrl: newExchangeLogoUrl.trim(), enabled: newExchangeEnabled }
    ];
    
    setGlobalSettings({
      ...globalSettings,
      exchanges: updatedExchanges
    });
    
    setNewExchangeId('');
    setNewExchangeName('');
    setNewExchangeLogoUrl('');
    setNewExchangeEnabled(true);
    toast.success(`Exchange "${name}" added. Click "Save Global Config" to persist.`);
  };

  const handleToggleExchange = (exchangeId: string) => {
    const currentExchanges = globalSettings.exchanges || [];
    const updatedExchanges = currentExchanges.map(e => 
      e.id === exchangeId ? { ...e, enabled: !e.enabled } : e
    );
    setGlobalSettings({
      ...globalSettings,
      exchanges: updatedExchanges
    });
    toast.info('Exchange status updated. Click "Save Global Config" to persist.');
  };

  const handleDeleteExchange = (exchangeId: string) => {
    const currentExchanges = globalSettings.exchanges || [];
    const updatedExchanges = currentExchanges.filter(e => e.id !== exchangeId);
    setGlobalSettings({
      ...globalSettings,
      exchanges: updatedExchanges
    });
    toast.success('Exchange removed. Click "Save Global Config" to persist.');
  };

  const handleAddCurrency = () => {
    if (!newCurrencyCode.trim() || !newCurrencySymbol.trim() || !newCurrencyName.trim()) {
      toast.error('All currency fields are required');
      return;
    }
    const code = newCurrencyCode.trim().toUpperCase();
    const symbol = newCurrencySymbol.trim();
    const name = newCurrencyName.trim();

    const currentCurrencies = globalSettings.supportedCurrencies || [];
    if (currentCurrencies.some(c => c.code === code)) {
      toast.error(`Currency code "${code}" already exists`);
      return;
    }

    const updated = [...currentCurrencies, { code, symbol, name }];
    setGlobalSettings({ ...globalSettings, supportedCurrencies: updated });

    setNewCurrencyCode('');
    setNewCurrencySymbol('');
    setNewCurrencyName('');
    toast.success(`Currency "${code}" added. Click "Save Global Config" to persist.`);
  };

  const handleDeleteCurrency = (code: string) => {
    const currentCurrencies = globalSettings.supportedCurrencies || [];
    if (currentCurrencies.length <= 1) {
      toast.error('Cannot delete the last remaining currency');
      return;
    }
    const updated = currentCurrencies.filter(c => c.code !== code);
    setGlobalSettings({ ...globalSettings, supportedCurrencies: updated });
    toast.success(`Currency "${code}" removed. Click "Save Global Config" to persist.`);
  };

  const [isLoading, setIsLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'pro' | 'standard' | 'banned' | 'active_today'>('all');
  const [sortBy, setSortBy] = useState<'lastActive' | 'name' | 'email' | 'tx_volume'>('lastActive');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [activeTab, setActiveTab] = useState<'users' | 'settings' | 'logs' | 'analytics'>('users');
  const [announcementTab, setAnnouncementTab] = useState<'edit' | 'preview'>('edit');
  const [newCurrencyCode, setNewCurrencyCode] = useState('');
  const [newCurrencySymbol, setNewCurrencySymbol] = useState('');
  const [newCurrencyName, setNewCurrencyName] = useState('');
  const [logSearchQuery, setLogSearchQuery] = useState('');
  const [logTypeFilter, setLogTypeFilter] = useState<'all' | 'config' | 'user' | 'scan'>('all');
  const [adminLogs, setAdminLogs] = useState<AdminLog[]>([]);
  const [systemStats, setSystemStats] = useState<SystemStats>({
    totalUsers: 0,
    proUsers: 0,
    activeToday: 0,
    totalTransactions: 0,
    totalLoans: 0,
    totalEvents: 0,
    lastScan: null
  });
  const [isScanning, setIsScanning] = useState(false);
  const [isOnline, setIsOnline] = useState(window.navigator.onLine);
  const [syncQueueCount, setSyncQueueCount] = useState(0);
  const [showQueueModal, setShowQueueModal] = useState(false);
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
  const [pendingItems, setPendingItems] = useState<any[]>([]);
  const [isForceSyncing, setIsForceSyncing] = useState(false);

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    if (username === ADMIN_USER && password === ADMIN_PASS) {
      setIsAuthorized(true);
      localStorage.setItem('admin_authorized', 'true');
      toast.success('Admin access granted');
    } else {
      setIsShake(true);
      toast.error('Invalid credentials');
      setTimeout(() => setIsShake(false), 500);
    }
  };

  const fetchData = async () => {
    setIsLoading(true);
    try {
      // Check local sync queue
      const queue = await executeQuery('SELECT COUNT(*) as count FROM sync_queue') as any[];
      setSyncQueueCount(queue[0]?.count || 0);

      // Fetch Users
      const usersSnap = await getDocs(collection(db, 'registered_users'));
      const usersList = usersSnap.docs.map(doc => ({ id: doc.id, ...doc.data() } as UserProfile));
      setUsers(usersList);

      // Fetch Global Settings
      const settingsDoc = await getDoc(doc(db, 'system', 'global_config'));
      if (settingsDoc.exists()) {
        const data = settingsDoc.data() as GlobalConfig;
        if (!data.exchanges) {
          data.exchanges = [
            { id: 'mexc', name: 'MEXC Global', logoUrl: '', enabled: true }
          ];
        }
        setGlobalSettings(data);
        setInitialSettings(data);
      }

      // Check for restore backup
      const backupDoc = await getDoc(doc(db, 'system', 'global_config_backup'));
      setHasBackup(backupDoc.exists());

      // Fetch Logs
      const logsSnap = await getDocs(query(collection(db, 'admin_logs'), orderBy('timestamp', 'desc'), limit(50)));
      const logsList = logsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() } as AdminLog));
      setAdminLogs(logsList);
      // Update quick stats
      const proCount = usersList.filter(u => u.isPro).length;
      const activeCount = usersList.filter(u => u.lastLogin?.includes(new Date().toISOString().split('T')[0])).length;

      setSystemStats(prev => ({
        ...prev,
        totalUsers: usersList.length,
        proUsers: proCount,
        activeToday: activeCount
      }));
    } catch (error) {
      console.error('Admin fetch error:', error);
      toast.error('Failed to load admin data');
    } finally {
      setIsLoading(false);
    }
  };

  const scanSystemData = async () => {
    setIsScanning(true);
    toast.info('Starting deep system scan... this may take a moment');
    try {
      let transactionCount = 0;
      let loanCount = 0;
      let eventCount = 0;

      // Scan each user (limit to first 50 for safety in UI)
      const usersToScan = users.slice(0, 50);
      const updatedUsers = [...users];

      for (let i = 0; i < usersToScan.length; i++) {
        const u = usersToScan[i];
        const tSnap = await getDocs(collection(db, `users/${u.id}/transactions`));
        const lSnap = await getDocs(collection(db, `users/${u.id}/loans`));
        const eSnap = await getDocs(collection(db, `users/${u.id}/events`));

        transactionCount += tSnap.size;
        loanCount += lSnap.size;
        eventCount += eSnap.size;

        // Find user in main list and update their specific stats
        const userIndex = updatedUsers.findIndex(user => user.id === u.id);
        if (userIndex !== -1) {
          updatedUsers[userIndex] = {
            ...updatedUsers[userIndex],
            stats: {
              transactions: tSnap.size,
              loans: lSnap.size,
              events: eSnap.size
            }
          };
        }
      }

      setUsers(updatedUsers);
      setSystemStats(prev => ({
        ...prev,
        totalTransactions: transactionCount,
        totalLoans: loanCount,
        totalEvents: eventCount,
        lastScan: new Date().toISOString()
      }));

      // Log the scan
      await addDoc(collection(db, 'admin_logs'), {
        action: `Performed deep system scan (${transactionCount} transactions found)`,
        timestamp: serverTimestamp(),
        admin: ADMIN_USER
      });

      toast.success('System scan complete');
    } catch (e) {
      console.error('Scan failed:', e);
      toast.error('Scan failed: Missing permissions or timeout');
    } finally {
      setIsScanning(false);
    }
  };

  const fetchQueueDetails = async () => {
    try {
      const items = await executeQuery('SELECT * FROM sync_queue ORDER BY timestamp DESC') as any[];
      setPendingItems(items);
      setShowQueueModal(true);
    } catch (e) {
      toast.error('Failed to fetch queue details');
    }
  };

  const triggerForceSync = async () => {
    if (isForceSyncing) return;
    setIsForceSyncing(true);
    toast.info('Forcing synchronization...');
    try {
      await syncManager.startSync();
      // Refresh count and items after sync
      const queue = await executeQuery('SELECT COUNT(*) as count FROM sync_queue') as any[];
      setSyncQueueCount(queue[0]?.count || 0);
      const items = await executeQuery('SELECT * FROM sync_queue ORDER BY timestamp DESC') as any[];
      setPendingItems(items);
      toast.success('Sync process triggered');
    } catch (e) {
      toast.error('Force sync failed');
    } finally {
      setIsForceSyncing(false);
    }
  };

  useEffect(() => {
    if (isAuthorized) {
      fetchData();
    }

    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [isAuthorized]);

  const saveGlobalSettings = async () => {
    try {
      // 1. Fetch current cloud state to save as a rolling restore point
      const currentDoc = await getDoc(doc(db, 'system', 'global_config'));
      if (currentDoc.exists()) {
        await setDoc(doc(db, 'system', 'global_config_backup'), currentDoc.data());
        setHasBackup(true);
      }

      // 2. Overwrite active cloud config
      await setDoc(doc(db, 'system', 'global_config'), globalSettings);

      // Log action
      await addDoc(collection(db, 'admin_logs'), {
        action: `Updated global configuration`,
        timestamp: serverTimestamp(),
        admin: ADMIN_USER
      });

      setInitialSettings(globalSettings);
      toast.success('Global settings updated');
      fetchData(); // Reload logs and data metrics
    } catch (error) {
      toast.error('Failed to save settings');
    }
  };

  const revertGlobalSettings = async () => {
    if (!confirm('Are you sure you want to revert to the previous cloud configuration? This will restore all prior global configurations and overwrite current active settings.')) return;
    setIsLoading(true);
    try {
      const backupDoc = await getDoc(doc(db, 'system', 'global_config_backup'));
      if (backupDoc.exists()) {
        const backupData = backupDoc.data() as GlobalConfig;
        
        await setDoc(doc(db, 'system', 'global_config'), backupData);
        
        await addDoc(collection(db, 'admin_logs'), {
          action: 'Reverted global configuration to backup version',
          timestamp: serverTimestamp(),
          admin: ADMIN_USER
        });

        toast.success('Global settings successfully reverted to backup');
        fetchData();
      } else {
        toast.error('No backup configuration found');
      }
    } catch (e) {
      console.error('Revert failed:', e);
      toast.error('Failed to revert configuration');
    } finally {
      setIsLoading(false);
    }
  };

  const handleResetSessionChanges = () => {
    if (initialSettings) {
      setGlobalSettings(initialSettings);
      toast.success('Reset all unsaved session changes');
    }
  };

  useEffect(() => {
    if (selectedUserForFeatures) {
      setUserDisabledFeatures(selectedUserForFeatures.disabledFeatures || []);
    } else {
      setUserDisabledFeatures([]);
    }
  }, [selectedUserForFeatures]);

  const saveUserFeatures = async () => {
    if (!selectedUserForFeatures) return;
    try {
      await updateDoc(doc(db, 'registered_users', selectedUserForFeatures.id), {
        disabledFeatures: userDisabledFeatures
      });

      await addDoc(collection(db, 'admin_logs'), {
        action: `Updated feature access for ${selectedUserForFeatures.email}`,
        timestamp: serverTimestamp(),
        admin: ADMIN_USER
      });

      setUsers(users.map(u => u.id === selectedUserForFeatures.id ? { ...u, disabledFeatures: userDisabledFeatures } : u));
      setSelectedUserForFeatures(null);
      toast.success('User features updated successfully');
    } catch (e) {
      toast.error('Failed to update user features');
    }
  };

  const toggleProStatus = async (user: UserProfile) => {
    try {
      await updateDoc(doc(db, 'registered_users', user.id), {
        isPro: !user.isPro
      });

      await addDoc(collection(db, 'admin_logs'), {
        action: `${user.isPro ? 'Demoted' : 'Promoted'} ${user.email} to PRO`,
        timestamp: serverTimestamp(),
        admin: ADMIN_USER
      });

      setUsers(users.map(u => u.id === user.id ? { ...u, isPro: !u.isPro } : u));
      toast.success(`User ${user.isPro ? 'demoted' : 'promoted to PRO'}`);
    } catch (e) {
      toast.error('Failed to update user status');
    }
  };

  const toggleBanStatus = async (user: UserProfile) => {
    try {
      await updateDoc(doc(db, 'registered_users', user.id), {
        isBanned: !user.isBanned
      });

      await addDoc(collection(db, 'admin_logs'), {
        action: `${user.isBanned ? 'Unbanned' : 'Banned'} user ${user.email}`,
        timestamp: serverTimestamp(),
        admin: ADMIN_USER
      });

      setUsers(users.map(u => u.id === user.id ? { ...u, isBanned: !u.isBanned } : u));
      toast.success(`User ${user.isBanned ? 'unbanned' : 'BANNED'}`);
    } catch (e) {
      toast.error('Failed to update user status');
    }
  };

  const exportToExcel = () => {
    try {
      const exportData = users.map(u => ({
        ID: u.id,
        Name: u.displayName || 'Unnamed',
        Email: u.email,
        'Last Active': u.lastLogin ? format(new Date(u.lastLogin), 'yyyy-MM-dd HH:mm') : 'N/A',
        'Is Pro': u.isPro ? 'Yes' : 'No',
        'Is Banned': u.isBanned ? 'Yes' : 'No'
      }));

      const ws = XLSX.utils.json_to_sheet(exportData);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Users');
      XLSX.writeFile(wb, `Ledger_Users_${format(new Date(), 'yyyy-MM-dd')}.xlsx`);
      toast.success('User list exported successfully');
    } catch (e) {
      toast.error('Export failed');
    }
  };

  if (!isAuthorized) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4 relative overflow-hidden">
        {/* Modern glowing background blobs */}
        <div className="absolute top-1/4 left-1/4 w-72 h-72 bg-primary/10 rounded-full blur-3xl -z-10 animate-pulse duration-[6000ms]" />
        <div className="absolute bottom-1/4 right-1/4 w-72 h-72 bg-amber-500/10 rounded-full blur-3xl -z-10 animate-pulse duration-[8000ms]" />

        <style>{`
          @keyframes shake {
            0%, 100% { transform: translateX(0); }
            20%, 60% { transform: translateX(-6px); }
            40%, 80% { transform: translateX(6px); }
          }
          .animate-shake {
            animation: shake 0.4s ease-in-out;
          }
        `}</style>

        <div className={`w-full max-w-md bg-card/60 backdrop-blur-lg border border-border/60 rounded-3xl p-8 shadow-2xl space-y-8 animate-in fade-in zoom-in duration-300 ${isShake ? 'animate-shake' : ''}`}>
          <div className="text-center space-y-2">
            <div className="inline-flex items-center justify-center w-16 h-16 bg-primary/10 rounded-2xl text-primary mb-2 ring-4 ring-primary/5">
              <ShieldCheck size={32} />
            </div>
            <h1 className="text-2xl font-bold tracking-tight">System Admin</h1>
            <p className="text-xs text-muted-foreground uppercase font-bold tracking-widest opacity-60">Authorized Access Only</p>
          </div>

          <form onSubmit={handleLogin} className="space-y-4">
            <div className="space-y-1">
              <label className="text-[10px] font-extrabold uppercase text-muted-foreground ml-1 tracking-wider">Username</label>
              <div className="relative">
                <Users className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground/60" size={18} />
                <input
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  className="w-full bg-muted/60 border border-transparent rounded-xl py-3 pl-10 pr-4 outline-none focus:bg-card focus:border-primary/20 focus:ring-2 focus:ring-primary/10 transition-all font-medium text-sm text-foreground"
                  placeholder="Enter admin username"
                  required
                />
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-[10px] font-extrabold uppercase text-muted-foreground ml-1 tracking-wider">Password</label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground/60" size={18} />
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full bg-muted/60 border border-transparent rounded-xl py-3 pl-10 pr-12 outline-none focus:bg-card focus:border-primary/20 focus:ring-2 focus:ring-primary/10 transition-all font-medium text-sm text-foreground"
                  placeholder="Enter admin password"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground/60 hover:text-foreground transition-colors p-1"
                >
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              className="w-full bg-primary text-primary-foreground py-4 rounded-2xl font-bold hover:opacity-90 active:scale-[0.98] transition-all flex items-center justify-center gap-2 shadow-lg shadow-primary/10 mt-6"
            >
              <ShieldCheck size={18} />
              Verify & Enter
            </button>
          </form>
        </div>
      </div>
    );
  }

  const highlightText = (text: string, query: string) => {
    if (!text) return <span>N/A</span>;
    if (!query) return <span>{text}</span>;
    const parts = text.split(new RegExp(`(${query.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, '\\$&')})`, 'gi'));
    return (
      <span>
        {parts.map((part, i) => 
          part.toLowerCase() === query.toLowerCase() 
            ? <mark key={i} className="bg-amber-500/20 text-amber-600 dark:text-amber-400 font-semibold rounded-sm px-0.5">{part}</mark>
            : part
        )}
      </span>
    );
  };

  const filteredUsers = users
    .filter(u => {
      const matchesSearch = 
        u.email?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        u.displayName?.toLowerCase().includes(searchQuery.toLowerCase());
      
      if (!matchesSearch) return false;

      const todayStr = new Date().toISOString().split('T')[0];
      switch (statusFilter) {
        case 'pro':
          return !!u.isPro;
        case 'standard':
          return !u.isPro && !u.isBanned;
        case 'banned':
          return !!u.isBanned;
        case 'active_today':
          return !!u.lastLogin?.includes(todayStr);
        case 'all':
        default:
          return true;
      }
    })
    .sort((a, b) => {
      let comparison = 0;
      if (sortBy === 'name') {
        comparison = (a.displayName || '').localeCompare(b.displayName || '');
      } else if (sortBy === 'email') {
        comparison = (a.email || '').localeCompare(b.email || '');
      } else if (sortBy === 'tx_volume') {
        comparison = (a.stats?.transactions || 0) - (b.stats?.transactions || 0);
      } else {
        const timeA = a.lastLogin ? new Date(a.lastLogin).getTime() : 0;
        const timeB = b.lastLogin ? new Date(b.lastLogin).getTime() : 0;
        comparison = timeA - timeB;
      }
      return sortOrder === 'desc' ? -comparison : comparison;
    });

  return (
    <div className="min-h-screen bg-background text-foreground pb-20">
      {/* Header */}
      <div className="bg-card border-b border-border sticky top-0 z-10">
        <div className="max-w-4xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ShieldCheck className="text-primary" size={24} />
            <h1 className="font-bold text-lg">System Administration</h1>
          </div>
          <button
            onClick={() => setShowLogoutConfirm(true)}
            className="p-2 text-muted-foreground hover:text-destructive transition-colors"
          >
            <LogOut size={20} />
          </button>
        </div>
      </div>

      <div className="max-w-4xl mx-auto p-4 space-y-6">
        {/* Stats Row */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {[
            { label: 'Total Users', value: users.length, icon: Users, color: 'text-blue-500', onClick: undefined },
            { label: 'Active Today', value: users.filter(u => u.lastLogin?.includes(new Date().toISOString().split('T')[0])).length, icon: Activity, color: 'text-emerald-500', onClick: undefined },
            { label: 'Cloud Status', value: isOnline ? 'Online' : 'Offline', icon: TrendingUp, color: isOnline ? 'text-emerald-500' : 'text-rose-500', onClick: undefined },
            { label: 'Sync Queue', value: syncQueueCount === 0 ? 'Clear' : `${syncQueueCount} Pending`, icon: MessageSquare, color: syncQueueCount === 0 ? 'text-primary' : 'text-amber-500', onClick: fetchQueueDetails },
          ].map((stat, i) => (
            <div 
              key={i} 
              onClick={stat.onClick}
              className={`bg-card border border-border p-4 rounded-2xl transition-all ${stat.onClick ? 'cursor-pointer hover:border-primary/50 hover:shadow-lg active:scale-95' : ''}`}
            >
              <stat.icon size={16} className={`${stat.color} mb-2`} />
              <p className="text-xs text-muted-foreground">{stat.label}</p>
              <p className="text-xl font-bold">{stat.value}</p>
            </div>
          ))}
        </div>

        {/* Tabs */}
        <div className="flex p-1 bg-muted rounded-xl w-fit">
          <button
            onClick={() => setActiveTab('users')}
            className={`px-4 py-2 rounded-lg text-sm font-bold transition-all ${activeTab === 'users' ? 'bg-card shadow-sm text-primary' : 'text-muted-foreground'}`}
          >
            User Directory
          </button>
          <button
            onClick={() => setActiveTab('settings')}
            className={`px-4 py-2 rounded-lg text-sm font-bold transition-all ${activeTab === 'settings' ? 'bg-card shadow-sm text-primary' : 'text-muted-foreground'}`}
          >
            Global Settings
          </button>
          <button
            onClick={() => setActiveTab('logs')}
            className={`px-4 py-2 rounded-lg text-sm font-bold transition-all ${activeTab === 'logs' ? 'bg-card shadow-sm text-primary' : 'text-muted-foreground'}`}
          >
            Audit Logs
          </button>
          <button
            onClick={() => setActiveTab('analytics')}
            className={`px-4 py-2 rounded-lg text-sm font-bold transition-all ${activeTab === 'analytics' ? 'bg-card shadow-sm text-primary' : 'text-muted-foreground'}`}
          >
            Analytics
          </button>
        </div>

        {activeTab === 'users' && (
          <div className="space-y-4">
            {/* Search, Filter & Sort Controls Panel */}
            <div className="bg-card border border-border rounded-3xl p-5 space-y-4 shadow-sm">
              <div className="flex flex-col sm:flex-row gap-3">
                {/* Search */}
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground/60" size={16} />
                  <input
                    type="text"
                    placeholder="Search users by name or email..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full bg-muted/50 border border-transparent rounded-2xl py-2.5 pl-10 pr-10 outline-none focus:bg-card focus:border-primary/20 focus:ring-2 focus:ring-primary/10 transition-all text-xs font-semibold text-foreground placeholder:text-muted-foreground/75"
                  />
                  {searchQuery && (
                    <button
                      onClick={() => setSearchQuery('')}
                      className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-muted-foreground hover:text-foreground rounded-full hover:bg-muted transition-all"
                    >
                      <X size={12} />
                    </button>
                  )}
                </div>

                {/* Export Button */}
                <button
                  onClick={exportToExcel}
                  className="bg-primary/5 hover:bg-primary text-primary hover:text-primary-foreground border border-primary/10 hover:border-transparent px-5 py-2.5 rounded-2xl flex items-center justify-center gap-2 transition-all font-bold text-xs uppercase tracking-wider shrink-0"
                >
                  <TrendingUp size={14} />
                  Export Excel
                </button>
              </div>

              {/* Advanced Filter and Sorting Bar */}
              <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 pt-3 border-t border-border/40">
                {/* Filter Pills */}
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="text-[10px] font-extrabold uppercase tracking-wider text-muted-foreground mr-1.5">Filters:</span>
                  {(
                    [
                      { id: 'all', label: 'All Users' },
                      { id: 'pro', label: 'PRO Members' },
                      { id: 'standard', label: 'Standard' },
                      { id: 'banned', label: 'Banned' },
                      { id: 'active_today', label: 'Active Today' },
                    ] as const
                  ).map((pill) => (
                    <button
                      key={pill.id}
                      onClick={() => setStatusFilter(pill.id)}
                      className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all ${
                        statusFilter === pill.id
                          ? 'bg-primary text-primary-foreground shadow-sm shadow-primary/10 scale-105'
                          : 'bg-muted/40 hover:bg-muted text-muted-foreground hover:text-foreground'
                      }`}
                    >
                      {pill.label}
                    </button>
                  ))}
                </div>

                {/* Sorting Controls */}
                <div className="flex items-center gap-3 self-end md:self-auto">
                  <div className="flex items-center gap-1.5">
                    <span className="text-[10px] font-extrabold uppercase tracking-wider text-muted-foreground">Sort By:</span>
                    <select
                      value={sortBy}
                      onChange={(e) => setSortBy(e.target.value as any)}
                      className="bg-muted/50 hover:bg-muted text-foreground text-xs font-bold py-1.5 pl-3 pr-8 rounded-xl border border-border/20 outline-none focus:ring-2 focus:ring-primary/10 transition-all cursor-pointer appearance-none relative"
                      style={{ backgroundImage: `url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='24' height='24' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'><polyline points='6 9 12 15 18 9'></polyline></svg>")`, backgroundRepeat: 'no-repeat', backgroundPosition: 'right 8px center', backgroundSize: '12px' }}
                    >
                      <option value="lastActive">Last Active</option>
                      <option value="name">Name</option>
                      <option value="email">Email</option>
                      <option value="tx_volume">Transaction Count</option>
                    </select>
                  </div>

                  <button
                    onClick={() => setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc')}
                    className="p-2 bg-muted/50 hover:bg-muted text-muted-foreground hover:text-foreground rounded-xl transition-all border border-border/20"
                    title={`Order: ${sortOrder === 'asc' ? 'Ascending' : 'Descending'}`}
                  >
                    <ArrowUpDown size={14} className={`transition-transform duration-300 ${sortOrder === 'desc' ? 'rotate-180' : ''}`} />
                  </button>
                </div>
              </div>
            </div>

            {/* Users List Card Container */}
            <div className="bg-card border border-border rounded-3xl overflow-hidden shadow-sm">
              <div className="divide-y divide-border">
                {isLoading ? (
                  <div className="p-16 flex flex-col items-center justify-center gap-3">
                    <Activity className="animate-spin text-primary" size={32} />
                    <p className="text-xs text-muted-foreground font-bold uppercase tracking-wider animate-pulse">Loading system directory...</p>
                  </div>
                ) : filteredUsers.length === 0 ? (
                  <div className="p-16 text-center text-muted-foreground">
                    <Users className="mx-auto mb-3 opacity-20" size={48} />
                    <p className="text-sm font-bold text-foreground">No matches found</p>
                    <p className="text-xs text-muted-foreground mt-1">Try resetting your search query or status filters</p>
                  </div>
                ) : (
                  filteredUsers.map(u => {
                    const isTodayActive = u.lastLogin?.includes(new Date().toISOString().split('T')[0]);
                    return (
                      <div key={u.id} className={`p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 hover:bg-muted/20 transition-all duration-200 ${u.isBanned ? 'bg-destructive/5 opacity-70' : ''}`}>
                        <div className="flex items-start sm:items-center gap-4">
                          <div className="relative shrink-0">
                            <div className="w-12 h-12 bg-primary/5 rounded-2xl flex items-center justify-center text-primary font-black text-base overflow-hidden border border-border/50 shadow-inner">
                              {u.photoURL ? (
                                <img src={u.photoURL} alt="" className="object-cover w-full h-full" />
                              ) : (
                                u.email?.[0].toUpperCase()
                              )}
                            </div>
                            
                            {/* Animated Pulse Badges */}
                            {isTodayActive && (
                              <div className="absolute -top-1 -left-1 w-3 h-3 bg-emerald-500 rounded-full border-2 border-card" title="Active today">
                                <span className="absolute inset-0 bg-emerald-500 rounded-full animate-ping opacity-70" />
                              </div>
                            )}
                            {u.isPro && (
                              <div className="absolute -top-1 -right-1 w-4.5 h-4.5 bg-amber-500 text-white rounded-full flex items-center justify-center border-2 border-card scale-90" title="PRO Member">
                                <ShieldCheck size={10} />
                              </div>
                            )}
                          </div>
                          
                          <div className="space-y-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <p className="font-extrabold text-sm text-foreground">
                                {highlightText(u.displayName || 'Unnamed User', searchQuery)}
                              </p>
                              {u.isPro && (
                                <span className="text-[9px] bg-amber-500/10 text-amber-600 dark:text-amber-400 px-2 py-0.5 rounded-full font-black uppercase tracking-wider flex items-center gap-1">
                                  <span className="w-1 h-1 rounded-full bg-amber-500 animate-pulse" />
                                  Pro
                                </span>
                              )}
                              {u.isBanned && (
                                <span className="text-[9px] bg-rose-500/10 text-rose-600 dark:text-rose-400 px-2 py-0.5 rounded-full font-black uppercase tracking-wider">
                                  Banned
                                </span>
                              )}
                            </div>
                            
                            <p className="text-xs text-muted-foreground flex flex-wrap items-center gap-1.5 font-medium">
                              <span>{highlightText(u.email || '', searchQuery)}</span>
                              <span className="opacity-40">•</span>
                              <span className="font-mono text-[10px] bg-muted px-1.5 py-0.5 rounded text-muted-foreground/80">{u.lastIP || '0.0.0.0'}</span>
                            </p>
                            
                            {u.stats && (
                              <div className="flex items-center gap-2.5 pt-1">
                                <span className="text-[9px] bg-primary/5 border border-primary/10 text-primary px-2 py-0.5 rounded-lg font-bold">TX: {u.stats.transactions}</span>
                                <span className="text-[9px] bg-emerald-500/5 border border-emerald-500/10 text-emerald-600 px-2 py-0.5 rounded-lg font-bold">LN: {u.stats.loans}</span>
                                <span className="text-[9px] bg-orange-500/5 border border-orange-500/10 text-orange-600 px-2 py-0.5 rounded-lg font-bold">EV: {u.stats.events}</span>
                              </div>
                            )}
                          </div>
                        </div>

                        <div className="flex items-center justify-between sm:justify-end gap-5 border-t sm:border-t-0 border-border/40 pt-3 sm:pt-0">
                          <div className="text-left sm:text-right">
                            <p className="text-[9px] uppercase font-bold text-muted-foreground tracking-widest">Last Active</p>
                            <p className="text-xs font-semibold text-foreground">
                              {u.lastLogin ? format(new Date(u.lastLogin), 'MMM dd, HH:mm') : 'Never'}
                            </p>
                          </div>
                          
                          <div className="flex items-center gap-1 bg-muted/40 p-1 rounded-2xl border border-border/40 shadow-inner">
                            <button
                              onClick={() => setSelectedUserForFeatures(u)}
                              className="p-2 rounded-xl text-muted-foreground hover:text-primary hover:bg-card transition-all duration-200"
                              title="Manage User Features"
                            >
                              <Sliders size={16} />
                            </button>
                            <button
                              onClick={() => toggleProStatus(u)}
                              className={`p-2 rounded-xl transition-all duration-200 ${u.isPro ? 'text-amber-500 bg-card shadow-sm hover:text-amber-600' : 'text-muted-foreground hover:text-amber-500 hover:bg-card'}`}
                              title={u.isPro ? 'Demote Pro' : 'Promote to Pro'}
                            >
                              <ShieldCheck size={16} />
                            </button>
                            <button
                              onClick={() => toggleBanStatus(u)}
                              className={`p-2 rounded-xl transition-all duration-200 ${u.isBanned ? 'text-rose-500 bg-card shadow-sm hover:text-rose-600' : 'text-muted-foreground hover:text-rose-500 hover:bg-card'}`}
                              title={u.isBanned ? 'Unban User' : 'Ban User'}
                            >
                              <AlertCircle size={16} />
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          </div>
        )}

        {activeTab === 'settings' && (
          <div className="bg-card border border-border rounded-3xl p-6 space-y-6">
            <div className="flex items-center gap-2 border-b border-border pb-4">
              <SettingsIcon className="text-primary" size={20} />
              <h2 className="font-bold">Global Configuration</h2>
            </div>

            <div className="space-y-4">
              <div className="space-y-1">
                <label className="text-xs font-bold uppercase text-muted-foreground">Emergency Alert (Popup Modal)</label>
                <textarea
                  value={globalSettings.emergencyMessage}
                  onChange={(e) => setGlobalSettings({ ...globalSettings, emergencyMessage: e.target.value })}
                  className="w-full bg-rose-500/5 border border-rose-500/10 rounded-xl p-4 min-h-[80px] outline-none focus:ring-2 focus:ring-rose-500 text-rose-500 placeholder:text-rose-500/30"
                  placeholder="Critical message that pops up for everyone..."
                />
              </div>

              {/* Global Announcement with Markdown Preview */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold uppercase text-muted-foreground ml-1">Global Announcement</label>
                  <div className="flex bg-muted p-0.5 rounded-lg text-[10px]">
                    <button
                      type="button"
                      onClick={() => setAnnouncementTab('edit')}
                      className={`px-3 py-1 rounded-md font-extrabold transition-all ${announcementTab === 'edit' ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
                    >
                      Edit Text
                    </button>
                    <button
                      type="button"
                      onClick={() => setAnnouncementTab('preview')}
                      className={`px-3 py-1 rounded-md font-extrabold transition-all ${announcementTab === 'preview' ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
                    >
                      Preview
                    </button>
                  </div>
                </div>

                {announcementTab === 'edit' ? (
                  <div className="space-y-1">
                    <textarea
                      value={globalSettings.announcement}
                      onChange={(e) => setGlobalSettings({ ...globalSettings, announcement: e.target.value })}
                      className="w-full bg-muted border-none rounded-xl p-4 min-h-[100px] outline-none focus:ring-2 focus:ring-primary text-sm font-medium text-foreground"
                      placeholder="Message to show to all users... (Supports **bold text** and [Link Name](http://url))"
                    />
                    <p className="text-[10px] text-muted-foreground ml-1 leading-relaxed">
                      Formatting tips: Wrap text in <code className="bg-muted px-1 py-0.5 rounded text-primary font-bold">**bold**</code> or write links as <code className="bg-muted px-1 py-0.5 rounded text-primary font-bold">[Text](https://url)</code>.
                    </p>
                  </div>
                ) : (
                  <div className="w-full min-h-[100px] bg-muted/20 border border-dashed border-border rounded-xl p-4 flex items-start">
                    <p className="text-sm font-medium leading-relaxed text-foreground">
                      {globalSettings.announcement ? (
                        (() => {
                          const text = globalSettings.announcement;
                          const parts = text.split(/(\*\*.*?\*\*|\[.*?\]\(.*?\))/g);
                          return parts.map((part, index) => {
                            if (part.startsWith('**') && part.endsWith('**')) {
                              return <strong key={index} className="font-extrabold text-foreground">{part.slice(2, -2)}</strong>;
                            }
                            const linkMatch = part.match(/^\[(.*?)\]\((.*?)\)$/);
                            if (linkMatch) {
                              return (
                                <a
                                  key={index}
                                  href={linkMatch[2]}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="underline hover:text-primary font-bold text-primary transition-colors ml-0.5 mr-0.5"
                                >
                                  {linkMatch[1]}
                                </a>
                              );
                            }
                            return part;
                          });
                        })()
                      ) : (
                        <span className="italic text-muted-foreground text-xs">No announcement content to preview. Write something in Edit tab first.</span>
                      )}
                    </p>
                  </div>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="flex items-center justify-between p-4 bg-muted/50 rounded-2xl border border-border">
                  <div>
                    <p className="font-bold text-sm">Maintenance Mode</p>
                    <p className="text-xs text-muted-foreground">Lock the app for all users</p>
                  </div>
                  <button
                    onClick={() => setGlobalSettings({ ...globalSettings, maintenanceMode: !globalSettings.maintenanceMode })}
                    className={`w-12 h-6 rounded-full transition-all relative ${globalSettings.maintenanceMode ? 'bg-rose-500' : 'bg-muted'}`}
                  >
                    <div className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-all ${globalSettings.maintenanceMode ? 'right-1' : 'left-1'}`} />
                  </button>
                </div>

                <div className="flex items-center justify-between p-4 bg-muted/50 rounded-2xl border border-border">
                  <div>
                    <p className="font-bold text-sm">Allow New Signups</p>
                    <p className="text-xs text-muted-foreground">Disable new user registration</p>
                  </div>
                  <button
                    onClick={() => setGlobalSettings({ ...globalSettings, allowSignups: !globalSettings.allowSignups })}
                    className={`w-12 h-6 rounded-full transition-all relative ${globalSettings.allowSignups ? 'bg-emerald-500' : 'bg-muted'}`}
                  >
                    <div className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-all ${globalSettings.allowSignups ? 'right-1' : 'left-1'}`} />
                  </button>
                </div>

              </div>

              {/* Global Feature Controls */}
              <div className="border-t border-border pt-6 space-y-4">
                <div className="flex items-center gap-2">
                  <Sliders className="text-primary" size={18} />
                  <h3 className="font-bold text-base">Global Feature Controls</h3>
                </div>
                <p className="text-xs text-muted-foreground">Toggle features globally for all users. Disabling a feature here will hide it for everyone.</p>
                
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {FEATURES.map((feature) => {
                    const isEnabled = !(globalSettings.disabledFeatures || []).includes(feature.id);
                    return (
                      <div key={feature.id} className="flex items-center justify-between p-4 bg-muted/50 rounded-2xl border border-border">
                        <div>
                          <p className="font-bold text-sm">{feature.name}</p>
                          <p className="text-xs text-muted-foreground">{feature.desc}</p>
                        </div>
                        <button
                          onClick={() => {
                            const currentDisabled = globalSettings.disabledFeatures || [];
                            const updatedDisabled = currentDisabled.includes(feature.id)
                              ? currentDisabled.filter(id => id !== feature.id)
                              : [...currentDisabled, feature.id];
                            
                            const updates: Partial<GlobalConfig> = {
                              ...globalSettings,
                              disabledFeatures: updatedDisabled,
                              fuelTrackingEnabled: !updatedDisabled.includes('fuel'),
                              loansEnabled: !updatedDisabled.includes('loans')
                            };
                            setGlobalSettings(updates as GlobalConfig);
                          }}
                          className={`w-12 h-6 rounded-full transition-all relative shrink-0 ${isEnabled ? 'bg-emerald-500' : 'bg-muted'}`}
                        >
                          <div className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-all ${isEnabled ? 'right-1' : 'left-1'}`} />
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Currencies Administration Panel */}
              <div className="mt-8 border-t border-border pt-6 space-y-6">
                <div className="flex items-center gap-2">
                  <Coins className="text-primary" size={20} />
                  <h3 className="font-bold text-base">Global Currencies Configuration</h3>
                </div>

                {/* List of current supported currencies */}
                <div className="space-y-3">
                  <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Active Currencies</p>
                  {(globalSettings.supportedCurrencies || []).length === 0 ? (
                    <p className="text-sm text-muted-foreground italic">No currencies configured globally</p>
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      {(globalSettings.supportedCurrencies || []).map((cur) => (
                        <div key={cur.code} className="flex items-center justify-between p-4 bg-muted/30 rounded-2xl border border-border/50">
                          <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center font-bold text-base text-primary">
                              {cur.symbol}
                            </div>
                            <div>
                              <p className="font-bold text-sm">{cur.name}</p>
                              <p className="text-[10px] font-mono text-muted-foreground uppercase">{cur.code}</p>
                            </div>
                          </div>
                          <button
                            onClick={() => handleDeleteCurrency(cur.code)}
                            disabled={(globalSettings.supportedCurrencies || []).length <= 1}
                            className="p-2 bg-destructive/10 text-destructive hover:bg-destructive/20 disabled:opacity-30 disabled:hover:bg-destructive/10 rounded-lg transition-colors"
                            title="Delete Currency"
                          >
                            <X size={16} />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Add new currency form */}
                <div className="bg-muted/30 p-5 rounded-3xl border border-border space-y-4">
                  <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Add New Currency</p>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div className="space-y-1">
                      <label className="text-[10px] font-bold uppercase text-muted-foreground ml-1">Code</label>
                      <input
                        type="text"
                        value={newCurrencyCode}
                        onChange={(e) => setNewCurrencyCode(e.target.value)}
                        placeholder="e.g. CAD, AUD"
                        className="w-full bg-card border border-border rounded-xl px-4 py-2.5 text-xs outline-none focus:ring-2 focus:ring-primary font-bold text-foreground"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[10px] font-bold uppercase text-muted-foreground ml-1">Symbol</label>
                      <input
                        type="text"
                        value={newCurrencySymbol}
                        onChange={(e) => setNewCurrencySymbol(e.target.value)}
                        placeholder="e.g. $, C$"
                        className="w-full bg-card border border-border rounded-xl px-4 py-2.5 text-xs outline-none focus:ring-2 focus:ring-primary font-bold text-foreground"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[10px] font-bold uppercase text-muted-foreground ml-1">Name</label>
                      <input
                        type="text"
                        value={newCurrencyName}
                        onChange={(e) => setNewCurrencyName(e.target.value)}
                        placeholder="e.g. Canadian Dollar"
                        className="w-full bg-card border border-border rounded-xl px-4 py-2.5 text-xs outline-none focus:ring-2 focus:ring-primary font-bold text-foreground"
                      />
                    </div>
                  </div>
                  <button
                    onClick={handleAddCurrency}
                    className="w-full bg-primary/10 hover:bg-primary text-primary hover:text-primary-foreground py-3 rounded-xl font-bold text-xs uppercase tracking-wider transition-all flex items-center justify-center gap-1.5"
                  >
                    <Plus size={14} />
                    Add Currency Entry
                  </button>
                </div>
              </div>

              {/* Exchanges Administration Card */}
              <div className="mt-8 border-t border-border pt-6 space-y-6">
                <div className="flex items-center gap-2">
                  <Activity className="text-primary" size={20} />
                  <h3 className="font-bold text-base">Global Exchanges Configuration</h3>
                </div>
                
                {/* List of current exchanges */}
                <div className="space-y-3">
                  <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Active Exchanges</p>
                  {(globalSettings.exchanges || []).length === 0 ? (
                    <p className="text-sm text-muted-foreground italic">No exchanges configured globally</p>
                  ) : (
                    <div className="grid grid-cols-1 gap-2">
                      {(globalSettings.exchanges || []).map((ex) => (
                        <div key={ex.id} className="flex items-center justify-between p-4 bg-muted/30 rounded-2xl border border-border/50">
                          <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center font-bold text-sm text-primary">
                              {ex.name[0].toUpperCase()}
                            </div>
                            <div>
                              <p className="font-bold text-sm">{ex.name}</p>
                              <p className="text-[10px] font-mono text-muted-foreground">ID: {ex.id}</p>
                            </div>
                          </div>
                          
                          <div className="flex items-center gap-3">
                            <button
                              onClick={() => handleToggleExchange(ex.id)}
                              className={`px-3 py-1.5 rounded-lg text-xs font-black uppercase tracking-wider transition-all ${
                                ex.enabled 
                                  ? 'bg-emerald-500/10 text-emerald-500 hover:bg-emerald-500/20' 
                                  : 'bg-muted text-muted-foreground hover:bg-muted/80'
                              }`}
                            >
                              {ex.enabled ? 'Enabled' : 'Disabled'}
                            </button>
                            
                            <button
                              onClick={() => handleDeleteExchange(ex.id)}
                              className="p-2 bg-destructive/10 text-destructive hover:bg-destructive/20 rounded-lg transition-colors"
                            >
                              <X size={16} />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Add new exchange form */}
                <div className="bg-muted/30 p-5 rounded-3xl border border-border space-y-4">
                  <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Add New Exchange</p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-1">
                      <label className="text-[10px] font-bold uppercase text-muted-foreground ml-1">Exchange ID</label>
                      <input
                        type="text"
                        value={newExchangeId}
                        onChange={(e) => setNewExchangeId(e.target.value)}
                        placeholder="e.g. binance, mexc"
                        className="w-full bg-card border border-border rounded-xl px-4 py-2.5 text-xs outline-none focus:ring-2 focus:ring-primary font-bold"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[10px] font-bold uppercase text-muted-foreground ml-1">Exchange Name</label>
                      <input
                        type="text"
                        value={newExchangeName}
                        onChange={(e) => setNewExchangeName(e.target.value)}
                        placeholder="e.g. Binance Global, MEXC Global"
                        className="w-full bg-card border border-border rounded-xl px-4 py-2.5 text-xs outline-none focus:ring-2 focus:ring-primary font-bold"
                      />
                    </div>
                  </div>
                  <button
                    onClick={handleAddExchange}
                    className="w-full bg-primary/10 hover:bg-primary text-primary hover:text-primary-foreground py-3 rounded-xl font-bold text-xs uppercase tracking-wider transition-all"
                  >
                    Add Exchange Entry
                  </button>
                </div>
              </div>

              <div className="pt-4 flex flex-col sm:flex-row gap-3">
                <button
                  onClick={saveGlobalSettings}
                  className="flex-1 bg-primary text-primary-foreground py-4 rounded-2xl font-bold hover:opacity-90 transition-all flex items-center justify-center gap-2 shadow-lg shadow-primary/20"
                >
                  <Save size={18} />
                  Save Global Config
                </button>

                {initialSettings && JSON.stringify(globalSettings) !== JSON.stringify(initialSettings) && (
                  <button
                    onClick={handleResetSessionChanges}
                    className="flex-1 bg-muted hover:bg-muted/80 text-foreground py-4 rounded-2xl font-bold transition-all text-xs flex items-center justify-center gap-2"
                  >
                    Undo Changes
                  </button>
                )}

                {hasBackup && (
                  <button
                    onClick={revertGlobalSettings}
                    className="flex-1 bg-destructive/10 hover:bg-destructive/20 text-destructive py-4 rounded-2xl font-bold transition-all flex items-center justify-center gap-2 border border-destructive/20"
                  >
                    <RefreshCw size={18} />
                    Revert to Backup
                  </button>
                )}
              </div>
            </div>

            <div className="p-4 bg-amber-500/10 border border-amber-500/20 rounded-2xl flex gap-3 items-start">
              <AlertCircle size={20} className="text-amber-500 shrink-0" />
              <div className="text-xs text-amber-500/80 leading-relaxed">
                <p className="font-bold text-amber-500 mb-1">Super Admin Warning</p>
                Changing these settings affects all users instantly. Changes are synchronized to the Firebase cloud configuration.
              </div>
            </div>
          </div>
        )}

        {activeTab === 'analytics' && (
          <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* User Distribution */}
              <div className="bg-card border border-border rounded-3xl p-6 shadow-sm">
                <div className="flex items-center justify-between mb-6">
                  <h3 className="font-bold flex items-center gap-2">
                    <PieIcon size={18} className="text-primary" />
                    Account Types
                  </h3>
                </div>
                <div className="h-64 flex justify-center">
                  <Pie
                    data={{
                      labels: ['Pro Accounts', 'Standard Accounts'],
                      datasets: [{
                        data: [systemStats.proUsers, systemStats.totalUsers - systemStats.proUsers],
                        backgroundColor: ['rgba(245, 158, 11, 0.75)', 'rgba(99, 102, 241, 0.75)'],
                        hoverBackgroundColor: ['#f59e0b', '#6366f1'],
                        borderWidth: 0,
                      }]
                    }}
                    options={{
                      maintainAspectRatio: false,
                      plugins: {
                        legend: {
                          position: 'bottom',
                          labels: {
                            color: '#888888',
                            font: { family: 'Inter, sans-serif', weight: 'bold', size: 11 },
                            padding: 16,
                            usePointStyle: true,
                            pointStyle: 'circle'
                          }
                        },
                        tooltip: {
                          backgroundColor: 'rgba(15, 23, 42, 0.95)',
                          titleColor: '#ffffff',
                          bodyColor: '#e2e8f0',
                          padding: 12,
                          cornerRadius: 12,
                          borderWidth: 1,
                          borderColor: 'rgba(255, 255, 255, 0.1)',
                          bodyFont: { family: 'Inter, sans-serif', size: 12 },
                        }
                      }
                    }}
                  />
                </div>
              </div>

              {/* Module Health */}
              <div className="bg-card border border-border rounded-3xl p-6 shadow-sm">
                <div className="flex items-center justify-between mb-6">
                  <h3 className="font-bold flex items-center gap-2">
                    <BarChart3 size={18} className="text-primary" />
                    Feature Adoption
                  </h3>
                </div>
                <div className="h-64">
                  <Bar
                    data={{
                      labels: ['Fuel', 'Loans', 'Events', 'Pro'],
                      datasets: [{
                        label: 'Active Users',
                        data: [
                          globalSettings.fuelTrackingEnabled ? systemStats.totalUsers : 0,
                          globalSettings.loansEnabled ? systemStats.totalUsers : 0,
                          systemStats.totalEvents > 0 ? systemStats.totalUsers : 1, // Simulated
                          systemStats.proUsers
                        ],
                        backgroundColor: 'rgba(99, 102, 241, 0.7)',
                        hoverBackgroundColor: '#6366f1',
                        borderWidth: 0,
                        borderRadius: 10
                      }]
                    }}
                    options={{
                      maintainAspectRatio: false,
                      plugins: {
                        legend: { display: false },
                        tooltip: {
                          backgroundColor: 'rgba(15, 23, 42, 0.95)',
                          titleColor: '#ffffff',
                          bodyColor: '#e2e8f0',
                          padding: 12,
                          cornerRadius: 12,
                          borderWidth: 1,
                          borderColor: 'rgba(255, 255, 255, 0.1)',
                          bodyFont: { family: 'Inter, sans-serif', size: 12 },
                        }
                      },
                      scales: {
                        x: {
                          grid: { display: false },
                          ticks: {
                            color: '#888888',
                            font: { family: 'Inter, sans-serif', size: 10, weight: 'bold' }
                          }
                        },
                        y: {
                          beginAtZero: true,
                          grid: { color: 'rgba(150, 150, 150, 0.08)' },
                          ticks: {
                            color: '#888888',
                            font: { family: 'Inter, sans-serif', size: 10 }
                          }
                        }
                      }
                    }}
                  />
                </div>
              </div>
            </div>

            {/* Deep Scan Utility */}
            <div className="bg-card border border-border rounded-3xl p-8 relative overflow-hidden shadow-sm">
              <div className="absolute top-0 right-0 w-64 h-64 bg-primary/5 rounded-full -mr-32 -mt-32 blur-3xl" />

              <div className="flex flex-col md:flex-row items-center justify-between gap-6 relative">
                <div className="space-y-2 text-center md:text-left">
                  <h2 className="text-xl font-bold">Cloud Data Volume</h2>
                  <p className="text-sm text-muted-foreground">Scan all user repositories to calculate global transaction and loan volumes.</p>
                  {systemStats.lastScan && (
                    <p className="text-[10px] text-primary font-bold uppercase tracking-widest">
                      Last Scan: {format(new Date(systemStats.lastScan), 'MMM dd, HH:mm')}
                    </p>
                  )}
                </div>
                <button
                  onClick={scanSystemData}
                  disabled={isScanning}
                  className="px-8 py-4 bg-primary text-primary-foreground rounded-2xl font-bold hover:shadow-xl hover:shadow-primary/10 transition-all active:scale-95 flex items-center gap-2 disabled:opacity-50"
                >
                  {isScanning ? <RefreshCw className="animate-spin" size={20} /> : <Zap size={20} />}
                  {isScanning ? 'Scanning...' : 'Run Deep Scan'}
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 mt-10">
                <div className="p-6 bg-muted/30 rounded-2xl border border-border/50 text-center">
                  <p className="text-3xl font-black mb-1 text-foreground">{systemStats.totalTransactions.toLocaleString()}</p>
                  <p className="text-xs font-bold uppercase text-muted-foreground tracking-tighter">Total Transactions</p>
                </div>
                <div className="p-6 bg-muted/30 rounded-2xl border border-border/50 text-center">
                  <p className="text-3xl font-black mb-1 text-foreground">{systemStats.totalLoans.toLocaleString()}</p>
                  <p className="text-xs font-bold uppercase text-muted-foreground tracking-tighter">Total Loans</p>
                </div>
                <div className="p-6 bg-muted/30 rounded-2xl border border-border/50 text-center">
                  <p className="text-3xl font-black mb-1 text-foreground">{systemStats.totalEvents.toLocaleString()}</p>
                  <p className="text-xs font-bold uppercase text-muted-foreground tracking-tighter">Total Events</p>
                </div>
              </div>
            </div>

            {/* Growth Trend (Simulated) */}
            <div className="bg-card border border-border rounded-3xl p-6 shadow-sm">
              <h3 className="font-bold mb-6 flex items-center gap-2">
                <Activity size={18} className="text-emerald-500" />
                7-Day Activity Trend
              </h3>
              <div className="h-64">
                <Line
                  data={{
                    labels: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
                    datasets: [{
                      label: 'Active Users',
                      data: [12, 19, 15, 22, 28, 24, 30], // Simulated trend
                      borderColor: '#10b981',
                      backgroundColor: 'rgba(16, 185, 129, 0.05)',
                      fill: true,
                      tension: 0.4,
                      pointBackgroundColor: '#10b981',
                      pointBorderColor: '#ffffff',
                      pointBorderWidth: 2,
                      pointRadius: 4,
                      pointHoverRadius: 6
                    }]
                  }}
                  options={{
                    maintainAspectRatio: false,
                    plugins: {
                      legend: { display: false },
                      tooltip: {
                        backgroundColor: 'rgba(15, 23, 42, 0.95)',
                        titleColor: '#ffffff',
                        bodyColor: '#e2e8f0',
                        padding: 12,
                        cornerRadius: 12,
                        borderWidth: 1,
                        borderColor: 'rgba(255, 255, 255, 0.1)',
                        bodyFont: { family: 'Inter, sans-serif', size: 12 },
                      }
                    },
                    scales: {
                      x: {
                        grid: { display: false },
                        ticks: {
                          color: '#888888',
                          font: { family: 'Inter, sans-serif', size: 10, weight: 'bold' }
                        }
                      },
                      y: {
                        beginAtZero: true,
                        grid: { color: 'rgba(150, 150, 150, 0.08)' },
                        ticks: {
                          color: '#888888',
                          font: { family: 'Inter, sans-serif', size: 10 }
                        }
                      }
                    }
                  }}
                />
              </div>
            </div>
          </div>
        )}

        {activeTab === 'logs' && (() => {
          const filteredLogs = adminLogs.filter(log => {
            const matchesSearch = 
              log.action?.toLowerCase().includes(logSearchQuery.toLowerCase()) ||
              log.admin?.toLowerCase().includes(logSearchQuery.toLowerCase());
            
            if (!matchesSearch) return false;

            const actionLower = log.action?.toLowerCase() || '';
            switch (logTypeFilter) {
              case 'config':
                return actionLower.includes('config') || actionLower.includes('settings') || actionLower.includes('currency') || actionLower.includes('exchange');
              case 'user':
                return actionLower.includes('user') || actionLower.includes('pro') || actionLower.includes('banned') || actionLower.includes('feature') || actionLower.includes('permission');
              case 'scan':
                return actionLower.includes('scan') || actionLower.includes('deep');
              case 'all':
              default:
                return true;
            }
          });

          return (
            <div className="space-y-4">
              {/* Logs controls */}
              <div className="bg-card border border-border rounded-3xl p-5 space-y-4 shadow-sm">
                <div className="flex flex-col sm:flex-row gap-3">
                  {/* Search logs */}
                  <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground/60" size={16} />
                    <input
                      type="text"
                      placeholder="Search logs by action or admin..."
                      value={logSearchQuery}
                      onChange={(e) => setLogSearchQuery(e.target.value)}
                      className="w-full bg-muted/50 border border-transparent rounded-2xl py-2.5 pl-10 pr-10 outline-none focus:bg-card focus:border-primary/20 focus:ring-2 focus:ring-primary/10 transition-all text-xs font-semibold text-foreground placeholder:text-muted-foreground/75"
                    />
                    {logSearchQuery && (
                      <button
                        onClick={() => setLogSearchQuery('')}
                        className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-muted-foreground hover:text-foreground rounded-full hover:bg-muted transition-all"
                      >
                        <X size={12} />
                      </button>
                    )}
                  </div>
                </div>

                {/* Tag filters */}
                <div className="flex flex-wrap items-center gap-1.5 pt-3 border-t border-border/40">
                  <span className="text-[10px] font-extrabold uppercase tracking-wider text-muted-foreground mr-1.5">Log Category:</span>
                  {(
                    [
                      { id: 'all', label: 'All Logs' },
                      { id: 'config', label: 'Config Changes' },
                      { id: 'user', label: 'User Perms' },
                      { id: 'scan', label: 'System Scans' },
                  ] as const
                  ).map((pill) => (
                    <button
                      key={pill.id}
                      onClick={() => setLogTypeFilter(pill.id)}
                      className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all ${
                        logTypeFilter === pill.id
                          ? 'bg-primary text-primary-foreground shadow-sm shadow-primary/10 scale-105'
                          : 'bg-muted/40 hover:bg-muted text-muted-foreground hover:text-foreground'
                      }`}
                    >
                      {pill.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Audit Logs list card */}
              <div className="bg-card border border-border rounded-3xl overflow-hidden shadow-sm">
                <div className="p-5 border-b border-border flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Activity className="text-primary animate-pulse" size={18} />
                    <h2 className="font-extrabold text-sm text-foreground">System Audit Trail</h2>
                  </div>
                  <span className="text-[10px] bg-primary/5 text-primary border border-primary/10 px-2 py-0.5 rounded-full font-black uppercase">
                    {filteredLogs.length} Entries
                  </span>
                </div>
                
                <div className="divide-y divide-border max-h-[500px] overflow-y-auto">
                  {filteredLogs.length === 0 ? (
                    <div className="p-16 text-center text-muted-foreground">
                      <Activity className="mx-auto mb-3 opacity-20" size={48} />
                      <p className="text-sm font-bold text-foreground">No logs found</p>
                      <p className="text-xs text-muted-foreground mt-1">Try clearing your search query or choosing another category</p>
                    </div>
                  ) : (
                    filteredLogs.map(log => {
                      const actionLower = log.action?.toLowerCase() || '';
                      let logIcon = <Activity size={16} />;
                      let iconBg = 'bg-primary/5 text-primary border-primary/10';

                      if (actionLower.includes('config') || actionLower.includes('settings') || actionLower.includes('currency') || actionLower.includes('exchange')) {
                        logIcon = <SettingsIcon size={16} />;
                        iconBg = 'bg-blue-500/5 text-blue-500 border-blue-500/10';
                      } else if (actionLower.includes('user') || actionLower.includes('pro') || actionLower.includes('banned') || actionLower.includes('feature') || actionLower.includes('permission')) {
                        logIcon = <Users size={16} />;
                        iconBg = 'bg-amber-500/5 text-amber-500 border-amber-500/10';
                      } else if (actionLower.includes('scan') || actionLower.includes('deep')) {
                        logIcon = <Zap size={16} />;
                        iconBg = 'bg-emerald-500/5 text-emerald-500 border-emerald-500/10';
                      }

                      return (
                        <div key={log.id} className="p-4 flex items-start justify-between gap-4 hover:bg-muted/10 transition-colors">
                          <div className="flex items-start gap-3">
                            <div className={`w-8 h-8 rounded-xl border flex items-center justify-center shrink-0 ${iconBg}`}>
                              {logIcon}
                            </div>
                            <div className="space-y-0.5">
                              <p className="font-semibold text-sm text-foreground leading-tight">
                                {highlightText(log.action || '', logSearchQuery)}
                              </p>
                              <p className="text-[10px] text-muted-foreground font-black uppercase tracking-wider">
                                Operator: {highlightText(log.admin || 'System', logSearchQuery)}
                              </p>
                            </div>
                          </div>
                          <div className="text-right text-[11px] text-muted-foreground font-semibold shrink-0 pt-0.5">
                            {log.timestamp?.toDate ? format(log.timestamp.toDate(), 'MMM dd, HH:mm:ss') : 'Just now'}
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            </div>
          );
        })()}
      </div>

      {showQueueModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-card border border-border w-full max-w-lg rounded-3xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="p-6 border-b border-border flex items-center justify-between bg-muted/30">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-amber-500/10 rounded-xl text-amber-500">
                  <MessageSquare size={20} />
                </div>
                <div>
                  <h3 className="font-bold">Pending Sync Tasks</h3>
                  <p className="text-[10px] text-muted-foreground uppercase font-bold tracking-widest">Local Database Queue</p>
                </div>
              </div>
              <button 
                onClick={() => setShowQueueModal(false)}
                className="p-2 hover:bg-muted rounded-full transition-colors"
              >
                <X size={20} />
              </button>
            </div>

            <div className="p-4 max-h-[400px] overflow-y-auto space-y-2">
              {pendingItems.length === 0 ? (
                <div className="p-12 text-center text-muted-foreground italic">
                  <ShieldCheck size={48} className="mx-auto mb-2 opacity-10" />
                  No pending sync tasks
                </div>
              ) : (
                pendingItems.map((item, idx) => {
                  let payload = {};
                  try { payload = JSON.parse(item.payload); } catch (e) {}
                  return (
                    <div key={item.id || idx} className="p-3 bg-muted/50 rounded-xl border border-border/50 flex items-center justify-between text-xs">
                      <div className="space-y-1">
                        <p className="font-bold text-primary flex items-center gap-1">
                          <span className="uppercase">{item.type}</span>
                          <span className="opacity-40 font-normal">|</span>
                          <span className="font-mono opacity-60">ID: {(payload as any).id || (payload as any).key || '---'}</span>
                        </p>
                        <p className="text-muted-foreground opacity-70">
                          Added: {format(new Date(item.timestamp), 'MMM dd, HH:mm:ss')}
                        </p>
                      </div>
                      <div className="px-2 py-1 bg-amber-500/10 text-amber-500 rounded-md font-bold uppercase text-[9px]">
                        Pending
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            <div className="p-6 bg-muted/30 border-t border-border flex gap-3">
              <button
                onClick={() => setShowQueueModal(false)}
                className="flex-1 px-4 py-3 bg-muted text-foreground rounded-2xl font-bold hover:bg-muted/80 transition-all"
              >
                Close
              </button>
              <button
                onClick={triggerForceSync}
                disabled={isForceSyncing}
                className="flex-[2] px-4 py-3 bg-primary text-primary-foreground rounded-2xl font-bold hover:shadow-lg hover:shadow-primary/20 transition-all active:scale-95 flex items-center justify-center gap-2 disabled:opacity-50"
              >
                {isForceSyncing ? <RefreshCw className="animate-spin" size={18} /> : <Send size={18} />}
                {isForceSyncing ? 'Syncing...' : 'Force Sync Now'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Manage User Features Modal */}
      {selectedUserForFeatures && (
        <div className="fixed inset-0 z-[150] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-300">
          <div className="bg-card w-full max-w-lg rounded-3xl border border-border shadow-2xl overflow-hidden flex flex-col max-h-[85vh] animate-in zoom-in duration-300">
            <div className="p-6 border-b border-border flex items-center justify-between">
              <div>
                <h2 className="text-xl font-bold">User Feature Access</h2>
                <p className="text-xs text-muted-foreground mt-1">
                  {selectedUserForFeatures.displayName || 'Unnamed User'} ({selectedUserForFeatures.email})
                </p>
              </div>
              <button 
                onClick={() => setSelectedUserForFeatures(null)} 
                className="p-1 hover:bg-muted rounded-full transition-colors"
              >
                <X size={20} />
              </button>
            </div>

            <div className="p-6 overflow-y-auto space-y-4 flex-1">
              <p className="text-xs text-muted-foreground mb-4">
                Toggle which features are accessible for this user. Note that if a feature is disabled globally in Settings, it will be unavailable regardless of individual user settings.
              </p>
              
              <div className="space-y-3">
                {FEATURES.map((feature) => {
                  const isGloballyDisabled = (globalSettings.disabledFeatures || []).includes(feature.id);
                  const isEnabled = !userDisabledFeatures.includes(feature.id);
                  
                  return (
                    <div 
                      key={feature.id} 
                      className={`flex items-center justify-between p-4 rounded-2xl border transition-all ${
                        isGloballyDisabled 
                          ? 'bg-muted/30 border-dashed border-border opacity-70' 
                          : 'bg-muted/50 border-border'
                      }`}
                    >
                      <div className="pr-4">
                        <div className="flex items-center gap-2">
                          <p className="font-bold text-sm">{feature.name}</p>
                          {isGloballyDisabled && (
                            <span className="text-[9px] bg-rose-500/10 text-rose-500 px-1.5 py-0.5 rounded-full font-bold uppercase">
                              Disabled Globally
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground mt-0.5">{feature.desc}</p>
                      </div>
                      
                      <button
                        onClick={() => {
                          const updated = userDisabledFeatures.includes(feature.id)
                            ? userDisabledFeatures.filter(id => id !== feature.id)
                            : [...userDisabledFeatures, feature.id];
                          setUserDisabledFeatures(updated);
                        }}
                        className={`w-12 h-6 rounded-full transition-all relative shrink-0 ${
                          isEnabled ? 'bg-emerald-500' : 'bg-muted'
                        }`}
                      >
                        <div className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-all ${
                          isEnabled ? 'right-1' : 'left-1'
                        }`} />
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="p-6 bg-muted/30 border-t border-border flex gap-3">
              <button
                onClick={() => setSelectedUserForFeatures(null)}
                className="flex-1 px-4 py-3 bg-muted text-foreground rounded-2xl font-bold hover:bg-muted/80 transition-all text-sm"
              >
                Cancel
              </button>
              <button
                onClick={saveUserFeatures}
                className="flex-[2] px-4 py-3 bg-primary text-primary-foreground rounded-2xl font-bold hover:shadow-lg hover:shadow-primary/20 transition-all text-sm"
              >
                Save Permissions
              </button>
            </div>
          </div>
        </div>
      )}

      <ConfirmModal
        isOpen={showLogoutConfirm}
        title="Exit Admin Panel?"
        message="Are you sure you want to exit the administration view? You will need to enter your admin credentials again to return."
        onConfirm={() => {
          setIsAuthorized(false);
          localStorage.removeItem('admin_authorized');
          setShowLogoutConfirm(false);
        }}
        onCancel={() => setShowLogoutConfirm(false)}
        variant="danger"
        confirmText="Exit Admin"
      />
    </div>
  );
};

export default Admin;
