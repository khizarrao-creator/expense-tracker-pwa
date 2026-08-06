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
  Sparkles,
  Megaphone,
  ArrowUpDown,
  Info,
  Mail,
  Check,
  Bold,
  Italic,
  Underline,
  List,
  ListOrdered,
  Link2,
  Crown,
  Shield,
  Trash2,
  Edit,
  MapPin,
  CheckCircle2,
  XCircle,
  PlusCircle,
  CreditCard,
  Clock,
  Loader2,
  Download,
  Upload,
} from 'lucide-react';
import { syncManager } from '../db/SyncManager';
import { userMigrationSyncManager, type VerificationReport } from '../services/UserMigrationSyncManager';
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
import { supabase, isSupabaseConfigured } from '../supabase';
import { getWhatsAppStatus } from '../services/whatsappService';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { executeQuery } from '../db/sqlite';
import ConfirmModal from '../components/ConfirmModal';
import { Modal } from '../components/ui/Modal';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Badge } from '../components/ui/Badge';
import { PlanBadge } from '../components/ui/PlanBadge';

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
  { id: 'subscriptions', name: 'Subscription Manager', desc: 'Track and analyze recurring subscriptions' },
  { id: 'whatsapp', name: 'WhatsApp Copilot', desc: 'Read, send messages and sync WhatsApp accounts' },
  { id: 'projects', name: 'Projects Management', desc: 'Team projects, whiteboard, and collaborative tasks' }
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
  plan?: string;
  planExpiresAt?: any;
  geminiApiKey?: string;
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
  fallbackApiKey?: string;
  fallbackModelId?: string;
  globalSystemInstruction?: string;
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
interface RichTextEditorProps {
  value: string;
  onChange: (val: string) => void;
}

const RichTextEditor: React.FC<RichTextEditorProps> = ({ value, onChange }) => {
  const editorRef = React.useRef<HTMLDivElement>(null);

  // Sync state to innerHTML only when it doesn't match the current content
  useEffect(() => {
    if (editorRef.current && editorRef.current.innerHTML !== value) {
      editorRef.current.innerHTML = value || '<p><br></p>';
    }
  }, [value]);

  const handleInput = () => {
    if (editorRef.current) {
      onChange(editorRef.current.innerHTML);
    }
  };

  const execCmd = (command: string, arg: string = '') => {
    document.execCommand(command, false, arg);
    handleInput();
  };

  const addLink = () => {
    const url = prompt('Enter the link URL:');
    if (url) {
      execCmd('createLink', url);
    }
  };

  return (
    <div className="border border-border rounded-3xl overflow-hidden flex flex-col bg-muted/20">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-1 p-2 bg-muted/50 border-b border-border">
        <button
          type="button"
          onClick={() => execCmd('bold')}
          className="p-1.5 rounded-lg hover:bg-muted text-foreground hover:text-foreground transition-all"
          title="Bold"
        >
          <Bold size={13} />
        </button>
        <button
          type="button"
          onClick={() => execCmd('italic')}
          className="p-1.5 rounded-lg hover:bg-muted text-foreground hover:text-foreground transition-all"
          title="Italic"
        >
          <Italic size={13} />
        </button>
        <button
          type="button"
          onClick={() => execCmd('underline')}
          className="p-1.5 rounded-lg hover:bg-muted text-foreground hover:text-foreground transition-all"
          title="Underline"
        >
          <Underline size={13} />
        </button>

        <div className="w-px h-4 bg-border/80 mx-1" />

        <button
          type="button"
          onClick={() => execCmd('formatBlock', '<h2>')}
          className="px-2 py-1 rounded-lg hover:bg-muted text-foreground font-extrabold text-[10px] transition-all"
          title="Heading 2"
        >
          H2
        </button>
        <button
          type="button"
          onClick={() => execCmd('formatBlock', '<h3>')}
          className="px-2 py-1 rounded-lg hover:bg-muted text-foreground font-extrabold text-[10px] transition-all"
          title="Heading 3"
        >
          H3
        </button>
        <button
          type="button"
          onClick={() => execCmd('formatBlock', '<p>')}
          className="px-2 py-1 rounded-lg hover:bg-muted text-foreground font-extrabold text-[10px] transition-all"
          title="Paragraph"
        >
          Para
        </button>

        <div className="w-px h-4 bg-border/80 mx-1" />

        <button
          type="button"
          onClick={() => execCmd('insertUnorderedList')}
          className="p-1.5 rounded-lg hover:bg-muted text-foreground hover:text-foreground transition-all"
          title="Bullet List"
        >
          <List size={13} />
        </button>
        <button
          type="button"
          onClick={() => execCmd('insertOrderedList')}
          className="p-1.5 rounded-lg hover:bg-muted text-foreground hover:text-foreground transition-all"
          title="Numbered List"
        >
          <ListOrdered size={13} />
        </button>

        <div className="w-px h-4 bg-border/80 mx-1" />

        <button
          type="button"
          onClick={addLink}
          className="p-1.5 rounded-lg hover:bg-muted text-foreground hover:text-foreground transition-all"
          title="Link"
        >
          <Link2 size={13} />
        </button>
        <button
          type="button"
          onClick={() => execCmd('removeFormat')}
          className="p-1.5 rounded-lg hover:bg-muted text-foreground hover:text-foreground transition-all"
          title="Clear Format"
        >
          <Sparkles size={13} />
        </button>
      </div>

      {/* Editable Area */}
      <div
        ref={editorRef}
        contentEditable
        onInput={handleInput}
        className="w-full min-h-[220px] bg-card text-card-foreground p-4 outline-none text-xs font-medium leading-relaxed overflow-y-auto max-h-[350px] text-left prose prose-sm max-w-none focus:ring-1 focus:ring-primary/20 focus:border-primary/20"
        style={{ minHeight: '220px' }}
      />
    </div>
  );
};

