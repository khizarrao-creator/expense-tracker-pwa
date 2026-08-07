import React, { createContext, useContext, useEffect, useState } from 'react';
import { supabase, isSupabaseConfigured } from '../supabase';
import { toast } from 'sonner';
import { ShieldAlert, Info, X, AlertTriangle } from 'lucide-react';
import { useAuth } from './AuthContext';
import { useLocation } from 'react-router-dom';

export interface PlanDetails {
  name: string;
  price: number;
  currency: string;
  billingCycle: string;
  features: string[];
  limits: { aiCallsPerDay: number; maxTransactions: number; maxUploadsPerDay?: number };
  badgeIcon: string;
  badgeColor: string;
  displayOrder: number;
}

export interface GlobalConfig {
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
  exchangeRate?: number; // USD to PKR rate: e.g. 280 (1 USD = 280 PKR)
  tldrawLicenseKey?: string;
}

interface AppContextType {
  config: GlobalConfig;
  isLoading: boolean;
  isPro: boolean;
  disabledFeatures: string[];
  userPlan: string;
  planExpiresAt: Date | null;
  plansConfig: Record<string, PlanDetails>;
  planFeatures: string[];
  planLimits: { aiCallsPerDay: number; maxTransactions: number; maxUploadsPerDay?: number };
  isSidebarHidden: boolean;
  setIsSidebarHidden: (hidden: boolean) => void;
  isPrivacyMode: boolean;
  togglePrivacyMode: () => void;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

export const useApp = () => {
  const context = useContext(AppContext);
  if (!context) throw new Error('useApp must be used within an AppProvider');
  return context;
};

export const AppProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [config, setConfig] = useState<GlobalConfig>({
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

  const DEFAULT_PLANS: Record<string, PlanDetails> = {
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
  };

  const [isLoading, setIsLoading] = useState(true);
  const [isPro, setIsPro] = useState(false);
  const [isBanned, setIsBanned] = useState(false);
  const [disabledFeatures, setDisabledFeatures] = useState<string[]>([]);
  const [showAnnouncement, setShowAnnouncement] = useState(true);
  const [showEmergency, setShowEmergency] = useState(true);
  const { user } = useAuth();
  const location = useLocation();

  const [plansConfig, setPlansConfig] = useState<Record<string, PlanDetails>>(DEFAULT_PLANS);
  const [userPlan, setUserPlan] = useState<string>('standard');
  const [planExpiresAt, setPlanExpiresAt] = useState<Date | null>(null);
  const [isSidebarHidden, setIsSidebarHidden] = useState(false);
  const [isPrivacyMode, setIsPrivacyMode] = useState<boolean>(() => {
    return localStorage.getItem('privacy_mode') === 'true';
  });

  const togglePrivacyMode = () => {
    setIsPrivacyMode(prev => {
      const next = !prev;
      localStorage.setItem('privacy_mode', String(next));
      return next;
    });
  };

  // Load plans from Supabase
  useEffect(() => {
    if (!isSupabaseConfigured) return;

    const loadPlans = async () => {
      const { data: plansData } = await supabase.from('plans').select('*');
      if (plansData && plansData.length > 0) {
        const merged = { ...DEFAULT_PLANS };
        plansData.forEach((p: any) => {
          merged[p.id] = {
            name: p.name,
            price: p.price,
            currency: p.currency || 'PKR',
            billingCycle: p.billing_cycle || 'monthly',
            features: p.features || [],
            limits: p.limits || { aiCallsPerDay: 0, maxTransactions: 10000 },
            badgeIcon: p.badge_icon || 'shield',
            badgeColor: p.badge_color || '#6B7280',
            displayOrder: p.display_order || 1
          };
        });
        setPlansConfig(merged);
      }
    };

    loadPlans();

    const planSub = supabase
      .channel('plans-channel')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'plans' }, () => {
        loadPlans();
      })
      .subscribe();

    return () => { supabase.removeChannel(planSub); };
  }, []);

