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
  TrendingDown,
  X,
  Send
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
    version: '1.0.0'
  });

  const [isLoading, setIsLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeTab, setActiveTab] = useState<'users' | 'settings' | 'logs' | 'analytics'>('users');
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
      toast.error('Invalid credentials');
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
        setGlobalSettings(settingsDoc.data() as GlobalConfig);
      }

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
      await setDoc(doc(db, 'system', 'global_config'), globalSettings);

      // Log action
      await addDoc(collection(db, 'admin_logs'), {
        action: `Updated global configuration`,
        timestamp: serverTimestamp(),
        admin: ADMIN_USER
      });

      toast.success('Global settings updated');
    } catch (error) {
      toast.error('Failed to save settings');
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
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <div className="w-full max-w-md bg-card border border-border rounded-3xl p-8 shadow-2xl space-y-8 animate-in fade-in zoom-in duration-300">
          <div className="text-center space-y-2">
            <div className="inline-flex items-center justify-center w-16 h-16 bg-primary/10 rounded-2xl text-primary mb-2">
              <ShieldCheck size={32} />
            </div>
            <h1 className="text-2xl font-bold">Admin Portal</h1>
            <p className="text-sm text-muted-foreground">Authorized access only</p>
          </div>

          <form onSubmit={handleLogin} className="space-y-4">
            <div className="space-y-1">
              <label className="text-xs font-bold uppercase text-muted-foreground ml-1">Username</label>
              <div className="relative">
                <Users className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={18} />
                <input
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  className="w-full bg-muted border-none rounded-xl py-3 pl-10 pr-4 outline-none focus:ring-2 focus:ring-primary transition-all"
                  placeholder="Enter username"
                />
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-xs font-bold uppercase text-muted-foreground ml-1">Password</label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={18} />
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full bg-muted border-none rounded-xl py-3 pl-10 pr-4 outline-none focus:ring-2 focus:ring-primary transition-all"
                  placeholder="Enter password"
                />
              </div>
            </div>

            <button
              type="submit"
              className="w-full bg-primary text-primary-foreground py-4 rounded-2xl font-bold hover:opacity-90 transition-all flex items-center justify-center gap-2"
            >
              <ShieldCheck size={18} />
              Login as Admin
            </button>
          </form>
        </div>
      </div>
    );
  }

  const filteredUsers = users.filter(u =>
    u.email?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    u.displayName?.toLowerCase().includes(searchQuery.toLowerCase())
  );

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
            <div className="flex gap-4">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={18} />
                <input
                  type="text"
                  placeholder="Search users by name or email..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full bg-card border border-border rounded-2xl py-3 pl-10 pr-4 outline-none focus:ring-2 focus:ring-primary"
                />
              </div>
              <button
                onClick={exportToExcel}
                className="bg-card border border-border px-4 py-2 rounded-2xl flex items-center gap-2 hover:bg-muted transition-colors font-medium text-sm"
              >
                <TrendingUp size={18} className="text-primary" />
                Export CSV
              </button>
            </div>

            <div className="bg-card border border-border rounded-3xl overflow-hidden">
              <div className="divide-y divide-border">
                {isLoading ? (
                  <div className="p-12 flex justify-center">
                    <Activity className="animate-spin text-primary" size={32} />
                  </div>
                ) : filteredUsers.length === 0 ? (
                  <div className="p-12 text-center text-muted-foreground">
                    <Users className="mx-auto mb-2 opacity-20" size={48} />
                    <p>No users found</p>
                  </div>
                ) : (
                  filteredUsers.map(u => (
                    <div key={u.id} className={`p-4 flex items-center justify-between hover:bg-muted/30 transition-colors ${u.isBanned ? 'opacity-50 grayscale' : ''}`}>
                      <div className="flex items-center gap-3">
                        <div className="relative">
                          <div className="w-10 h-10 bg-primary/10 rounded-full flex items-center justify-center text-primary font-bold overflow-hidden">
                            {u.photoURL ? <img src={u.photoURL} alt="" /> : u.email?.[0].toUpperCase()}
                          </div>
                          {u.isPro && (
                            <div className="absolute -top-1 -right-1 bg-amber-500 text-white rounded-full p-0.5 border-2 border-card">
                              <ShieldCheck size={10} />
                            </div>
                          )}
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <p className="font-bold text-sm">{u.displayName || 'Unnamed User'}</p>
                            {u.isPro && <span className="text-[10px] bg-amber-500/10 text-amber-500 px-1.5 py-0.5 rounded-full font-bold uppercase">Pro</span>}
                            {u.isBanned && <span className="text-[10px] bg-rose-500/10 text-rose-500 px-1.5 py-0.5 rounded-full font-bold uppercase">Banned</span>}
                          </div>
                          <p className="text-xs text-muted-foreground">{u.email} • <span className="font-mono text-[10px] opacity-60">{u.lastIP || '0.0.0.0'}</span></p>
                          {u.stats && (
                            <div className="flex gap-2 mt-1">
                              <span className="text-[9px] bg-primary/5 text-primary px-1.5 py-0.5 rounded-md font-medium">TX: {u.stats.transactions}</span>
                              <span className="text-[9px] bg-emerald-500/5 text-emerald-500 px-1.5 py-0.5 rounded-md font-medium">LN: {u.stats.loans}</span>
                              <span className="text-[9px] bg-orange-500/5 text-orange-500 px-1.5 py-0.5 rounded-md font-medium">EV: {u.stats.events}</span>
                            </div>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-4">
                        <div className="text-right hidden sm:block">
                          <p className="text-[10px] uppercase font-bold text-muted-foreground">Last Active</p>
                          <p className="text-xs">{u.lastLogin ? format(new Date(u.lastLogin), 'MMM dd, HH:mm') : 'Never'}</p>
                        </div>
                        <div className="flex items-center gap-2 border-l border-border pl-4">
                          <button
                            onClick={() => toggleProStatus(u)}
                            className={`p-2 rounded-lg transition-colors ${u.isPro ? 'text-amber-500 hover:bg-amber-500/10' : 'text-muted-foreground hover:bg-muted'}`}
                            title={u.isPro ? 'Remove Pro' : 'Make Pro'}
                          >
                            <ShieldCheck size={18} />
                          </button>
                          <button
                            onClick={() => toggleBanStatus(u)}
                            className={`p-2 rounded-lg transition-colors ${u.isBanned ? 'text-rose-500 hover:bg-rose-500/10' : 'text-muted-foreground hover:bg-muted'}`}
                            title={u.isBanned ? 'Unban User' : 'Ban User'}
                          >
                            <AlertCircle size={18} />
                          </button>
                        </div>
                      </div>
                    </div>
                  ))
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

              <div className="space-y-1">
                <label className="text-xs font-bold uppercase text-muted-foreground">Global Announcement</label>
                <textarea
                  value={globalSettings.announcement}
                  onChange={(e) => setGlobalSettings({ ...globalSettings, announcement: e.target.value })}
                  className="w-full bg-muted border-none rounded-xl p-4 min-h-[100px] outline-none focus:ring-2 focus:ring-primary"
                  placeholder="Message to show to all users..."
                />
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

                <div className="flex items-center justify-between p-4 bg-muted/50 rounded-2xl border border-border">
                  <div>
                    <p className="font-bold text-sm">Fuel Tracking Module</p>
                    <p className="text-xs text-muted-foreground">Global Fuel/Mileage feature</p>
                  </div>
                  <button
                    onClick={() => setGlobalSettings({ ...globalSettings, fuelTrackingEnabled: !globalSettings.fuelTrackingEnabled })}
                    className={`w-12 h-6 rounded-full transition-all relative ${globalSettings.fuelTrackingEnabled ? 'bg-emerald-500' : 'bg-muted'}`}
                  >
                    <div className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-all ${globalSettings.fuelTrackingEnabled ? 'right-1' : 'left-1'}`} />
                  </button>
                </div>

                <div className="flex items-center justify-between p-4 bg-muted/50 rounded-2xl border border-border">
                  <div>
                    <p className="font-bold text-sm">Loans Module</p>
                    <p className="text-xs text-muted-foreground">Global Loan/Debt feature</p>
                  </div>
                  <button
                    onClick={() => setGlobalSettings({ ...globalSettings, loansEnabled: !globalSettings.loansEnabled })}
                    className={`w-12 h-6 rounded-full transition-all relative ${globalSettings.loansEnabled ? 'bg-emerald-500' : 'bg-muted'}`}
                  >
                    <div className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-all ${globalSettings.loansEnabled ? 'right-1' : 'left-1'}`} />
                  </button>
                </div>
              </div>

              <div className="pt-4 flex gap-3">
                <button
                  onClick={saveGlobalSettings}
                  className="flex-1 bg-primary text-primary-foreground py-4 rounded-2xl font-bold hover:opacity-90 transition-all flex items-center justify-center gap-2 shadow-lg shadow-primary/20"
                >
                  <Save size={18} />
                  Save Global Config
                </button>
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
              <div className="bg-card border border-border rounded-3xl p-6">
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
                        backgroundColor: ['rgba(245, 158, 11, 0.8)', 'rgba(59, 130, 246, 0.8)'],
                        borderColor: ['#f59e0b', '#3b82f6'],
                        borderWidth: 2,
                      }]
                    }}
                    options={{ maintainAspectRatio: false, plugins: { legend: { position: 'bottom' } } }}
                  />
                </div>
              </div>

              {/* Module Health */}
              <div className="bg-card border border-border rounded-3xl p-6">
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
                        backgroundColor: 'rgba(99, 102, 241, 0.5)',
                        borderColor: '#6366f1',
                        borderWidth: 2,
                        borderRadius: 8
                      }]
                    }}
                    options={{ maintainAspectRatio: false, scales: { y: { beginAtZero: true } } }}
                  />
                </div>
              </div>
            </div>

            {/* Deep Scan Utility */}
            <div className="bg-card border border-border rounded-3xl p-8 relative overflow-hidden">
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
                  className="px-8 py-4 bg-primary text-primary-foreground rounded-2xl font-bold hover:shadow-xl transition-all active:scale-95 flex items-center gap-2 disabled:opacity-50"
                >
                  {isScanning ? <RefreshCw className="animate-spin" size={20} /> : <Zap size={20} />}
                  {isScanning ? 'Scanning...' : 'Run Deep Scan'}
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 mt-10">
                <div className="p-6 bg-muted/50 rounded-2xl border border-border text-center">
                  <p className="text-3xl font-black mb-1">{systemStats.totalTransactions.toLocaleString()}</p>
                  <p className="text-xs font-bold uppercase text-muted-foreground tracking-tighter">Total Transactions</p>
                </div>
                <div className="p-6 bg-muted/50 rounded-2xl border border-border text-center">
                  <p className="text-3xl font-black mb-1">{systemStats.totalLoans.toLocaleString()}</p>
                  <p className="text-xs font-bold uppercase text-muted-foreground tracking-tighter">Total Loans</p>
                </div>
                <div className="p-6 bg-muted/50 rounded-2xl border border-border text-center">
                  <p className="text-3xl font-black mb-1">{systemStats.totalEvents.toLocaleString()}</p>
                  <p className="text-xs font-bold uppercase text-muted-foreground tracking-tighter">Total Events</p>
                </div>
              </div>
            </div>

            {/* Growth Trend (Simulated) */}
            <div className="bg-card border border-border rounded-3xl p-6">
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
                      backgroundColor: 'rgba(16, 185, 129, 0.1)',
                      fill: true,
                      tension: 0.4
                    }]
                  }}
                  options={{ maintainAspectRatio: false }}
                />
              </div>
            </div>
          </div>
        )}

        {activeTab === 'logs' && (
          <div className="bg-card border border-border rounded-3xl overflow-hidden shadow-sm">
            <div className="p-4 border-b border-border flex items-center gap-2">
              <Activity className="text-primary" size={20} />
              <h2 className="font-bold">System Audit Logs</h2>
            </div>
            <div className="divide-y divide-border max-h-[600px] overflow-y-auto">
              {adminLogs.length === 0 ? (
                <div className="p-12 text-center text-muted-foreground italic">No logs recorded yet</div>
              ) : (
                adminLogs.map(log => (
                  <div key={log.id} className="p-4 flex items-center justify-between text-sm">
                    <div className="space-y-1">
                      <p className="font-medium">{log.action}</p>
                      <p className="text-[10px] text-muted-foreground uppercase font-bold">BY: {log.admin}</p>
                    </div>
                    <div className="text-right text-xs text-muted-foreground">
                      {log.timestamp?.toDate ? format(log.timestamp.toDate(), 'MMM dd, HH:mm:ss') : 'Just now'}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        )}
      </div>

      {/* Sync Queue Modal */}
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