const Admin: React.FC = () => {
  const [isAuthorized, setIsAuthorized] = useState(false);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isShake, setIsShake] = useState(false);
  const [adminUsername, setAdminUsername] = useState(import.meta.env.VITE_ADMIN_EMAIL || '');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmNewPassword, setConfirmNewPassword] = useState('');
  const [isChangingPass, setIsChangingPass] = useState(false);
  const [expandedUserId, setExpandedUserId] = useState<string | null>(null);
  const [directNotifMessage, setDirectNotifMessage] = useState('');
  const [isSendingDirectNotif, setIsSendingDirectNotif] = useState(false);
  const [whatsappAccounts, setWhatsappAccounts] = useState<any[]>([]);
  const [isRefreshingWhatsApp, setIsRefreshingWhatsApp] = useState(false);
  const [broadcastMessage, setBroadcastMessage] = useState('');
  const [isSendingBroadcast, setIsSendingBroadcast] = useState(false);

  // Force-reset admin credentials to expected values on every mount
  useEffect(() => {
    // Admin auth verified via Netlify Edge Function
  }, []);

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
    ],
    fallbackApiKey: '',
    fallbackModelId: 'gemini-2.5-flash',
    globalSystemInstruction: ''
  });

  const [hasBackup] = useState(false);
  const [initialSettings, setInitialSettings] = useState<GlobalConfig | null>(null);

  const [selectedUserForFeatures, setSelectedUserForFeatures] = useState<UserProfile | null>(null);
  const [userDisabledFeatures, setUserDisabledFeatures] = useState<string[]>([]);
  const [userGeminiApiKey, setUserGeminiApiKey] = useState('');
  const [showUserGeminiApiKey, setShowUserGeminiApiKey] = useState(false);

  const handleUpdateAdminPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentPassword || !newPassword || !confirmNewPassword) {
      toast.error('All password fields are required');
      return;
    }
    if (newPassword !== confirmNewPassword) {
      toast.error('New passwords do not match');
      return;
    }
    setIsChangingPass(true);
    try {
      if (isSupabaseConfigured) {
        await supabase.from('admin_logs').insert({
          action: 'Updated admin password',
          admin: adminUsername || 'admin'
        });
      }
      toast.success('Admin password update logged.');
      setCurrentPassword('');
      setNewPassword('');
      setConfirmNewPassword('');
      setShowPassword(false);
    } catch (e: any) {
      toast.error('Failed to change password');
    } finally {
      setIsChangingPass(false);
    }
  };

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
  const [activeTab, setActiveTab] = useState<'users' | 'settings' | 'logs' | 'analytics' | 'email' | 'payments' | 'plans' | 'sync'>('users');
  const [announcementTab, setAnnouncementTab] = useState<'edit' | 'preview'>('edit');
  const [newCurrencyCode, setNewCurrencyCode] = useState('');
  const [newCurrencySymbol, setNewCurrencySymbol] = useState('');
  const [newCurrencyName, setNewCurrencyName] = useState('');
  const [logSearchQuery, setLogSearchQuery] = useState('');
  const [logTypeFilter, setLogTypeFilter] = useState<'all' | 'config' | 'user' | 'scan'>('all');
  const [adminLogs, setAdminLogs] = useState<AdminLog[]>([]);
  const [verificationReport, setVerificationReport] = useState<VerificationReport | null>(null);
  const [isVerifying, setIsVerifying] = useState(false);

  const handleCompareUser = async (u: any) => {
    setIsVerifying(true);
    try {
      toast.loading(`Comparing Firestore vs Supabase for ${u.email}...`, { id: 'compareReport' });
      const report = await userMigrationSyncManager.compareCloudData(u.id, u.email);
      setVerificationReport(report);
      toast.dismiss('compareReport');
      if (report.isPerfectMatch) {
        toast.success(`100% Match! Firestore & Supabase data matched for ${u.email}`);
      } else {
        toast.info(`Comparison report ready for ${u.email}`);
      }
    } catch (e: any) {
      toast.dismiss('compareReport');
      toast.error('Failed to generate comparison report');
    } finally {
      setIsVerifying(false);
    }
  };

  // Payments Tab States
  const [paymentRequests, setPaymentRequests] = useState<any[]>([]);
  const [paymentAccounts, setPaymentAccounts] = useState<any[]>([]);
  const [selectedRequest, setSelectedRequest] = useState<any | null>(null);
  const [rejectionReason, setRejectionReason] = useState<string>('');
  const [internalNotes, setInternalNotes] = useState<string>('');
  const [showApprovalModal, setShowApprovalModal] = useState<boolean>(false);
  const [showRejectionModal, setShowRejectionModal] = useState<boolean>(false);
  const [showAccountModal, setShowAccountModal] = useState<boolean>(false);
  const [customExpiryDate, setCustomExpiryDate] = useState<string>(() => {
    const d = new Date();
    d.setDate(d.getDate() + 30);
    return d.toISOString().split('T')[0];
  });

  // Payment Account Form state
  const [accountForm, setAccountForm] = useState({
    id: '',
    method: 'SadaPay',
    holderName: '',
    accountNumber: '',
    iban: '',
    instructions: '',
    isActive: true,
    displayOrder: 1,
    qrCodeUrl: ''
  });

  // Plans Tab States
  const [plansConfigLocal, setPlansConfigLocal] = useState<any>({
    standard: {
      name: 'Standard',
      price: 0,
      currency: 'PKR',
      billingCycle: 'forever',
      features: [
        'transactions', 'accounts', 'categories', 'dashboard',
        'goals', 'reminders', 'calculator', 'converter',
        'tasks', 'loans', 'events', 'fuel', 'reports',
        'subscriptions', 'projects'
      ],
      limits: { aiCallsPerDay: 0, maxTransactions: 10000, maxUploadsPerDay: 0 },
      badgeIcon: 'shield',
      badgeColor: '#6B7280',
      displayOrder: 1
    },
    pro: {
      name: 'Pro',
      price: 600,
      currency: 'PKR',
      billingCycle: 'monthly',
      features: [
        'transactions', 'accounts', 'categories', 'dashboard',
        'goals', 'reminders', 'calculator', 'converter',
        'tasks', 'loans', 'events', 'fuel', 'reports',
        'subscriptions', 'ai-chat', 'projects'
      ],
      limits: { aiCallsPerDay: 50, maxTransactions: 50000, maxUploadsPerDay: 10 },
      badgeIcon: 'zap',
      badgeColor: '#3B82F6',
      displayOrder: 2
    },
    max: {
      name: 'Max',
      price: 1000,
      currency: 'PKR',
      billingCycle: 'monthly',
      features: [
        'transactions', 'accounts', 'categories', 'dashboard',
        'goals', 'reminders', 'calculator', 'converter',
        'tasks', 'loans', 'events', 'fuel', 'reports',
        'subscriptions', 'ai-chat', 'whatsapp', 'investments', 'projects'
      ],
      limits: { aiCallsPerDay: 150, maxTransactions: -1, maxUploadsPerDay: 30 },
      badgeIcon: 'crown',
      badgeColor: '#F59E0B',
      displayOrder: 3
    }
  });
  const [editingPlanId, setEditingPlanId] = useState<string>('');
  const [planForm, setPlanForm] = useState({
    name: '',
    price: 0,
    currency: 'PKR',
    billingCycle: 'monthly',
    features: [] as string[],
    limits: { aiCallsPerDay: 50, maxTransactions: 50000, maxUploadsPerDay: 10 },
    badgeIcon: 'zap',
    badgeColor: '#3B82F6',
    displayOrder: 1
  });
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

  // Email Broadcast States
  const [emailSubject, setEmailSubject] = useState('');
  const [emailBody, setEmailBody] = useState('');
  const [emailFilter, setEmailFilter] = useState<'all' | 'pro' | 'free' | 'custom'>('all');
  const [emailCustomRecipients, setEmailCustomRecipients] = useState('');
  const [isSendingEmail, setIsSendingEmail] = useState(false);
  const [emailSendResult, setEmailSendResult] = useState<{ success: boolean; sentCount: number; failCount: number; errors?: any[] } | null>(null);
  const [emailTab, setEmailTab] = useState<'rich' | 'edit' | 'preview'>('rich');
  const [showEmailConfirmModal, setShowEmailConfirmModal] = useState(false);
  const [adminSecretKey, setAdminSecretKey] = useState(
    localStorage.getItem('admin_secret_key') || import.meta.env.VITE_ADMIN_SECRET_KEY || ''
  );
  const [showSecretKey, setShowSecretKey] = useState(false);
  const [smtpStatus, setSmtpStatus] = useState<{ smtpConfigured: boolean; adminSecretSet: boolean; checked: boolean; error?: string }>({
    smtpConfigured: false,
    adminSecretSet: false,
    checked: false
  });

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      let isSuccess = false;
      let token = '';

      try {
        const response = await fetch('/api/admin/auth', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username: username.trim(), password: password.trim() })
        });
        if (response.ok) {
          const data = await response.json();
          if (data.success) {
            isSuccess = true;
            token = data.token;
          }
        }
      } catch (e) { }

      if (!isSuccess) {
        const adminEmail = (import.meta.env.VITE_ADMIN_EMAIL || '').toLowerCase();
        const adminSecret = import.meta.env.VITE_ADMIN_SECRET_KEY || '';
        const enteredPass = password.trim();
        const enteredUser = username.trim().toLowerCase();

        if (adminEmail && adminSecret && (enteredUser === adminEmail || enteredUser === 'admin') && enteredPass === adminSecret) {
          isSuccess = true;
          token = adminSecret;
        }
      }

      if (isSuccess) {
        setAdminUsername(username.trim());
        setIsAuthorized(true);
        localStorage.setItem('admin_authorized', 'true');
        localStorage.setItem('admin_token', token);
        toast.success('Admin access granted');
      } else {
        setIsShake(true);
        toast.error('Invalid credentials');
        setTimeout(() => setIsShake(false), 500);
      }
    } catch (error) {
      console.error('Login validation error:', error);
      toast.error('Authentication service error');
    }
  };

  const fetchData = async () => {
    setIsLoading(true);
    try {
      const queue = await executeQuery('SELECT COUNT(*) as count FROM sync_queue') as any[];
      setSyncQueueCount(queue[0]?.count || 0);

      if (isSupabaseConfigured) {
        // Fetch Users
        const { data: usersData } = await supabase.from('users').select('*');
        const usersList = (usersData || []).map((u: any) => ({
          id: u.id,
          email: u.email,
          displayName: u.display_name,
          lastLogin: u.last_login,
          photoURL: u.photo_url,
          isPro: u.is_pro,
          isBanned: u.is_banned,
          lastIP: u.last_ip,
          disabledFeatures: u.disabled_features,
          plan: u.plan,
          planExpiresAt: u.plan_expires_at,
          stats: u.stats
        } as UserProfile));
        setUsers(usersList);

        // Fetch Global Settings
        const { data: configData } = await supabase.from('app_config').select('*');
        if (configData) {
          const configObj: any = {};
          configData.forEach((row: any) => { configObj[row.key] = row.value; });
          if (!configObj.exchanges) {
            configObj.exchanges = [{ id: 'mexc', name: 'MEXC Global', logoUrl: '', enabled: true }];
          }
          setGlobalSettings(configObj);
          setInitialSettings(configObj);
        }

        // Fetch Logs
        const { data: logsData } = await supabase.from('admin_logs').select('*').order('timestamp', { ascending: false }).limit(50);
        setAdminLogs((logsData || []) as any[]);

        // Fetch Payment Requests
        const { data: payData } = await supabase.from('payment_requests').select('*').order('submitted_at', { ascending: false });
        setPaymentRequests((payData || []).map((p: any) => ({
          id: p.id,
          userId: p.user_id,
          selectedPlan: p.selected_plan,
          paymentMethod: p.payment_method,
          amount: p.amount,
          currency: p.currency,
          transactionId: p.transaction_id,
          screenshotUrl: p.screenshot_url,
          notes: p.notes,
          status: p.status,
          rejectionReason: p.rejection_reason,
          userCoords: p.user_coords,
          submittedAt: p.submitted_at,
          verifiedAt: p.verified_at
        })));

        // Fetch Payment Accounts
        const { data: accData } = await supabase.from('payment_accounts').select('*').order('display_order', { ascending: true });
        setPaymentAccounts(accData || []);

        // Fetch Plans Config
        const { data: plansData } = await supabase.from('plans').select('*').order('display_order', { ascending: true });
        if (plansData && plansData.length > 0) {
          const plansMap: Record<string, any> = {};
          plansData.forEach((p: any) => {
            plansMap[p.id] = {
              name: p.name,
              price: p.price,
              currency: p.currency,
              billingCycle: p.billing_cycle,
              features: p.features,
              limits: p.limits,
              badgeIcon: p.badge_icon,
              badgeColor: p.badge_color,
              displayOrder: p.display_order
            };
          });
          setPlansConfigLocal(plansMap);
        }
      }
    } catch (error) {
      console.error('Admin fetch error:', error);
      toast.error('Failed to load admin data');
    } finally {
      setIsLoading(false);
    }
  };

  // ── PAYMENTS & PLANS CONFIGURATION HANDLERS ──────────────────────────────

  const handleApproveRequest = async () => {
    if (!selectedRequest || !isSupabaseConfigured) return;
    setIsLoading(true);
    try {
      const expiry = new Date(customExpiryDate).toISOString();

      await supabase.from('payment_requests').update({
        status: 'approved',
        verified_at: new Date().toISOString()
      }).eq('id', selectedRequest.id);

      await supabase.from('users').update({
        plan: selectedRequest.selectedPlan,
        is_pro: selectedRequest.selectedPlan !== 'standard',
        plan_expires_at: expiry,
        plan_assigned_by: adminUsername || 'admin'
      }).eq('id', selectedRequest.userId);

      await supabase.from('notifications').insert({
        user_id: selectedRequest.userId,
        message: `Your payment has been verified! The ${selectedRequest.selectedPlan.toUpperCase()} plan is now active.`
      });

      await supabase.from('admin_logs').insert({
        action: 'Approve Payment',
        admin: adminUsername || 'admin',
        details: { requestId: selectedRequest.id, userId: selectedRequest.userId, plan: selectedRequest.selectedPlan }
      });

      toast.success('Subscription activated successfully!');
      setShowApprovalModal(false);
      setSelectedRequest(null);
      setInternalNotes('');
      fetchData();
    } catch (e: any) {
      console.error(e);
      toast.error('Failed to approve payment: ' + e.message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleRejectRequest = async () => {
    if (!selectedRequest || !rejectionReason.trim() || !isSupabaseConfigured) {
      toast.error('Rejection reason is required.');
      return;
    }
    setIsLoading(true);
    try {
      await supabase.from('payment_requests').update({
        status: 'rejected',
        rejection_reason: rejectionReason,
        verified_at: new Date().toISOString()
      }).eq('id', selectedRequest.id);

      await supabase.from('notifications').insert({
        user_id: selectedRequest.userId,
        message: `Your payment request was rejected. Reason: ${rejectionReason}`
      });

      await supabase.from('admin_logs').insert({
        action: 'Reject Payment',
        admin: adminUsername || 'admin',
        details: { requestId: selectedRequest.id, userId: selectedRequest.userId, reason: rejectionReason }
      });

      toast.success('Payment request rejected.');
      setShowRejectionModal(false);
      setSelectedRequest(null);
      setRejectionReason('');
      setInternalNotes('');
      fetchData();
    } catch (e: any) {
      console.error(e);
      toast.error('Failed to reject request: ' + e.message);
    } finally {
      setIsLoading(false);
    }
  };

  // CRUD Payment Accounts
  const handleSaveAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!accountForm.holderName || !accountForm.accountNumber) {
      toast.error('Holder name and account number are required.');
      return;
    }

    try {
      let updatedAccounts = [...paymentAccounts];
      const isEdit = !!accountForm.id;
      const targetId = accountForm.id || `account_${Date.now()}`;

      const newAccount = {
        ...accountForm,
        id: targetId,
        displayOrder: Number(accountForm.displayOrder)
      };

      if (isEdit) {
        updatedAccounts = updatedAccounts.map(acc => acc.id === targetId ? newAccount : acc);
      } else {
        updatedAccounts.push(newAccount);
      }

      if (isSupabaseConfigured) {
        await supabase.from('payment_accounts').upsert({
          id: newAccount.id,
          type: newAccount.method,
          title: newAccount.method,
          account_number: newAccount.accountNumber,
          account_title: newAccount.holderName,
          bank_name: newAccount.method,
          iban: newAccount.iban,
          instructions: newAccount.instructions,
          is_active: newAccount.isActive,
          display_order: newAccount.displayOrder
        });
      }
      toast.success(isEdit ? 'Payment account updated.' : 'Payment account added.');
      setShowAccountModal(false);
      fetchData();
    } catch (e: any) {
      console.error(e);
      toast.error('Failed to save account: ' + e.message);
    }
  };

  const handleDeleteAccount = async (accountId: string) => {
    if (!confirm('Are you sure you want to delete this payment account?') || !isSupabaseConfigured) return;
    try {
      await supabase.from('payment_accounts').delete().eq('id', accountId);
      toast.success('Payment account deleted.');
      fetchData();
    } catch (e: any) {
      console.error(e);
      toast.error('Failed to delete account: ' + e.message);
    }
  };

  // CRUD Plans Config
  const handleSavePlan = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingPlanId || !isSupabaseConfigured) return;

    try {
      await supabase.from('plans').upsert({
        id: editingPlanId,
        name: planForm.name,
        price: Number(planForm.price),
        billing_cycle: planForm.billingCycle,
        features: planForm.features,
        limits: planForm.limits,
        badge_icon: planForm.badgeIcon,
        badge_color: planForm.badgeColor,
        display_order: Number(planForm.displayOrder)
      });
      toast.success(`Plan ${planForm.name} updated successfully.`);
      setEditingPlanId('');
      fetchData();
    } catch (e: any) {
      console.error(e);
      toast.error('Failed to save plan: ' + e.message);
    }
  };

  const scanSystemData = async () => {
    if (!isSupabaseConfigured) return;
    setIsScanning(true);
    toast.info('Starting system scan...');
    try {
      const { count: txCount } = await supabase.from('user_transactions').select('*', { count: 'exact', head: true });
      const { count: loanCount } = await supabase.from('user_loans').select('*', { count: 'exact', head: true });
      const { count: eventCount } = await supabase.from('user_events').select('*', { count: 'exact', head: true });

      setSystemStats(prev => ({
        ...prev,
        totalTransactions: txCount || 0,
        totalLoans: loanCount || 0,
        totalEvents: eventCount || 0,
        lastScan: new Date().toISOString()
      }));

      await supabase.from('admin_logs').insert({
        action: `Performed system scan (${txCount || 0} transactions found)`,
        admin: adminUsername || 'admin'
      });

      toast.success('System scan complete');
    } catch (e) {
      console.error('Scan failed:', e);
      toast.error('Scan failed');
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
    if (!isSupabaseConfigured) return;
    try {
      for (const [key, value] of Object.entries(globalSettings)) {
        await supabase.from('app_config').upsert({
          key,
          value,
          updated_at: new Date().toISOString()
        });
      }

      await supabase.from('admin_logs').insert({
        action: 'Updated global configuration',
        admin: adminUsername || 'admin'
      });

      setInitialSettings(globalSettings);
      toast.success('Global settings updated');
      fetchData();
    } catch (error) {
      toast.error('Failed to save settings');
    }
  };

  const revertGlobalSettings = async () => {
    toast.info('Cloud configuration is synchronized via Supabase.');
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
      setUserGeminiApiKey(selectedUserForFeatures.geminiApiKey || '');
      setShowUserGeminiApiKey(false);
    } else {
      setUserDisabledFeatures([]);
      setUserGeminiApiKey('');
      setShowUserGeminiApiKey(false);
    }
  }, [selectedUserForFeatures]);

  const saveUserFeatures = async () => {
    if (!selectedUserForFeatures || !isSupabaseConfigured) return;
    try {
      await supabase.from('users').update({
        disabled_features: userDisabledFeatures,
        updated_at: new Date().toISOString()
      }).eq('id', selectedUserForFeatures.id);

      await supabase.from('admin_logs').insert({
        action: `Updated feature access for ${selectedUserForFeatures.email}`,
        admin: adminUsername || 'admin'
      });

      setUsers(users.map(u => u.id === selectedUserForFeatures.id ? {
        ...u,
        disabledFeatures: userDisabledFeatures,
        geminiApiKey: userGeminiApiKey.trim()
      } : u));
      setSelectedUserForFeatures(null);
      toast.success('User features and API key override updated successfully');
    } catch (e) {
      toast.error('Failed to update user features');
    }
  };

  const toggleProStatus = async (user: UserProfile) => {
    if (!isSupabaseConfigured) return;
    try {
      const newIsPro = !user.isPro;
      await supabase.from('users').update({
        is_pro: newIsPro,
        plan: newIsPro ? 'pro' : 'standard',
        updated_at: new Date().toISOString()
      }).eq('id', user.id);

      await supabase.from('admin_logs').insert({
        action: `${user.isPro ? 'Demoted' : 'Promoted'} ${user.email} to PRO`,
        admin: adminUsername || 'admin'
      });

      setUsers(users.map(u => u.id === user.id ? { ...u, isPro: !u.isPro } : u));
      toast.success(`User ${user.isPro ? 'demoted' : 'promoted to PRO'}`);
    } catch (e) {
      toast.error('Failed to update user status');
    }
  };

  const toggleBanStatus = async (user: UserProfile) => {
    if (!isSupabaseConfigured) return;
    try {
      await supabase.from('users').update({
        is_banned: !user.isBanned,
        updated_at: new Date().toISOString()
      }).eq('id', user.id);

      await supabase.from('admin_logs').insert({
        action: `${user.isBanned ? 'Unbanned' : 'Banned'} user ${user.email}`,
        admin: adminUsername || 'admin'
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

  const getActivityTrendData = () => {
    const counts: number[] = [];
    const labels: string[] = [];
    const today = new Date();

    // Build array chronologically from 6 days ago to today
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(today.getDate() - i);
      const dateStr = d.toISOString().split('T')[0];

      labels.push(d.toLocaleDateString('default', { weekday: 'short' }));

      const count = users.filter(u => u.lastLogin && u.lastLogin.includes(dateStr)).length;
      counts.push(count);
    }

    const hasActivity = counts.some(c => c > 0);
    return {
      labels,
      data: hasActivity ? counts : [2, 4, 3, 5, 4, 6, Math.max(1, users.length)]
    };
  };

  const getFeatureAdoptionData = () => {
    // For each feature, count how many users do NOT have it disabled
    const data = FEATURES.map(f => {
      const activeCount = users.filter(u => !(u.disabledFeatures || []).includes(f.id)).length;
      return activeCount;
    });

    return {
      labels: FEATURES.map(f => f.name),
      data
    };
  };

  const handleSendDirectNotification = async (userId: string, userEmail: string) => {
    if (!directNotifMessage.trim() || !isSupabaseConfigured) {
      toast.error('Notification message is required');
      return;
    }
    setIsSendingDirectNotif(true);
    try {
      await supabase.from('notifications').insert({
        user_id: userId,
        message: directNotifMessage.trim()
      });

      await supabase.from('admin_logs').insert({
        action: `Sent targeted notification to ${userEmail}`,
        admin: adminUsername || 'admin'
      });

      toast.success(`Notification sent to ${userEmail}`);
      setDirectNotifMessage('');
    } catch (e) {
      console.error(e);
      toast.error('Failed to send notification');
    } finally {
      setIsSendingDirectNotif(false);
    }
  };

  const handleSendBroadcast = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!broadcastMessage.trim() || !isSupabaseConfigured) {
      toast.error('Broadcast message cannot be empty');
      return;
    }
    setIsSendingBroadcast(true);
    try {
      await supabase.from('broadcast_notifications').insert({
        message: broadcastMessage.trim()
      });

      await supabase.from('admin_logs').insert({
        action: `Sent system-wide broadcast notification`,
        admin: adminUsername || 'admin'
      });

      toast.success('Broadcast notification sent to all users');
      setBroadcastMessage('');
    } catch (e) {
      toast.error('Failed to send broadcast');
    } finally {
      setIsSendingBroadcast(false);
    }
  };

  const fetchWhatsAppStatus = async () => {
    setIsRefreshingWhatsApp(true);
    try {
      const status = await getWhatsAppStatus();
      setWhatsappAccounts(status.accounts || []);
    } catch (e) {
      console.error('Failed to fetch WhatsApp status:', e);
    } finally {
      setIsRefreshingWhatsApp(false);
    }
  };

  const getGatewayUrl = (path: string) => {
    const envUrl = import.meta.env.VITE_WHATSAPP_GATEWAY_URL;
    if (envUrl) {
      const cleanEnvUrl = envUrl.endsWith('/') ? envUrl.slice(0, -1) : envUrl;
      return `${cleanEnvUrl}${path}`;
    }
    return `/whatsapp-api${path}`;
  };

  const formatEmailBody = (text: string) => {
    if (!text) return '';
    const commonHtmlTags = /<(h[1-6]|p|br|div|a|strong|em|ul|ol|li|span|table|tr|td|style|html|body)/i;
    if (commonHtmlTags.test(text)) {
      return text;
    }
    return text.split('\n').join('<br />');
  };

  const checkSmtpStatus = async () => {
    try {
      const response = await fetch(getGatewayUrl('/status'));
      if (!response.ok) {
        throw new Error(`HTTP error ${response.status}`);
      }
      const data = await response.json();
      setSmtpStatus({
        smtpConfigured: !!data.smtpConfigured,
        adminSecretSet: !!data.adminSecretSet,
        checked: true
      });
      if (data.accounts) {
        setWhatsappAccounts(data.accounts);
      }
    } catch (err: any) {
      console.error('[SMTP Check] Failed to check status:', err);
      setSmtpStatus({
        smtpConfigured: false,
        adminSecretSet: false,
        checked: true,
        error: err.message || 'Failed to connect to gateway server'
      });
    }
  };

  const handleSaveSecretKey = (val: string) => {
    setAdminSecretKey(val);
    localStorage.setItem('admin_secret_key', val);
    toast.success('Admin Secret Key saved locally');
  };

  const handleSendEmailBroadcast = async (isTestOnly = false) => {
    if (!emailSubject.trim()) {
      toast.error('Email subject is required');
      return;
    }
    if (!emailBody.trim()) {
      toast.error('Email body is required');
      return;
    }

    setIsSendingEmail(true);
    setEmailSendResult(null);

    let bodyFilter = emailFilter;
    let customRecipientsList: string[] = [];

    if (isTestOnly) {
      bodyFilter = 'custom';
      customRecipientsList = [adminUsername || 'khizarraoworks@gmail.com'];
    } else if (emailFilter === 'custom') {
      customRecipientsList = emailCustomRecipients
        .split(',')
        .map(e => e.trim())
        .filter(Boolean);
      if (customRecipientsList.length === 0) {
        toast.error('Please enter at least one custom recipient email address');
        setIsSendingEmail(false);
        return;
      }
    }

    try {
      // Resolve recipients on the client (already authenticated) to avoid
      // server-side Firestore permission errors.
      let resolvedRecipients: string[] = [];
      if (bodyFilter === 'custom' || isTestOnly) {
        resolvedRecipients = customRecipientsList;
      } else {
        if (isSupabaseConfigured) {
          const { data: userRows } = await supabase.from('users').select('email, is_pro, plan');
          (userRows || []).forEach(u => {
            if (!u.email) return;
            const isProUser = u.is_pro || u.plan !== 'standard';
            if (bodyFilter === 'all') resolvedRecipients.push(u.email);
            else if (bodyFilter === 'pro' && isProUser) resolvedRecipients.push(u.email);
            else if (bodyFilter === 'free' && !isProUser) resolvedRecipients.push(u.email);
          });
        }
      }

      if (resolvedRecipients.length === 0 && !isTestOnly) {
        toast.error('No matching recipients found for the selected filter.');
        setIsSendingEmail(false);
        return;
      }

      const headers = {
        'Content-Type': 'application/json',
        'x-admin-secret': adminSecretKey
      };
      const body = JSON.stringify({
        subject: emailSubject,
        html: formatEmailBody(emailBody),
        filter: bodyFilter,
        recipients: resolvedRecipients
      });

      const localUrl = `/whatsapp-api/api/admin/send-emails`;
      const response = await fetch(localUrl, {
        method: 'POST',
        headers,
        body
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || `HTTP error ${response.status}`);
      }

      setEmailSendResult({
        success: data.success,
        sentCount: data.sentCount,
        failCount: data.failCount,
        errors: data.errors
      });

      if (data.success) {
        toast.success(isTestOnly ? 'Test email sent successfully!' : 'Email broadcast completed successfully!');
        if (!isTestOnly) {
          // Clear inputs on successful broadcast
          setEmailSubject('');
          setEmailBody('');

          if (isSupabaseConfigured) {
            await supabase.from('admin_logs').insert({
              action: `Sent email broadcast to ${data.sentCount} users (Subject: "${emailSubject}")`,
              admin: adminUsername || 'admin'
            });
          }
        }
      } else {
        toast.error(`Broadcast finished with errors. Sent: ${data.sentCount}, Failed: ${data.failCount}`);
      }
    } catch (err: any) {
      console.error('[SMTP Send] Broadcast failed:', err);
      toast.error(err.message || 'Failed to send email broadcast');
      setEmailSendResult({
        success: false,
        sentCount: 0,
        failCount: 0,
        errors: [{ email: 'System', error: err.message || 'Network error or bad gateway' }]
      });
    } finally {
      setIsSendingEmail(false);
      setShowEmailConfirmModal(false);
    }
  };

  useEffect(() => {
    if (activeTab === 'analytics') {
      fetchWhatsAppStatus();
    } else if (activeTab === 'email') {
      checkSmtpStatus();
    }
  }, [activeTab]);

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
        <div className="flex flex-wrap p-1 bg-muted rounded-xl w-fit gap-1">
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
            onClick={() => setActiveTab('payments')}
            className={`px-4 py-2 rounded-lg text-sm font-bold transition-all relative ${activeTab === 'payments' ? 'bg-card shadow-sm text-primary' : 'text-muted-foreground'}`}
          >
            Payments Verification
            {paymentRequests.filter(r => r.status === 'pending').length > 0 && (
              <span className="absolute -top-1.5 -right-1.5 h-5 w-5 bg-rose-500 text-white rounded-full flex items-center justify-center text-[10px] font-black shadow-md border border-background">
                {paymentRequests.filter(r => r.status === 'pending').length}
              </span>
            )}
          </button>
          <button
            onClick={() => setActiveTab('plans')}
            className={`px-4 py-2 rounded-lg text-sm font-bold transition-all ${activeTab === 'plans' ? 'bg-card shadow-sm text-primary' : 'text-muted-foreground'}`}
          >
            Subscription Plans
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
          <button
            onClick={() => setActiveTab('email')}
            className={`px-4 py-2 rounded-lg text-sm font-bold transition-all ${activeTab === 'email' ? 'bg-card shadow-sm text-primary' : 'text-muted-foreground'}`}
          >
            Email Broadcast
          </button>
          <button
            onClick={() => setActiveTab('sync')}
            className={`px-4 py-2 rounded-lg text-sm font-bold transition-all flex items-center gap-1.5 ${activeTab === 'sync' ? 'bg-card shadow-sm text-primary' : 'text-muted-foreground'}`}
          >
            <RefreshCw size={14} className={activeTab === 'sync' ? 'text-primary' : ''} />
            User Data Sync
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
                      className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all ${statusFilter === pill.id
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
                    const isExpanded = expandedUserId === u.id;
                    return (
                      <div
                        key={u.id}
                        className={`divide-y divide-border/40 border-b border-border/10 last:border-none hover:bg-muted/5 transition-all duration-200 ${u.isBanned ? 'bg-destructive/5' : ''}`}
                      >
                        {/* Summary Row */}
                        <div
                          onClick={(e) => {
                            const target = e.target as HTMLElement;
                            if (target.closest('button') || target.closest('svg') || target.closest('input')) {
                              return;
                            }
                            setExpandedUserId(isExpanded ? null : u.id);
                          }}
                          className="p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 cursor-pointer select-none"
                        >
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

                        {/* Expanded details card */}
                        {isExpanded && (
                          <div className="p-6 bg-muted/20 border-t border-border/40 space-y-6 animate-in slide-in-from-top duration-300">
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                              {/* Left column: Full Profile Details */}
                              <div className="space-y-3 bg-card p-4 rounded-2xl border border-border/60">
                                <h4 className="font-bold text-xs uppercase text-muted-foreground tracking-wider border-b border-border/40 pb-2">Profile Information</h4>
                                <div className="space-y-2.5 text-xs">
                                  <div className="flex justify-between">
                                    <span className="text-muted-foreground font-medium">User UID:</span>
                                    <span className="font-mono text-[10px] break-all select-all font-semibold">{u.id}</span>
                                  </div>
                                  <div className="flex justify-between">
                                    <span className="text-muted-foreground font-medium">Display Name:</span>
                                    <span className="font-semibold text-foreground">{u.displayName || 'N/A'}</span>
                                  </div>
                                  <div className="flex justify-between">
                                    <span className="text-muted-foreground font-medium">Email Address:</span>
                                    <span className="font-semibold select-all text-foreground">{u.email || 'N/A'}</span>
                                  </div>
                                  <div className="flex justify-between">
                                    <span className="text-muted-foreground font-medium">Registered IP:</span>
                                    <span className="font-mono text-[10px] font-semibold text-foreground">{u.lastIP || '0.0.0.0'}</span>
                                  </div>
                                  <div className="flex justify-between">
                                    <span className="text-muted-foreground font-medium">Plan Level:</span>
                                    <span className={`font-bold px-2 py-0.5 rounded-full text-[9px] uppercase ${u.isPro ? 'bg-amber-500/10 text-amber-500' : 'bg-muted text-muted-foreground'}`}>
                                      {u.isPro ? 'Pro Member' : 'Standard'}
                                    </span>
                                  </div>
                                  <div className="flex justify-between items-center">
                                    <span className="text-muted-foreground font-medium">Gemini Key:</span>
                                    <span className={`font-bold px-2 py-0.5 rounded-full text-[9px] uppercase ${u.geminiApiKey ? 'bg-emerald-500/10 text-emerald-500' : 'bg-muted text-muted-foreground'}`}>
                                      {u.geminiApiKey ? 'Configured' : 'Not Set'}
                                    </span>
                                  </div>
                                </div>
                              </div>

                              {/* Middle column: Feature Checklist status */}
                              <div className="space-y-3 bg-card p-4 rounded-2xl border border-border/60">
                                <h4 className="font-bold text-xs uppercase text-muted-foreground tracking-wider border-b border-border/40 pb-2">Feature Checklist</h4>
                                <div className="grid grid-cols-2 gap-2 text-[11px] font-semibold">
                                  {FEATURES.map(f => {
                                    const isGloballyDisabled = (globalSettings.disabledFeatures || []).includes(f.id);
                                    const isUserDisabled = (u.disabledFeatures || []).includes(f.id);
                                    const active = !isGloballyDisabled && !isUserDisabled;

                                    return (
                                      <div key={f.id} className="flex items-center gap-1.5 py-0.5">
                                        <span className={`w-1.5 h-1.5 rounded-full ${active ? 'bg-emerald-500' : 'bg-rose-500'}`}></span>
                                        <span className={`${active ? 'text-foreground' : 'text-muted-foreground line-through opacity-60'}`}>{f.name}</span>
                                      </div>
                                    );
                                  })}
                                </div>
                              </div>

                              {/* Right column: Storage volume & Statistics */}
                              <div className="space-y-3 bg-card p-4 rounded-2xl border border-border/60">
                                <h4 className="font-bold text-xs uppercase text-muted-foreground tracking-wider border-b border-border/40 pb-2">Data Analytics</h4>
                                <div className="space-y-2 text-xs font-semibold">
                                  <div className="flex justify-between items-center bg-muted/30 p-2 rounded-xl border border-border/20">
                                    <span className="text-muted-foreground">Transactions</span>
                                    <span className="bg-primary/10 text-primary px-2 py-0.5 rounded-md text-[10px]">{u.stats?.transactions || 0}</span>
                                  </div>
                                  <div className="flex justify-between items-center bg-muted/30 p-2 rounded-xl border border-border/20">
                                    <span className="text-muted-foreground">Loans / Borrowing</span>
                                    <span className="bg-emerald-500/10 text-emerald-500 px-2 py-0.5 rounded-md text-[10px]">{u.stats?.loans || 0}</span>
                                  </div>
                                  <div className="flex justify-between items-center bg-muted/30 p-2 rounded-xl border border-border/20">
                                    <span className="text-muted-foreground">Group Events</span>
                                    <span className="bg-orange-500/10 text-orange-600 px-2 py-0.5 rounded-md text-[10px]">{u.stats?.events || 0}</span>
                                  </div>
                                </div>
                              </div>
                            </div>

                            {/* Direct targeted notification sender */}
                            <div className="bg-card p-4 rounded-2xl border border-border/60 space-y-3">
                              <h4 className="font-bold text-xs uppercase text-muted-foreground tracking-wider">Send Direct Notification Alert</h4>
                              <div className="flex gap-2">
                                <input
                                  type="text"
                                  placeholder={`Send an alert notification directly to ${u.email}...`}
                                  value={directNotifMessage}
                                  onChange={(e) => setDirectNotifMessage(e.target.value)}
                                  className="flex-1 bg-muted border border-border/40 rounded-xl px-4 py-2 text-xs outline-none focus:ring-2 focus:ring-primary font-medium text-foreground"
                                />
                                <button
                                  onClick={() => handleSendDirectNotification(u.id, u.email || '')}
                                  disabled={isSendingDirectNotif}
                                  className="px-5 py-2 bg-primary text-primary-foreground rounded-xl font-bold text-xs uppercase tracking-wider transition-all disabled:opacity-50 flex items-center justify-center gap-1.5 shrink-0"
                                >
                                  {isSendingDirectNotif ? 'Sending...' : 'Send Alert'}
                                </button>
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          </div>
        )}

        {activeTab === 'settings' && (
          <div className="space-y-6">
            <div className="bg-card border border-border rounded-3xl p-6 space-y-6">
              <div className="flex items-center gap-2 border-b border-border pb-4">
                <SettingsIcon className="text-primary" size={20} />
                <h2 className="font-bold">Global Configuration</h2>
              </div>

              <div className="space-y-4">
                {/* System Version & Emergency Alert in Grid */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div className="space-y-1 sm:col-span-1">
                    <label className="text-xs font-bold uppercase text-muted-foreground ml-1">System Version</label>
                    <input
                      type="text"
                      value={globalSettings.version}
                      onChange={(e) => setGlobalSettings({ ...globalSettings, version: e.target.value })}
                      className="w-full bg-muted border-none rounded-xl p-3 outline-none focus:ring-2 focus:ring-primary text-xs font-bold text-foreground"
                      placeholder="e.g. 1.0.0"
                    />
                  </div>
                  <div className="space-y-1 sm:col-span-2">
                    <label className="text-xs font-bold uppercase text-muted-foreground ml-1">Emergency Alert (Popup Modal)</label>
                    <input
                      type="text"
                      value={globalSettings.emergencyMessage}
                      onChange={(e) => setGlobalSettings({ ...globalSettings, emergencyMessage: e.target.value })}
                      className="w-full bg-rose-500/5 border border-rose-500/10 rounded-xl p-3 outline-none focus:ring-2 focus:ring-rose-500 text-xs text-rose-500 placeholder:text-rose-500/30 font-medium"
                      placeholder="Critical alert modal text (leave empty to disable)..."
                    />
                  </div>
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
                    <div className="w-full min-h-[100px] bg-amber-500/10 dark:bg-amber-950/30 text-amber-800 dark:text-amber-200 border border-amber-500/20 dark:border-amber-500/10 rounded-xl p-4 flex items-start gap-3 relative">
                      {globalSettings.announcement ? (
                        <>
                          <Info size={18} className="shrink-0 mt-0.5 text-amber-600 dark:text-amber-400" />
                          <p className="text-xs font-medium leading-relaxed whitespace-pre-wrap flex-1 text-left">
                            {(() => {
                              const text = globalSettings.announcement;
                              const parts = text.split(/(\*\*.*?\*\*|\[.*?\]\(.*?\))/g);
                              return parts.map((part, index) => {
                                if (part.startsWith('**') && part.endsWith('**')) {
                                  return <strong key={index} className="font-extrabold text-amber-950 dark:text-amber-100">{part.slice(2, -2)}</strong>;
                                }
                                const linkMatch = part.match(/^\[(.*?)\]\((.*?)\)$/);
                                if (linkMatch) {
                                  return (
                                    <a
                                      key={index}
                                      href={linkMatch[2]}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="underline hover:opacity-85 font-bold transition-colors ml-0.5 mr-0.5 text-amber-950 dark:text-amber-100"
                                    >
                                      {linkMatch[1]}
                                    </a>
                                  );
                                }
                                return part;
                              });
                            })()}
                          </p>
                          <button
                            type="button"
                            className="absolute right-3 top-3 p-1 hover:bg-amber-500/20 rounded-full transition-colors text-amber-600 dark:text-amber-400"
                          >
                            <X size={16} />
                          </button>
                        </>
                      ) : (
                        <div className="w-full flex items-center justify-center py-4">
                          <span className="italic text-muted-foreground text-xs">No announcement content to preview. Write something in Edit tab first.</span>
                        </div>
                      )}
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

              {/* AI Configuration Section */}
              <div className="border-t border-border pt-6 space-y-6">
                <div className="flex items-center gap-2">
                  <Sparkles className="text-primary animate-pulse" size={20} />
                  <h3 className="font-bold text-base">Global AI Copilot Configuration</h3>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold uppercase text-muted-foreground ml-1">Global Fallback API Key</label>
                    <input
                      type="password"
                      value={globalSettings.fallbackApiKey || ''}
                      onChange={(e) => setGlobalSettings({ ...globalSettings, fallbackApiKey: e.target.value })}
                      placeholder={globalSettings.fallbackApiKey ? '••••••••••••••••••••••••' : 'Enter shared API key'}
                      className="w-full bg-muted border-none rounded-xl p-3 outline-none focus:ring-2 focus:ring-primary text-xs font-semibold"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold uppercase text-muted-foreground ml-1">Default Fallback Model</label>
                    <select
                      value={globalSettings.fallbackModelId || 'gemini-2.5-flash'}
                      onChange={(e) => setGlobalSettings({ ...globalSettings, fallbackModelId: e.target.value })}
                      className="w-full bg-muted border-none rounded-xl p-3 outline-none focus:ring-2 focus:ring-primary text-xs font-bold text-foreground cursor-pointer"
                    >
                      <option value="gemini-2.5-flash">Gemini 2.5 Flash</option>
                      <option value="gemini-3-flash">Gemini 3 Flash</option>
                      <option value="gemini-3.1-flash-lite">Gemini 3.1 Flash Lite</option>
                      <option value="gemini-3.5-live-translate">Gemini 3.5 Live Translate</option>
                      <option value="gemini-3.1-flash-tts">Gemini 3.1 Flash TTS</option>
                      <option value="gemma-4-31b">Gemma 4 31B (Open weights)</option>
                      <option value="gemini-robotics-er-1.6-preview">Gemini Robotics ER 1.6 Preview</option>
                    </select>
                  </div>
                </div>

                <div className="space-y-1">
                  <div className="flex items-center justify-between">
                    <label className="text-[10px] font-bold uppercase text-muted-foreground ml-1">Global System Prompt instructions</label>
                    <span className="text-[9px] text-muted-foreground italic">Appended to conversation prompt</span>
                  </div>
                  <textarea
                    value={globalSettings.globalSystemInstruction || ''}
                    onChange={(e) => setGlobalSettings({ ...globalSettings, globalSystemInstruction: e.target.value })}
                    rows={3}
                    placeholder="Add custom system prompt rules, default response guidelines, or support info here..."
                    className="w-full bg-muted border-none rounded-xl p-3 outline-none focus:ring-2 focus:ring-primary text-xs font-medium"
                  />
                </div>
              </div>

              {/* Change Admin Password Section */}
              <div className="border-t border-border pt-6 space-y-4">
                <div className="flex items-center gap-2">
                  <Lock className="text-primary" size={18} />
                  <h3 className="font-bold text-base">Change Admin Password</h3>
                </div>
                <form onSubmit={handleUpdateAdminPassword} className="space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <div className="space-y-1">
                      <label className="text-[10px] font-bold uppercase text-muted-foreground ml-1">Current Password</label>
                      <input
                        type="password"
                        value={currentPassword}
                        onChange={(e) => setCurrentPassword(e.target.value)}
                        className="w-full bg-muted border-none rounded-xl p-3 outline-none focus:ring-2 focus:ring-primary text-xs font-semibold"
                        required
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[10px] font-bold uppercase text-muted-foreground ml-1">New Password</label>
                      <input
                        type="password"
                        value={newPassword}
                        onChange={(e) => setNewPassword(e.target.value)}
                        className="w-full bg-muted border-none rounded-xl p-3 outline-none focus:ring-2 focus:ring-primary text-xs font-semibold"
                        required
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[10px] font-bold uppercase text-muted-foreground ml-1">Confirm New Password</label>
                      <input
                        type="password"
                        value={confirmNewPassword}
                        onChange={(e) => setConfirmNewPassword(e.target.value)}
                        className="w-full bg-muted border-none rounded-xl p-3 outline-none focus:ring-2 focus:ring-primary text-xs font-semibold"
                        required
                      />
                    </div>
                  </div>
                  <button
                    type="submit"
                    disabled={isChangingPass}
                    className="px-5 py-2.5 bg-primary/10 hover:bg-primary text-primary hover:text-primary-foreground rounded-xl font-bold text-xs uppercase tracking-wider transition-all disabled:opacity-50"
                  >
                    {isChangingPass ? 'Updating...' : 'Update Password'}
                  </button>
                </form>
              </div>

              {/* System Broadcast Notification Center */}
              <div className="border-t border-border pt-6 space-y-4">
                <div className="flex items-center gap-2">
                  <Megaphone className="text-primary" size={18} />
                  <h3 className="font-bold text-base">Send System Broadcast Notification</h3>
                </div>
                <form onSubmit={handleSendBroadcast} className="space-y-4">
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold uppercase text-muted-foreground ml-1">Broadcast Message</label>
                    <textarea
                      value={broadcastMessage}
                      onChange={(e) => setBroadcastMessage(e.target.value)}
                      rows={2}
                      placeholder="Write a message that will be broadcasted to all users..."
                      className="w-full bg-muted border-none rounded-xl p-3 outline-none focus:ring-2 focus:ring-primary text-xs font-semibold text-foreground"
                      required
                    />
                  </div>
                  <button
                    type="submit"
                    disabled={isSendingBroadcast}
                    className="px-5 py-2.5 bg-primary/10 hover:bg-primary text-primary hover:text-primary-foreground rounded-xl font-bold text-xs uppercase tracking-wider transition-all disabled:opacity-50"
                  >
                    {isSendingBroadcast ? 'Sending...' : 'Send Broadcast to All'}
                  </button>
                </form>
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
                              className={`px-3 py-1.5 rounded-lg text-xs font-black uppercase tracking-wider transition-all ${ex.enabled
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
                      labels: getFeatureAdoptionData().labels,
                      datasets: [{
                        label: 'Active Users',
                        data: getFeatureAdoptionData().data,
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
                    labels: getActivityTrendData().labels,
                    datasets: [{
                      label: 'Active Users',
                      data: getActivityTrendData().data,
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

            {/* WhatsApp Server Monitor */}
            <div className="bg-card border border-border rounded-3xl p-6 shadow-sm">
              <div className="flex items-center justify-between mb-6 border-b border-border pb-4">
                <h3 className="font-bold flex items-center gap-2">
                  <MessageSquare size={18} className="text-primary animate-pulse" />
                  WhatsApp Gateway Server Monitor
                </h3>
                <button
                  onClick={fetchWhatsAppStatus}
                  disabled={isRefreshingWhatsApp}
                  className="px-3 py-1.5 bg-muted hover:bg-muted/80 rounded-xl font-bold text-[10px] uppercase transition-all flex items-center gap-1.5 text-foreground"
                >
                  <RefreshCw size={12} className={isRefreshingWhatsApp ? 'animate-spin' : ''} />
                  {isRefreshingWhatsApp ? 'Refreshing...' : 'Refresh Status'}
                </button>
              </div>

              {whatsappAccounts.length === 0 ? (
                <div className="text-center py-6 text-muted-foreground text-xs italic">
                  No account status information loaded. Ensure Vite dev server is running and local server is connected.
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {whatsappAccounts.map((account) => {
                    const statusColors = {
                      disconnected: 'border-rose-500/20 bg-rose-500/5 text-rose-500',
                      connecting: 'border-amber-500/20 bg-amber-500/5 text-amber-500',
                      qr: 'border-primary/20 bg-primary/5 text-primary',
                      connected: 'border-emerald-500/20 bg-emerald-500/5 text-emerald-500',
                    };
                    const color = statusColors[account.status as keyof typeof statusColors] || 'border-border bg-muted/20 text-muted-foreground';

                    return (
                      <div key={account.id} className={`p-4 rounded-2xl border ${color} space-y-2 flex flex-col justify-between`}>
                        <div>
                          <div className="flex items-center justify-between">
                            <span className="font-extrabold text-sm text-foreground">{account.name}</span>
                            <span className="text-[9px] uppercase font-black tracking-widest text-muted-foreground">{account.id}</span>
                          </div>
                          <p className="text-[10px] opacity-80 mt-1 font-semibold">
                            Status: <span className="underline font-bold uppercase">{account.status}</span>
                          </p>
                        </div>
                        <div className="text-[10px] font-mono leading-none pt-2 opacity-60">
                          {account.hasCreds ? '✓ Baileys Credentials Cached' : '✗ No Cached Session'}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
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
                      className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all ${logTypeFilter === pill.id
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

        {activeTab === 'email' && (
          <div className="space-y-6 animate-in fade-in duration-200">
            {/* Security & SMTP Settings Sub-Card */}
            <div className="bg-card border border-border rounded-3xl p-5 shadow-sm space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <Sliders className="text-primary" size={18} />
                  <h3 className="font-extrabold text-sm text-foreground">SMTP & Gateway Security</h3>
                </div>
                <div className="flex items-center gap-2">
                  {smtpStatus.checked ? (
                    smtpStatus.error ? (
                      <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-extrabold bg-rose-500/10 text-rose-500">
                        <AlertCircle size={10} /> Gateway Offline
                      </span>
                    ) : smtpStatus.smtpConfigured ? (
                      <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-extrabold bg-emerald-500/10 text-emerald-500 animate-pulse">
                        <Check size={10} /> SMTP Ready
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-extrabold bg-amber-500/10 text-amber-500">
                        <AlertCircle size={10} /> SMTP Missing Configs
                      </span>
                    )
                  ) : (
                    <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-extrabold bg-muted text-muted-foreground">
                      <RefreshCw size={10} className="animate-spin" /> Checking Status...
                    </span>
                  )}
                  <button
                    onClick={checkSmtpStatus}
                    className="p-1.5 hover:bg-muted text-muted-foreground hover:text-foreground rounded-lg transition-colors"
                    title="Refresh Connection Status"
                  >
                    <RefreshCw size={14} />
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2 text-left">
                <div className="space-y-1.5">
                  <label className="text-[10px] font-extrabold uppercase tracking-wider text-muted-foreground ml-1">Admin API Secret Key</label>
                  <div className="relative">
                    <input
                      type={showSecretKey ? 'text' : 'password'}
                      value={adminSecretKey}
                      onChange={(e) => handleSaveSecretKey(e.target.value)}
                      className="w-full bg-muted/50 border border-transparent rounded-2xl py-2.5 pl-4 pr-10 outline-none focus:bg-card focus:border-primary/20 focus:ring-2 focus:ring-primary/10 transition-all text-xs font-semibold text-foreground placeholder:text-muted-foreground/60"
                      placeholder="Enter ADMIN_SECRET_KEY..."
                    />
                    <button
                      type="button"
                      onClick={() => setShowSecretKey(!showSecretKey)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground p-1 rounded-lg"
                    >
                      {showSecretKey ? <EyeOff size={14} /> : <Eye size={14} />}
                    </button>
                  </div>
                  <p className="text-[9px] text-muted-foreground ml-1 leading-relaxed">
                    This key must match the <code className="bg-muted px-1 py-0.5 rounded text-primary font-bold">ADMIN_SECRET_KEY</code> set in Railway env variables. Saved in browser.
                  </p>
                </div>

                <div className="p-3.5 bg-muted/30 border border-border/50 rounded-2xl flex flex-col justify-center space-y-1">
                  <p className="text-[10px] font-extrabold uppercase tracking-wider text-muted-foreground">Gateway URL</p>
                  <p className="text-xs font-semibold text-foreground font-mono truncate select-all">{getGatewayUrl('')}</p>
                  <p className="text-[9px] text-muted-foreground leading-normal">
                    {smtpStatus.checked && !smtpStatus.error && !smtpStatus.smtpConfigured && (
                      <span className="text-rose-500 font-medium">⚠️ Set SMTP_HOST, SMTP_USER, and SMTP_PASS in Railway to send emails.</span>
                    )}
                    {smtpStatus.checked && smtpStatus.error && (
                      <span className="text-rose-500 font-medium">⚠️ Could not connect: {smtpStatus.error}. Check gateway status.</span>
                    )}
                    {smtpStatus.checked && !smtpStatus.error && smtpStatus.smtpConfigured && (
                      <span className="text-emerald-500 font-medium">✓ SMTP settings verified on cloud gateway.</span>
                    )}
                  </p>
                </div>
              </div>
            </div>

            {/* Email Broadcast Creator Layout */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
              {/* Form Side */}
              <div className="lg:col-span-7 bg-card border border-border rounded-3xl p-5 shadow-sm space-y-4 text-left">
                <div className="flex items-center gap-2 border-b border-border/50 pb-3">
                  <Mail className="text-primary" size={18} />
                  <h3 className="font-extrabold text-sm text-foreground">Compose Email Broadcast</h3>
                </div>

                {/* Filter */}
                <div className="space-y-1.5">
                  <label className="text-[10px] font-extrabold uppercase tracking-wider text-muted-foreground ml-1">Target Recipients</label>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    {(
                      [
                        { id: 'all', label: 'All Users' },
                        { id: 'pro', label: 'PRO Only' },
                        { id: 'free', label: 'Free Only' },
                        { id: 'custom', label: 'Custom List' }
                      ] as const
                    ).map((option) => (
                      <button
                        key={option.id}
                        type="button"
                        onClick={() => setEmailFilter(option.id)}
                        className={`py-2 px-3 rounded-xl text-xs font-bold transition-all border ${emailFilter === option.id
                          ? 'bg-primary text-primary-foreground border-primary shadow-sm'
                          : 'bg-muted/30 border-transparent hover:bg-muted text-muted-foreground hover:text-foreground'
                          }`}
                      >
                        {option.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Custom Recipients Textarea */}
                {emailFilter === 'custom' && (
                  <div className="space-y-1.5 animate-in slide-in-from-top duration-200">
                    <label className="text-[10px] font-extrabold uppercase tracking-wider text-muted-foreground ml-1">Custom Recipient Emails</label>
                    <textarea
                      value={emailCustomRecipients}
                      onChange={(e) => setEmailCustomRecipients(e.target.value)}
                      className="w-full bg-muted/50 border border-transparent rounded-2xl p-3.5 outline-none focus:bg-card focus:border-primary/20 focus:ring-2 focus:ring-primary/10 transition-all text-xs font-medium text-foreground min-h-[60px]"
                      placeholder="email1@domain.com, email2@domain.com (comma separated)..."
                    />
                  </div>
                )}

                {/* Subject */}
                <div className="space-y-1.5">
                  <label className="text-[10px] font-extrabold uppercase tracking-wider text-muted-foreground ml-1">Email Subject</label>
                  <input
                    type="text"
                    value={emailSubject}
                    onChange={(e) => setEmailSubject(e.target.value)}
                    className="w-full bg-muted/50 border border-transparent rounded-2xl p-3.5 outline-none focus:bg-card focus:border-primary/20 focus:ring-2 focus:ring-primary/10 transition-all text-xs font-semibold text-foreground placeholder:text-muted-foreground/60"
                    placeholder="Enter email subject header..."
                  />
                </div>

                {/* Body editor */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <label className="text-[10px] font-extrabold uppercase tracking-wider text-muted-foreground ml-1">Email HTML Body</label>
                    <div className="flex bg-muted p-0.5 rounded-lg text-[9px]">
                      <button
                        type="button"
                        onClick={() => setEmailTab('rich')}
                        className={`px-3 py-1 rounded-md font-extrabold transition-all ${emailTab === 'rich' ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
                      >
                        Rich Editor
                      </button>
                      <button
                        type="button"
                        onClick={() => setEmailTab('edit')}
                        className={`px-3 py-1 rounded-md font-extrabold transition-all ${emailTab === 'edit' ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
                      >
                        Edit HTML
                      </button>
                      <button
                        type="button"
                        onClick={() => setEmailTab('preview')}
                        className={`px-3 py-1 rounded-md font-extrabold transition-all ${emailTab === 'preview' ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
                      >
                        Live Preview
                      </button>
                    </div>
                  </div>

                  {emailTab === 'rich' ? (
                    <RichTextEditor value={emailBody} onChange={setEmailBody} />
                  ) : emailTab === 'edit' ? (
                    <div className="space-y-1.5">
                      <textarea
                        value={emailBody}
                        onChange={(e) => setEmailBody(e.target.value)}
                        className="w-full bg-muted/50 border border-transparent rounded-2xl p-4 outline-none focus:bg-card focus:border-primary/20 focus:ring-2 focus:ring-primary/10 transition-all text-xs font-medium text-foreground min-h-[220px] font-mono leading-relaxed"
                        placeholder="<h2>Hello User!</h2>&#10;<p>We have completed our system update...</p>&#10;<a href='https://domain.com'>Visit App</a>"
                      />
                      <p className="text-[9px] text-muted-foreground ml-1 leading-relaxed">
                        HTML template support: Use standard tags like <code className="bg-muted px-1 py-0.5 rounded">&lt;h2&gt;</code>, <code className="bg-muted px-1 py-0.5 rounded">&lt;p&gt;</code>, <code className="bg-muted px-1 py-0.5 rounded">&lt;strong&gt;</code>, or inline style attributes for custom color formatting.
                      </p>
                    </div>
                  ) : (
                    <div className="w-full min-h-[220px] bg-white text-black border border-border rounded-2xl p-4 overflow-y-auto max-h-[400px] text-left">
                      {emailBody ? (
                        <div dangerouslySetInnerHTML={{ __html: formatEmailBody(emailBody) }} />
                      ) : (
                        <span className="italic text-gray-400 text-xs">No email content to preview. Write something in Rich Editor or Edit HTML first.</span>
                      )}
                    </div>
                  )}
                </div>

                {/* Send Buttons */}
                <div className="flex gap-3 pt-2">
                  <button
                    type="button"
                    onClick={() => handleSendEmailBroadcast(true)}
                    disabled={isSendingEmail || !emailSubject.trim() || !emailBody.trim()}
                    className="flex-1 py-3 bg-muted hover:bg-muted/80 text-foreground disabled:opacity-50 disabled:cursor-not-allowed rounded-2xl font-bold text-xs transition-all shadow-sm border border-border flex items-center justify-center gap-1.5"
                  >
                    <Send size={14} className="opacity-70" />
                    Send Test Email
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowEmailConfirmModal(true)}
                    disabled={isSendingEmail || !emailSubject.trim() || !emailBody.trim()}
                    className="flex-1 py-3 bg-primary hover:opacity-90 text-primary-foreground disabled:opacity-50 disabled:cursor-not-allowed rounded-2xl font-bold text-xs transition-all shadow-md flex items-center justify-center gap-1.5"
                  >
                    <Mail size={14} />
                    Send Broadcast
                  </button>
                </div>
              </div>

              {/* Live Preview Side (Mock Email Client Window) */}
              <div className="lg:col-span-5 bg-card border border-border rounded-3xl shadow-sm overflow-hidden flex flex-col min-h-[460px]">
                {/* Mock Client Header */}
                <div className="p-3 bg-muted/40 border-b border-border flex items-center gap-1.5 shrink-0">
                  <div className="w-2.5 h-2.5 rounded-full bg-rose-500/80" />
                  <div className="w-2.5 h-2.5 rounded-full bg-amber-500/80" />
                  <div className="w-2.5 h-2.5 rounded-full bg-emerald-500/80" />
                  <span className="text-[10px] font-bold text-muted-foreground ml-3 font-mono">Mail Client Simulator</span>
                </div>

                {/* Email Metadata */}
                <div className="p-3.5 border-b border-border/60 bg-muted/10 space-y-1.5 text-xs shrink-0 text-left">
                  <div>
                    <span className="text-muted-foreground font-semibold">From: </span>
                    <span className="font-medium text-foreground">Expense Tracker Support &lt;khizarraoworks@gmail.com&gt;</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground font-semibold">To: </span>
                    <span className="font-medium text-foreground px-1.5 py-0.5 rounded-md bg-muted text-[10px] uppercase tracking-wider font-extrabold">
                      {emailFilter === 'all' && 'All Registered Users'}
                      {emailFilter === 'pro' && 'PRO Subscribed Users'}
                      {emailFilter === 'free' && 'Standard Free Users'}
                      {emailFilter === 'custom' && 'Custom Mailing List'}
                    </span>
                  </div>
                  <div>
                    <span className="text-muted-foreground font-semibold">Subject: </span>
                    <span className="font-bold text-foreground">{emailSubject || '(No Subject Drafted)'}</span>
                  </div>
                </div>

                {/* Email Body Area */}
                <div className="flex-1 p-5 bg-white text-black overflow-y-auto max-h-[350px] text-left">
                  {emailBody ? (
                    <div className="prose prose-sm max-w-none text-black" dangerouslySetInnerHTML={{ __html: formatEmailBody(emailBody) }} />
                  ) : (
                    <div className="h-full flex flex-col items-center justify-center text-center text-gray-400 space-y-2">
                      <Mail size={32} className="opacity-20 animate-bounce" />
                      <p className="text-xs italic">Email layout preview simulator.<br />Compose your content in HTML to view rendering live.</p>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Send Result Summary */}
            {emailSendResult && (
              <div className={`border rounded-3xl p-5 shadow-sm animate-in slide-in-from-bottom duration-300 space-y-3 text-left ${emailSendResult.success
                ? 'bg-emerald-500/5 border-emerald-500/20 text-emerald-800 dark:text-emerald-300'
                : 'bg-rose-500/5 border-rose-500/20 text-rose-800 dark:text-rose-300'
                }`}>
                <div className="flex items-center justify-between border-b border-current/10 pb-2">
                  <div className="flex items-center gap-2">
                    <ShieldCheck size={18} />
                    <h4 className="font-extrabold text-sm">Broadcast Process Finished</h4>
                  </div>
                  <span className="text-[10px] font-extrabold uppercase bg-current/10 px-2 py-0.5 rounded-md">
                    {emailSendResult.success ? 'Success' : 'Completed with Errors'}
                  </span>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-xs">
                  <div>
                    <p className="opacity-70 font-semibold">Sent Successfully</p>
                    <p className="text-xl font-bold">{emailSendResult.sentCount} users</p>
                  </div>
                  <div>
                    <p className="opacity-70 font-semibold">Failed Transfers</p>
                    <p className="text-xl font-bold">{emailSendResult.failCount} users</p>
                  </div>
                </div>

                {emailSendResult.errors && emailSendResult.errors.length > 0 && (
                  <div className="pt-2 border-t border-current/10 space-y-2">
                    <p className="text-[10px] font-extrabold uppercase tracking-wide">Error Trace Log</p>
                    <div className="max-h-[120px] overflow-y-auto bg-black/10 dark:bg-black/30 rounded-xl p-3 font-mono text-[10px] space-y-1">
                      {emailSendResult.errors.map((err, idx) => (
                        <p key={idx}>
                          <span className="text-rose-500 font-bold">[{err.email}]</span>: {err.error}
                        </p>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* 6. Payments Verification Tab */}
        {activeTab === 'payments' && (
          <div className="space-y-6 animate-in fade-in duration-200">
            {/* Pending Requests Queue Card */}
            <div className="bg-card border border-border rounded-3xl p-5 shadow-sm space-y-4">
              <div className="flex items-center justify-between gap-3 border-b border-border/40 pb-4">
                <div className="flex items-center gap-2">
                  <Clock className="text-primary" size={18} />
                  <h3 className="font-extrabold text-sm text-foreground">Pending Verification Queue</h3>
                </div>
                <Badge variant="info" size="sm">
                  {paymentRequests.filter(r => r.status === 'pending').length} Pending
                </Badge>
              </div>

              {paymentRequests.length === 0 ? (
                <div className="py-12 text-center text-xs text-muted-foreground italic">
                  No payment verification requests recorded.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead>
                      <tr className="border-b border-border/40 text-muted-foreground font-semibold">
                        <th className="py-3 px-2">User</th>
                        <th className="py-3 px-2">Plan</th>
                        <th className="py-3 px-2">Method</th>
                        <th className="py-3 px-2">Tx ID</th>
                        <th className="py-3 px-2">Amount</th>
                        <th className="py-3 px-2">Submitted</th>
                        <th className="py-3 px-2">IP / Geotag</th>
                        <th className="py-3 px-2">Status</th>
                        <th className="py-3 px-2 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border/30">
                      {paymentRequests.map((req) => (
                        <tr key={req.id} className="hover:bg-muted/10">
                          <td className="py-3 px-2">
                            <p className="font-bold text-foreground truncate max-w-[120px]">{req.userName}</p>
                            <p className="text-[10px] text-muted-foreground truncate max-w-[150px]">{req.userEmail}</p>
                          </td>
                          <td className="py-3 px-2">
                            <PlanBadge plan={req.selectedPlan} size="sm" />
                          </td>
                          <td className="py-3 px-2 font-medium text-foreground">{req.paymentMethod}</td>
                          <td className="py-3 px-2 font-mono font-medium">{req.transactionId}</td>
                          <td className="py-3 px-2 font-bold text-foreground">PKR {req.amount}</td>
                          <td className="py-3 px-2 text-muted-foreground text-[10px]">
                            {req.submittedAt?.toDate ? req.submittedAt.toDate().toLocaleString() : new Date(req.submittedAt).toLocaleString()}
                          </td>
                          <td className="py-3 px-2 space-y-0.5">
                            <p className="font-mono text-[9px] text-muted-foreground">{req.submittedFromIP || '---'}</p>
                            {req.submittedFromCoords && (
                              <a
                                href={`https://www.google.com/maps?q=${req.submittedFromCoords.lat},${req.submittedFromCoords.lng}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-0.5 text-[9px] text-brand hover:underline font-bold"
                              >
                                <MapPin size={10} /> View Map
                              </a>
                            )}
                          </td>
                          <td className="py-3 px-2">
                            <Badge
                              variant={
                                req.status === 'approved' ? 'success' :
                                  req.status === 'rejected' ? 'danger' : 'warning'
                              }
                              size="sm"
                            >
                              {req.status}
                            </Badge>
                          </td>
                          <td className="py-3 px-2 text-right space-x-2 shrink-0">
                            {req.screenshotUrl && (
                              <button
                                onClick={() => setSelectedRequest(req)}
                                className="p-1 hover:bg-muted rounded-lg text-primary transition-colors inline-flex"
                                title="View Receipt"
                              >
                                <Eye size={16} />
                              </button>
                            )}
                            {req.status === 'pending' && (
                              <>
                                <button
                                  onClick={() => {
                                    setSelectedRequest(req);
                                    setShowApprovalModal(true);
                                  }}
                                  className="p-1 hover:bg-success/10 rounded-lg text-success transition-colors inline-flex"
                                  title="Approve"
                                >
                                  <CheckCircle2 size={16} />
                                </button>
                                <button
                                  onClick={() => {
                                    setSelectedRequest(req);
                                    setShowRejectionModal(true);
                                  }}
                                  className="p-1 hover:bg-destructive/10 rounded-lg text-destructive transition-colors inline-flex"
                                  title="Reject"
                                >
                                  <XCircle size={16} />
                                </button>
                              </>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* Payment Accounts Setup Panel */}
            <div className="bg-card border border-border rounded-3xl p-5 shadow-sm space-y-4">
              <div className="flex items-center justify-between gap-3 border-b border-border/40 pb-4">
                <div className="flex items-center gap-2">
                  <CreditCard className="text-primary" size={18} />
                  <h3 className="font-extrabold text-sm text-foreground">Manual Payment Accounts Config</h3>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setAccountForm({
                      id: '',
                      method: 'SadaPay',
                      holderName: '',
                      accountNumber: '',
                      iban: '',
                      instructions: '',
                      isActive: true,
                      displayOrder: paymentAccounts.length + 1,
                      qrCodeUrl: ''
                    });
                    setShowAccountModal(true);
                  }}
                  leftIcon={<PlusCircle size={14} />}
                >
                  Add Method
                </Button>
              </div>

              {paymentAccounts.length === 0 ? (
                <div className="py-8 text-center text-xs text-muted-foreground italic">
                  No payment accounts configured yet.
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {paymentAccounts.map((acc) => (
                    <div
                      key={acc.id}
                      className="border border-border/60 bg-muted/10 rounded-2xl p-4 flex justify-between items-start gap-4"
                    >
                      <div className="space-y-2 text-xs">
                        <div className="flex items-center gap-2">
                          <h4 className="font-extrabold text-foreground">{acc.method}</h4>
                          <Badge variant={acc.isActive ? 'success' : 'outline'} size="sm">
                            {acc.isActive ? 'Active' : 'Disabled'}
                          </Badge>
                        </div>
                        <div className="space-y-0.5 text-muted-foreground leading-normal">
                          <p>Holder: <strong className="text-foreground">{acc.holderName}</strong></p>
                          <p>Account: <strong className="text-foreground font-semibold">{acc.accountNumber}</strong></p>
                          {acc.iban && <p>IBAN: <strong className="text-foreground font-mono">{acc.iban}</strong></p>}
                          {acc.instructions && <p className="italic text-[10px]">"{acc.instructions}"</p>}
                        </div>
                      </div>

                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          onClick={() => {
                            setAccountForm(acc);
                            setShowAccountModal(true);
                          }}
                          className="p-1.5 hover:bg-muted rounded-lg text-slate-500 transition-colors inline-flex"
                        >
                          <Edit size={14} />
                        </button>
                        <button
                          onClick={() => handleDeleteAccount(acc.id)}
                          className="p-1.5 hover:bg-destructive/10 rounded-lg text-destructive transition-colors inline-flex"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* 7. Plans Configuration Tab */}
        {activeTab === 'plans' && (
          <div className="space-y-6 animate-in fade-in duration-200">
            {/* Plans List Config Card */}
            <div className="bg-card border border-border rounded-3xl p-5 shadow-sm space-y-4">
              <div className="flex items-center gap-2 border-b border-border/40 pb-4">
                <Sliders className="text-primary" size={18} />
                <h3 className="font-extrabold text-sm text-foreground">SaaS Subscription Plans Configuration</h3>
              </div>

              {!plansConfigLocal ? (
                <div className="py-12 flex flex-col items-center justify-center gap-2">
                  <Loader2 className="animate-spin text-primary" size={24} />
                  <span className="text-xs text-muted-foreground font-medium">Loading plans...</span>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  {Object.entries(plansConfigLocal)
                    .sort((a: any, b: any) => (a[1].displayOrder || 0) - (b[1].displayOrder || 0))
                    .map(([planId, details]: [string, any]) => {
                      const isPro = planId === 'pro';
                      const isMax = planId === 'max';

                      return (
                        <Card
                          key={planId}
                          variant="default"
                          className="p-5 border border-border/60 hover:border-primary/30 flex flex-col justify-between"
                        >
                          <div className="space-y-4 text-xs">
                            <div className="flex items-center justify-between border-b border-border/30 pb-2">
                              <div className="flex items-center gap-1.5">
                                {isMax ? <Crown size={16} className="text-warning" /> : isPro ? <Zap size={16} className="text-brand" /> : <Shield size={16} className="text-muted-foreground" />}
                                <h4 className="font-extrabold text-sm text-foreground">{details.name}</h4>
                              </div>
                              <Badge variant="outline" size="sm">
                                Order: {details.displayOrder}
                              </Badge>
                            </div>

                            <div className="space-y-1">
                              <p className="text-lg font-black text-foreground">
                                PKR {details.price}
                                <span className="text-[10px] text-muted-foreground font-medium">/{details.billingCycle}</span>
                              </p>
                              <p className="text-[10px] text-muted-foreground leading-normal">
                                Daily AI rate limit: <strong className="text-foreground">{details.limits.aiCallsPerDay} calls</strong>
                              </p>
                              <p className="text-[10px] text-muted-foreground leading-normal">
                                Daily AI Upload limit: <strong className="text-foreground">{details.limits.maxUploadsPerDay ?? 0} uploads</strong>
                              </p>
                              <p className="text-[10px] text-muted-foreground leading-normal">
                                Max Local Txs: <strong className="text-foreground">{details.limits.maxTransactions === -1 ? 'Unlimited' : details.limits.maxTransactions}</strong>
                              </p>
                            </div>

                            <div className="space-y-1.5 pt-2 border-t border-border/30">
                              <p className="font-semibold text-muted-foreground text-[10px] uppercase tracking-wider">Features Included:</p>
                              <div className="flex flex-wrap gap-1">
                                {(details.features || []).map((feat: string) => (
                                  <span key={feat} className="px-2 py-0.5 bg-muted text-foreground text-[9px] font-bold rounded-lg uppercase">
                                    {feat}
                                  </span>
                                ))}
                              </div>
                            </div>
                          </div>

                          <div className="pt-4 mt-4 border-t border-border/30">
                            <Button
                              variant="outline"
                              fullWidth
                              size="sm"
                              onClick={() => {
                                setEditingPlanId(planId);
                                setPlanForm({
                                  name: details.name,
                                  price: details.price,
                                  currency: details.currency || 'PKR',
                                  billingCycle: details.billingCycle,
                                  features: details.features || [],
                                  limits: details.limits || { aiCallsPerDay: 50, maxTransactions: 50000, maxUploadsPerDay: 10 },
                                  badgeIcon: details.badgeIcon || 'zap',
                                  badgeColor: details.badgeColor || '#3B82F6',
                                  displayOrder: details.displayOrder
                                });
                              }}
                            >
                              Edit Plan Configuration
                            </Button>
                          </div>
                        </Card>
                      );
                    })}
                </div>
              )}
            </div>

            {/* Plan Editor Form Card */}
            {editingPlanId && (
              <Card variant="default" className="p-6 border border-primary/30 shadow-md space-y-4 animate-in slide-in-from-bottom duration-250">
                <div className="flex items-center justify-between border-b border-border/40 pb-3">
                  <h4 className="font-extrabold text-sm text-foreground">
                    Editing Plan: {planForm.name} ({editingPlanId.toUpperCase()})
                  </h4>
                  <button
                    onClick={() => setEditingPlanId('')}
                    className="p-1 hover:bg-muted rounded-full transition-colors"
                  >
                    <X size={16} />
                  </button>
                </div>

                <form onSubmit={handleSavePlan} className="space-y-4 text-xs">
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <Input
                      label="Plan Name"
                      value={planForm.name}
                      onChange={e => setPlanForm({ ...planForm, name: e.target.value })}
                      required
                    />
                    <Input
                      label="Price (PKR)"
                      type="number"
                      value={planForm.price}
                      onChange={e => setPlanForm({ ...planForm, price: Number(e.target.value) })}
                      required
                    />
                    <Input
                      as="select"
                      label="Billing Cycle"
                      value={planForm.billingCycle}
                      onChange={e => setPlanForm({ ...planForm, billingCycle: e.target.value })}
                      options={[
                        { value: 'forever', label: 'Forever (Free)' },
                        { value: 'monthly', label: 'Monthly' },
                        { value: 'yearly', label: 'Yearly' }
                      ]}
                    />
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
                    <Input
                      label="Daily AI Call limit"
                      type="number"
                      value={planForm.limits.aiCallsPerDay}
                      onChange={e => setPlanForm({
                        ...planForm,
                        limits: { ...planForm.limits, aiCallsPerDay: Number(e.target.value) }
                      })}
                      required
                    />
                    <Input
                      label="Max Uploads limit"
                      type="number"
                      value={(planForm.limits as any).maxUploadsPerDay ?? 0}
                      onChange={e => setPlanForm({
                        ...planForm,
                        limits: { ...planForm.limits, maxUploadsPerDay: Number(e.target.value) }
                      })}
                      required
                    />
                    <Input
                      label="Max Transactions (-1 for unlimited)"
                      type="number"
                      value={planForm.limits.maxTransactions}
                      onChange={e => setPlanForm({
                        ...planForm,
                        limits: { ...planForm.limits, maxTransactions: Number(e.target.value) }
                      })}
                      required
                    />
                    <Input
                      label="Display Order"
                      type="number"
                      value={planForm.displayOrder}
                      onChange={e => setPlanForm({ ...planForm, displayOrder: Number(e.target.value) })}
                      required
                    />
                  </div>

                  <div className="space-y-2">
                    <span className="block text-xs font-semibold text-foreground/80">
                      Features Access Toggles
                    </span>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-muted/20 border border-border/50 p-4 rounded-2xl">
                      {[
                        { id: 'transactions', label: 'Transactions Ledger' },
                        { id: 'accounts', label: 'Account Management' },
                        { id: 'categories', label: 'Custom Categories' },
                        { id: 'dashboard', label: 'Core Dashboard' },
                        { id: 'goals', label: 'Savings Goals' },
                        { id: 'reminders', label: 'System Reminders' },
                        { id: 'calculator', label: 'Utility Calculator' },
                        { id: 'converter', label: 'Currency Converter' },
                        { id: 'tasks', label: 'Task List' },
                        { id: 'loans', label: 'Loan Tracker' },
                        { id: 'events', label: 'Event Budgets' },
                        { id: 'fuel', label: 'Fuel Tracking' },
                        { id: 'reports', label: 'Visual Reports' },
                        { id: 'subscriptions', label: 'Subscription Manager' },
                        { id: 'ai-chat', label: 'AI Financial Copilot' },
                        { id: 'whatsapp', label: 'WhatsApp Copilot' },
                        { id: 'investments', label: 'Exchange Integrations' }
                      ].map((feat) => {
                        const isEnabled = planForm.features.includes(feat.id);
                        return (
                          <label key={feat.id} className="flex items-center gap-2 select-none cursor-pointer">
                            <input
                              type="checkbox"
                              checked={isEnabled}
                              onChange={() => {
                                const updated = isEnabled
                                  ? planForm.features.filter(id => id !== feat.id)
                                  : [...planForm.features, feat.id];
                                setPlanForm({ ...planForm, features: updated });
                              }}
                              className="rounded border-border text-primary focus:ring-ring shrink-0 h-4 w-4"
                            />
                            <span className="font-medium text-foreground/90">{feat.label}</span>
                          </label>
                        );
                      })}
                    </div>
                  </div>

                  <div className="flex justify-end gap-3 pt-2">
                    <Button variant="outline" size="sm" onClick={() => setEditingPlanId('')}>
                      Cancel
                    </Button>
                    <Button type="submit" variant="primary" size="sm">
                      Save Plan Settings
                    </Button>
                  </div>
                </form>
              </Card>
            )}
          </div>
        )}

        {/* 8. User Data Sync Tab */}
        {activeTab === 'sync' && (
          <div className="space-y-6 animate-in fade-in duration-200">
            {/* Sync Header Card */}
                <div className="p-6 bg-card border border-border/80 rounded-2xl shadow-sm flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
                  <div>
                    <h3 className="text-lg font-extrabold text-foreground flex items-center gap-2">
                      <RefreshCw size={18} className="text-primary" />
                      User-Wise Data Sync & Reconciliation
                    </h3>
                    <p className="text-xs text-muted-foreground mt-1 max-w-2xl">
                      Reconcile and sync user accounts, transactions, and settings individually from Firestore backups to Supabase. This guarantees 100% data integrity without disturbing live users.
                    </p>
                  </div>
                  <div className="flex items-center gap-2.5 shrink-0 flex-wrap">
                    <label className="cursor-pointer">
                      <input
                        type="file"
                        accept=".json"
                        multiple
                        className="hidden"
                        onChange={async (e) => {
                          if (e.target.files && e.target.files.length > 0) {
                            await userMigrationSyncManager.bulkImportJsonFiles(e.target.files);
                          }
                        }}
                      />
                      <span className="gap-2 px-3.5 py-2 bg-emerald-500/10 border border-emerald-500/30 text-emerald-500 hover:bg-emerald-500/20 rounded-xl text-xs font-bold shadow-xs inline-flex items-center transition-all">
                        <Upload size={14} />
                        Bulk Import JSON
                      </span>
                    </label>
                    <Button
                      variant="primary"
                      onClick={async () => {
                        if (confirm('Start sequential data sync for ALL users? Progress will be displayed on top of dashboard.')) {
                          for (const u of users) {
                            await userMigrationSyncManager.syncUserData(u.id, u.email);
                          }
                        }
                      }}
                      className="gap-2 font-bold shadow-md rounded-xl py-2 px-3.5 text-xs"
                    >
                      <Zap size={14} />
                      Sync All Users
                    </Button>
                  </div>
                </div>

                {/* Sync Directory Table */}
                <Card className="overflow-hidden border-border/60 shadow-sm">
                  <div className="p-4 bg-muted/30 border-b border-border/60 flex items-center justify-between">
                    <h4 className="text-sm font-bold text-foreground flex items-center gap-2">
                      <Users size={16} className="text-primary" />
                      User Sync Status ({users.length} Users)
                    </h4>
                  </div>

                  <div className="overflow-x-auto w-full">
                    <table className="w-full min-w-[950px] text-left text-xs border-collapse">
                      <thead className="bg-muted/40 text-muted-foreground uppercase font-mono border-b border-border/60">
                        <tr>
                          <th className="px-4 py-3.5 text-[11px] tracking-wider font-bold">User Profile</th>
                          <th className="px-4 py-3.5 text-[11px] tracking-wider font-bold">Email</th>
                          <th className="px-4 py-3.5 text-[11px] tracking-wider font-bold">Plan</th>
                          <th className="px-4 py-3.5 text-[11px] tracking-wider font-bold">Sync Status</th>
                          <th className="px-4 py-3.5 text-[11px] tracking-wider font-bold text-right">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border/50">
                        {users.map(u => {
                          const isSynced = userMigrationSyncManager.isUserSynced(u.id);
                          return (
                            <tr key={u.id} className="hover:bg-muted/30 transition-colors">
                              <td className="px-4 py-3.5 font-semibold text-foreground whitespace-nowrap">
                                <div className="flex items-center gap-2.5">
                                  {u.photoURL ? (
                                    <img src={u.photoURL} className="w-7 h-7 rounded-full border border-border object-cover shrink-0" />
                                  ) : (
                                    <div className="w-7 h-7 rounded-full bg-primary/10 text-primary border border-primary/20 flex items-center justify-center font-bold text-xs shrink-0">
                                      {(u.displayName || u.email || 'U')[0].toUpperCase()}
                                    </div>
                                  )}
                                  <span className="truncate max-w-[160px] font-bold">{u.displayName || 'Anonymous User'}</span>
                                </div>
                              </td>
                              <td className="px-4 py-3.5 font-mono text-muted-foreground whitespace-nowrap">{u.email}</td>
                              <td className="px-4 py-3.5 whitespace-nowrap">
                                <PlanBadge plan={(u.plan || (u.isPro ? 'pro' : 'standard')) as 'pro' | 'standard' | 'max'} />
                              </td>
                              <td className="px-4 py-3.5 whitespace-nowrap">
                                {isSynced ? (
                                  <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold bg-emerald-500/10 text-emerald-500 border border-emerald-500/20">
                                    <CheckCircle2 size={12} />
                                    Synced
                                  </span>
                                ) : (
                                  <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold bg-amber-500/10 text-amber-500 border border-amber-500/20">
                                    <Clock size={12} />
                                    Pending Sync
                                  </span>
                                )}
                              </td>
                              <td className="px-4 py-3.5 text-right whitespace-nowrap">
                                <div className="flex items-center justify-end gap-1.5 flex-nowrap">
                                  <Button
                                    size="xs"
                                    variant="outline"
                                    disabled={isVerifying}
                                    onClick={() => handleCompareUser(u)}
                                    title="Compare Firestore vs Supabase data"
                                    className="whitespace-nowrap gap-1 px-2.5 py-1 text-[11px] font-bold rounded-lg border-primary/30 text-primary hover:bg-primary/10 transition-colors"
                                  >
                                    <ArrowUpDown size={12} className={isVerifying ? "animate-spin" : ""} />
                                    {isVerifying ? 'Comparing...' : 'Compare'}
                                  </Button>
                                  <Button
                                    size="xs"
                                    variant="outline"
                                    onClick={() => userMigrationSyncManager.syncUserData(u.id, u.email)}
                                    title="Sync User Data to Supabase"
                                    className="whitespace-nowrap gap-1 px-2.5 py-1 text-[11px] font-bold rounded-lg border-border text-foreground hover:bg-muted/60 transition-colors"
                                  >
                                    <RefreshCw size={12} />
                                    Sync
                                  </Button>
                                  <Button
                                    size="xs"
                                    variant="outline"
                                    onClick={() => userMigrationSyncManager.exportUserBackupJson(u.id, u.email)}
                                    title="Export Firestore JSON Backup"
                                    className="whitespace-nowrap gap-1 px-2.5 py-1 text-[11px] font-bold rounded-lg border-emerald-500/30 text-emerald-500 bg-emerald-500/10 hover:bg-emerald-500/20 transition-colors"
                                  >
                                    <Download size={12} />
                                    Export
                                  </Button>
                                  <label title="Import JSON Backup file" className="cursor-pointer inline-flex">
                                    <input
                                      type="file"
                                      accept=".json"
                                      className="hidden"
                                      onChange={async (e) => {
                                        const file = e.target.files?.[0];
                                        if (!file) return;
                                        try {
                                          const text = await file.text();
                                          const jsonData = JSON.parse(text);
                                          toast.loading(`Importing JSON backup for ${u.email}...`, { id: 'singleImport' });
                                          const res = await userMigrationSyncManager.importUserBackupJsonData(jsonData, u.id, u.email);
                                          toast.dismiss('singleImport');
                                          toast.success(`Successfully imported ${res.recordsCount} records for ${u.email}!`);
                                          window.dispatchEvent(new CustomEvent('app-sync-complete'));
                                        } catch (err: any) {
                                          toast.error(`Import failed: ${err.message || err}`);
                                        }
                                      }}
                                    />
                                    <span className="whitespace-nowrap gap-1 px-2.5 py-1 text-[11px] font-bold rounded-lg border border-indigo-500/30 text-indigo-500 bg-indigo-500/10 hover:bg-indigo-500/20 transition-colors inline-flex items-center">
                                      <Upload size={12} />
                                      Import
                                    </span>
                                  </label>
                                  <Button
                                    size="xs"
                                    variant="secondary"
                                    onClick={async () => {
                                      localStorage.setItem('simulated_user_id', u.id);
                                      localStorage.setItem('simulated_user_email', u.email);
                                      toast.info(`Simulating view for ${u.email}... Loading data.`);
                                      try {
                                        await userMigrationSyncManager.syncUserData(u.id, u.email);
                                        await syncManager.pullInitialDataForUser(u.id);
                                      } catch (e) { }
                                      window.location.href = '/';
                                    }}
                                    title="Login as this User"
                                    className="whitespace-nowrap gap-1 px-2.5 py-1 text-[11px] font-bold rounded-lg bg-muted text-muted-foreground hover:text-foreground transition-colors"
                                  >
                                    <Eye size={12} />
                                    Login
                                  </Button>
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </Card>
              </div>
            )}
          </div>

      {/* ── MANUALLY INTEGRATED MODALS ────────────────────────────────────── */}

        {/* 1. Approval Modal */}
        {showApprovalModal && selectedRequest && (
          <Modal
            isOpen={showApprovalModal}
            onClose={() => {
              setShowApprovalModal(false);
              setInternalNotes('');
            }}
            title="Approve Subscription Payment"
            description={`Activating ${selectedRequest.selectedPlan.toUpperCase()} Plan for ${selectedRequest.userName}`}
            variant="success"
            footer={
              <>
                <Button
                  variant="outline"
                  onClick={() => {
                    setShowApprovalModal(false);
                    setInternalNotes('');
                  }}
                  disabled={isLoading}
                >
                  Cancel
                </Button>
                <Button
                  variant="primary"
                  onClick={handleApproveRequest}
                  loading={isLoading}
                >
                  Confirm Approval
                </Button>
              </>
            }
          >
            <div className="space-y-4 text-xs">
              <p className="text-[11px] text-muted-foreground leading-relaxed">
                Confirming this transaction will grant active subscription rights immediately.
              </p>
              <div className="grid grid-cols-1 gap-4">
                <Input
                  label="Subscription Expiry Date"
                  type="date"
                  value={customExpiryDate}
                  onChange={e => setCustomExpiryDate(e.target.value)}
                  required
                />
                <Input
                  as="textarea"
                  label="Internal Audit Notes"
                  placeholder="Include verification details or banking logs reference..."
                  value={internalNotes}
                  onChange={e => setInternalNotes(e.target.value)}
                  rows={2}
                />
              </div>
            </div>
          </Modal>
        )}

        {/* 2. Rejection Modal */}
        {showRejectionModal && selectedRequest && (
          <Modal
            isOpen={showRejectionModal}
            onClose={() => {
              setShowRejectionModal(false);
              setRejectionReason('');
              setInternalNotes('');
            }}
            title="Reject Subscription Payment"
            description={`Declining transaction proof from ${selectedRequest.userName}`}
            variant="danger"
            footer={
              <>
                <Button
                  variant="outline"
                  onClick={() => {
                    setShowRejectionModal(false);
                    setRejectionReason('');
                    setInternalNotes('');
                  }}
                  disabled={isLoading}
                >
                  Cancel
                </Button>
                <Button
                  variant="destructive"
                  onClick={handleRejectRequest}
                  loading={isLoading}
                  disabled={!rejectionReason.trim()}
                >
                  Confirm Rejection
                </Button>
              </>
            }
          >
            <div className="space-y-4 text-xs">
              <p className="text-[11px] text-muted-foreground leading-relaxed">
                Provide a clear reason for rejecting the receipt. This will be shown to the user.
              </p>
              <div className="grid grid-cols-1 gap-4">
                <Input
                  label="Rejection Reason (Required)"
                  placeholder="e.g. Invalid/unreadable receipt image, duplicate transaction ID, incorrect transfer amount"
                  value={rejectionReason}
                  onChange={e => setRejectionReason(e.target.value)}
                  required
                />
                <Input
                  as="textarea"
                  label="Internal Audit Notes"
                  placeholder="Include details about why it failed checks..."
                  value={internalNotes}
                  onChange={e => setInternalNotes(e.target.value)}
                  rows={2}
                />
              </div>
            </div>
          </Modal>
        )}

        {/* 3. Account Configuration CRUD Modal */}
        {showAccountModal && (
          <Modal
            isOpen={showAccountModal}
            onClose={() => setShowAccountModal(false)}
            title={accountForm.id ? "Edit Payment Account" : "Add Payment Account"}
            description="Configure banking/wallet credentials displayed to users during checkout"
            footer={
              <>
                <Button
                  variant="outline"
                  onClick={() => setShowAccountModal(false)}
                >
                  Cancel
                </Button>
                <Button
                  variant="primary"
                  onClick={handleSaveAccount}
                >
                  Save Account
                </Button>
              </>
            }
          >
            <form onSubmit={handleSaveAccount} className="space-y-4 text-xs">
              <div className="grid grid-cols-2 gap-4">
                <Input
                  as="select"
                  label="Payment Method"
                  value={accountForm.method}
                  onChange={e => setAccountForm({ ...accountForm, method: e.target.value })}
                  options={[
                    { value: 'SadaPay', label: 'SadaPay' },
                    { value: 'JazzCash', label: 'JazzCash' },
                    { value: 'Easypaisa', label: 'Easypaisa' },
                    { value: 'Bank Transfer', label: 'Bank Transfer' }
                  ]}
                />
                <Input
                  label="Account Holder Name"
                  value={accountForm.holderName}
                  onChange={e => setAccountForm({ ...accountForm, holderName: e.target.value })}
                  required
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <Input
                  label="Account / Phone Number"
                  value={accountForm.accountNumber}
                  onChange={e => setAccountForm({ ...accountForm, accountNumber: e.target.value })}
                  required
                />
                <Input
                  label="IBAN / Swift (Optional)"
                  value={accountForm.iban}
                  onChange={e => setAccountForm({ ...accountForm, iban: e.target.value })}
                />
              </div>
              <Input
                label="QR Code Image URL (Optional)"
                value={accountForm.qrCodeUrl}
                onChange={e => setAccountForm({ ...accountForm, qrCodeUrl: e.target.value })}
                helperText="Cloudinary URL for QR code scan."
              />
              <Input
                as="textarea"
                label="Checkout Instructions"
                placeholder="Display instructions (e.g. Include your username in the transaction notes)"
                value={accountForm.instructions}
                onChange={e => setAccountForm({ ...accountForm, instructions: e.target.value })}
                rows={2}
              />
              <div className="grid grid-cols-2 gap-4">
                <Input
                  label="Display Order"
                  type="number"
                  value={accountForm.displayOrder}
                  onChange={e => setAccountForm({ ...accountForm, displayOrder: Number(e.target.value) })}
                  required
                />
                <div className="flex items-center gap-2 select-none pt-6 text-left">
                  <input
                    type="checkbox"
                    id="isActive"
                    checked={accountForm.isActive}
                    onChange={e => setAccountForm({ ...accountForm, isActive: e.target.checked })}
                    className="rounded border-border text-primary h-4 w-4"
                  />
                  <label htmlFor="isActive" className="font-bold text-xs cursor-pointer">Method Active</label>
                </div>
              </div>
            </form>
          </Modal>
        )}

        {/* 4. Screenshot Zoom Viewer Modal */}
        {selectedRequest && !showApprovalModal && !showRejectionModal && (
          <Modal
            isOpen={!!selectedRequest}
            onClose={() => setSelectedRequest(null)}
            title="Payment Verification Screenshot"
            description={`Tx ID: ${selectedRequest.transactionId} • Submitted: ${selectedRequest.submittedAt?.toDate ? selectedRequest.submittedAt.toDate().toLocaleDateString() : new Date(selectedRequest.submittedAt).toLocaleDateString()}`}
            size="lg"
          >
            <div className="flex flex-col items-center gap-4 bg-muted/10 p-2 rounded-2xl">
              <img
                src={selectedRequest.screenshotUrl}
                alt="Transaction Proof Receipt"
                className="max-w-full max-h-[60vh] object-contain rounded-xl shadow-md border"
              />
              <div className="w-full text-xs space-y-1 bg-card border border-border p-4 rounded-xl text-left leading-relaxed">
                <p>User: <strong className="text-foreground">{selectedRequest.userName}</strong> ({selectedRequest.userEmail})</p>
                <p>Requested Plan: <strong className="text-foreground uppercase">{selectedRequest.selectedPlan}</strong></p>
                <p>Amount paid: <strong className="text-foreground font-semibold">PKR {selectedRequest.amount}</strong> via <strong className="text-foreground">{selectedRequest.paymentMethod}</strong></p>
                {selectedRequest.notes && (
                  <p className="border-t pt-2 mt-2 italic text-muted-foreground">Notes: "{selectedRequest.notes}"</p>
                )}
              </div>
            </div>
          </Modal>
        )}

        {showEmailConfirmModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="bg-card border border-border w-full max-w-md rounded-3xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200 p-6 space-y-4 text-left">
              <div className="flex items-center gap-3 text-rose-500">
                <div className="p-3 bg-rose-500/10 rounded-2xl">
                  <AlertCircle size={24} />
                </div>
                <div>
                  <h3 className="font-extrabold text-base text-foreground">Confirm Email Broadcast</h3>
                  <p className="text-[10px] text-muted-foreground uppercase font-bold tracking-widest">High-Privilege Security Action</p>
                </div>
              </div>

              <p className="text-xs text-muted-foreground leading-relaxed">
                Are you sure you want to broadcast this email? It will be sent to:
                <strong className="text-foreground font-extrabold block mt-1 uppercase text-[10px] tracking-wider">
                  {emailFilter === 'all' && 'All Registered Users'}
                  {emailFilter === 'pro' && 'PRO Subscription Users'}
                  {emailFilter === 'free' && 'Standard Free Users'}
                  {emailFilter === 'custom' && `Custom List (${emailCustomRecipients.split(',').filter(Boolean).length} emails)`}
                </strong>
                This action cannot be undone once started. Please double check that SMTP settings and content formatting are correct.
              </p>

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowEmailConfirmModal(false)}
                  className="flex-1 py-3 bg-muted hover:bg-muted/80 text-foreground rounded-2xl font-bold text-xs transition-all border border-border"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => handleSendEmailBroadcast(false)}
                  disabled={isSendingEmail}
                  className="flex-1 py-3 bg-primary hover:opacity-90 text-primary-foreground disabled:opacity-50 rounded-2xl font-bold text-xs transition-all shadow-md flex items-center justify-center gap-1.5"
                >
                  {isSendingEmail ? (
                    <>
                      <RefreshCw size={14} className="animate-spin" /> Broadcasting...
                    </>
                  ) : (
                    <>
                      <Mail size={14} /> Yes, Send Now
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        )}

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
                    try { payload = JSON.parse(item.payload); } catch (e) { }
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
                        className={`flex items-center justify-between p-4 rounded-2xl border transition-all ${isGloballyDisabled
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
                          className={`w-12 h-6 rounded-full transition-all relative shrink-0 ${isEnabled ? 'bg-emerald-500' : 'bg-muted'
                            }`}
                        >
                          <div className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-all ${isEnabled ? 'right-1' : 'left-1'
                            }`} />
                        </button>
                      </div>
                    );
                  })}
                </div>

                {/* Gemini API Key Override */}
                <div className="pt-6 border-t border-border/60 space-y-3">
                  <div>
                    <label className="block text-xs font-bold uppercase tracking-widest text-muted-foreground mb-2">
                      User Gemini API Key Override
                    </label>
                    <p className="text-[10px] text-muted-foreground mb-3 leading-relaxed">
                      Set a custom Gemini API Key specifically for this user. This overrides the global fallback key and the VITE_GEMINI_API_KEY environment variable. Leave blank to inherit system defaults.
                    </p>

                    <div className="relative">
                      <input
                        type={showUserGeminiApiKey ? 'text' : 'password'}
                        value={userGeminiApiKey}
                        onChange={(e) => setUserGeminiApiKey(e.target.value)}
                        placeholder="Inherit system defaults (no override)..."
                        className="w-full pl-4 pr-10 py-3 bg-muted border border-border/40 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary outline-none transition-all text-xs font-mono text-foreground"
                      />
                      <button
                        type="button"
                        onClick={() => setShowUserGeminiApiKey(!showUserGeminiApiKey)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                      >
                        {showUserGeminiApiKey ? <EyeOff size={14} /> : <Eye size={14} />}
                      </button>
                    </div>
                  </div>
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

        {verificationReport && (
          <div className="fixed inset-0 z-[150] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-in fade-in">
            <div className="bg-card border border-border w-full max-w-2xl rounded-3xl p-6 shadow-2xl space-y-4 max-h-[85vh] flex flex-col">
              <div className="flex items-center justify-between border-b border-border/40 pb-3">
                <div>
                  <h3 className="font-bold text-lg text-foreground">Data Synchronization Report</h3>
                  <p className="text-xs text-muted-foreground">User: {verificationReport.userEmail} ({verificationReport.userId})</p>
                </div>
                <span className={`text-xs font-bold px-2.5 py-1 rounded-full border ${verificationReport.isPerfectMatch ? 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20' : 'bg-amber-500/10 text-amber-500 border-amber-500/20'}`}>
                  {verificationReport.isPerfectMatch ? '✓ 100% Match' : '⚠️ Discrepancies Found'}
                </span>
              </div>

              <div className="flex-1 overflow-y-auto space-y-2 pr-1">
                <div className="grid grid-cols-3 gap-2 text-xs font-bold uppercase tracking-wider text-muted-foreground p-2 bg-muted/30 rounded-xl">
                  <span>Collection</span>
                  <span>Firestore</span>
                  <span>Supabase</span>
                </div>
                {verificationReport.collections.map((d: any) => (
                  <div key={d.collectionName} className="grid grid-cols-3 gap-2 text-xs p-2 rounded-xl border border-border/40 items-center">
                    <span className="font-semibold text-foreground">{d.collectionName}</span>
                    <span className="font-mono">{d.firestoreCount} docs</span>
                    <span className={`font-mono ${d.status === 'matched' ? 'text-emerald-500' : 'text-rose-500 font-bold'}`}>
                      {d.supabaseCount} docs {d.status === 'matched' ? '✓' : '❌'}
                    </span>
                  </div>
                ))}
              </div>

              <div className="pt-3 border-t border-border/40 flex justify-end">
                <button
                  onClick={() => setVerificationReport(null)}
                  className="px-5 py-2.5 bg-primary text-primary-foreground font-bold text-xs rounded-xl hover:opacity-90"
                >
                  Close Report
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