  // Load User details and notifications from Supabase
  useEffect(() => {
    if (!user || !isSupabaseConfigured) {
      setIsPro(false);
      setIsBanned(false);
      setDisabledFeatures([]);
      setUserPlan('standard');
      setPlanExpiresAt(null);
      return;
    }

    const loadUser = async () => {
      const { data } = await supabase.from('users').select('*').eq('id', user.uid).maybeSingle();
      if (data) {
        const planName = data.plan || (data.is_pro ? 'pro' : 'standard');
        setUserPlan(planName);
        setIsPro(planName !== 'standard' || !!data.is_pro);
        setIsBanned(!!data.is_banned);
        setDisabledFeatures(data.disabled_features || []);

        if (data.plan_expires_at) {
          const expiresDate = new Date(data.plan_expires_at);
          setPlanExpiresAt(expiresDate);
          if (expiresDate < new Date() && planName !== 'standard') {
            await supabase.from('users').update({
              plan: 'standard',
              is_pro: false,
              plan_expires_at: null,
              plan_assigned_by: 'expiry_daemon'
            }).eq('id', user.uid);
          }
        } else {
          setPlanExpiresAt(null);
        }
      }
    };

    loadUser();

    // Listeners for user notifications and broadcasts
    const notifSub = supabase
      .channel(`user-notifs-${user.uid}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'notifications', filter: `user_id=eq.${user.uid}` },
        (payload: any) => {
          if (payload.new && !payload.new.read) {
            toast.info(payload.new.message || 'New notification', { duration: 8000 });
          }
        }
      )
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'broadcast_notifications' },
        (payload: any) => {
          if (payload.new) {
            toast.success(`📢 BROADCAST: ${payload.new.message}`, { duration: 10000 });
          }
        }
      )
      .subscribe();

    return () => { supabase.removeChannel(notifSub); };
  }, [user]);

  // Load global app config
  useEffect(() => {
    if (!isSupabaseConfigured) {
      setIsLoading(false);
      return;
    }

    const loadGlobalConfig = async () => {
      const { data } = await supabase.from('app_config').select('*');
      if (data) {
        const newConfig: any = { ...config };
        data.forEach((row: any) => {
          newConfig[row.key] = row.value;
        });
        setConfig(newConfig);
        setShowAnnouncement(true);
      }
      setIsLoading(false);
    };

    loadGlobalConfig();
  }, []);

  useEffect(() => {
    if (config.emergencyMessage) setShowEmergency(true);
  }, [config.emergencyMessage]);

  const isInternalAdmin = localStorage.getItem('admin_authorized') === 'true' || !!localStorage.getItem('admin_token');
  const isPathAdmin = location.pathname === '/admin';

  if (config.maintenanceMode && !isInternalAdmin && !isPathAdmin) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-6 text-center">
        <div className="max-w-md space-y-6 animate-in fade-in zoom-in duration-500">
          <div className="w-20 h-20 bg-rose-500/10 text-rose-500 rounded-3xl flex items-center justify-center mx-auto mb-4">
            <ShieldAlert size={40} />
          </div>
          <h1 className="text-3xl font-bold">Under Maintenance</h1>
          <p className="text-muted-foreground leading-relaxed">
            We are currently performing scheduled maintenance to improve your experience.
            The app will be back online shortly.
          </p>
        </div>
      </div>
    );
  }

  if (isBanned && !isInternalAdmin && !isPathAdmin) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-6 text-center">
        <div className="max-w-md space-y-6 animate-in fade-in zoom-in duration-500">
          <div className="w-20 h-20 bg-rose-500/10 text-rose-500 rounded-3xl flex items-center justify-center mx-auto mb-4">
            <X size={40} />
          </div>
          <h1 className="text-3xl font-bold text-rose-500">Account Suspended</h1>
          <p className="text-muted-foreground leading-relaxed">
            Your access to Ledger has been suspended by the administrator.
          </p>
        </div>
      </div>
    );
  }

  const currentPlan = plansConfig[userPlan] || plansConfig.standard || DEFAULT_PLANS.standard;
  const planFeatures = currentPlan.features || DEFAULT_PLANS.standard.features;
  const planLimits = currentPlan.limits || DEFAULT_PLANS.standard.limits;

  return (
    <AppContext.Provider value={{
      config,
      isLoading,
      isPro,
      disabledFeatures,
      userPlan,
      planExpiresAt,
      plansConfig,
      planFeatures,
      planLimits,
      isSidebarHidden,
      setIsSidebarHidden,
      isPrivacyMode,
      togglePrivacyMode
    }}>
      {config.emergencyMessage && showEmergency && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-300">
          <div className="bg-card w-full max-w-sm rounded-3xl p-8 border border-border shadow-2xl space-y-6 text-center animate-in zoom-in duration-300">
            <div className="w-20 h-20 bg-rose-500/20 text-rose-500 rounded-full flex items-center justify-center mx-auto">
              <AlertTriangle size={40} />
            </div>
            <div className="space-y-2">
              <h2 className="text-2xl font-bold text-rose-500">Emergency Alert</h2>
              <p className="text-muted-foreground leading-relaxed whitespace-pre-wrap">
                {config.emergencyMessage}
              </p>
            </div>
            <button
              onClick={() => setShowEmergency(false)}
              className="w-full py-4 bg-primary text-primary-foreground rounded-2xl font-bold hover:opacity-90 transition-all shadow-lg"
            >
              Acknowledge
            </button>
          </div>
        </div>
      )}

      {config.announcement && showAnnouncement && !config.maintenanceMode && (
        <div className="bg-amber-500/10 dark:bg-amber-950/30 text-amber-800 dark:text-amber-200 border-b border-amber-500/20 dark:border-amber-500/10 px-4 py-3 relative z-[100] animate-in slide-in-from-top duration-300">
          <div className="max-w-4xl mx-auto flex items-start gap-3 pr-8">
            <Info size={18} className="shrink-0 mt-0.5 text-amber-600 dark:text-amber-400" />
            <p className="text-xs font-medium leading-relaxed whitespace-pre-wrap">
              {config.announcement}
            </p>
          </div>
          <button
            onClick={() => setShowAnnouncement(false)}
            className="absolute right-3 top-3 p-1 hover:bg-amber-500/20 rounded-full transition-colors text-amber-600 dark:text-amber-400"
          >
            <X size={16} />
          </button>
        </div>
      )}
      {children}
    </AppContext.Provider>
  );
};
