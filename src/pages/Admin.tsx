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
  Activity
} from 'lucide-react';
import { db } from '../firebase';
import { collection, getDocs, doc, setDoc, getDoc, updateDoc, addDoc, serverTimestamp, query, orderBy, limit } from 'firebase/firestore';
import { toast } from 'sonner';
import { format } from 'date-fns';

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
  const [activeTab, setActiveTab] = useState<'users' | 'settings' | 'logs'>('users');
  const [adminLogs, setAdminLogs] = useState<AdminLog[]>([]);

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
    } catch (error) {
      console.error('Admin fetch error:', error);
      toast.error('Failed to load admin data');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (isAuthorized) {
      fetchData();
    }
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
            onClick={() => {
              setIsAuthorized(false);
              localStorage.removeItem('admin_authorized');
            }}
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
            { label: 'Total Users', value: users.length, icon: Users, color: 'text-blue-500' },
            { label: 'Active Today', value: users.filter(u => u.lastLogin?.includes(new Date().toISOString().split('T')[0])).length, icon: Activity, color: 'text-emerald-500' },
            { label: 'Cloud Status', value: 'Healthy', icon: TrendingUp, color: 'text-orange-500' },
            { label: 'Sync Queue', value: 'Clear', icon: MessageSquare, color: 'text-primary' },
          ].map((stat, i) => (
            <div key={i} className="bg-card border border-border p-4 rounded-2xl">
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
    </div>
  );
};

export default Admin;
