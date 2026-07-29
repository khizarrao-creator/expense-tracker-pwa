import React, { createContext, useContext, useEffect, useState } from 'react';
import { db } from '../firebase';
import { doc, onSnapshot, collection, query, orderBy, limit, updateDoc } from 'firebase/firestore';
import { toast } from 'sonner';
import { ShieldAlert, Info, X, AlertTriangle } from 'lucide-react';
import { useAuth } from './AuthContext';
import { useLocation } from 'react-router-dom';
import { refreshProviderConfig } from '../services/ai';

export interface PlanDetails {
  name: string;
  price: number;
  currency: string;
  billingCycle: string;
  features: string[];
  limits: { aiCallsPerDay: number; maxTransactions: number };
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
}

const AppContext = createContext<AppContextType | undefined>(undefined);

export const useApp = () => {
  const context = useContext(AppContext);
  if (!context) throw new Error('useApp must be used within an AppProvider');
  return context;
};

export const AppProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  // Hooks must always be at the top!
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

  // Plans config and user subscription states
  const [plansConfig, setPlansConfig] = useState<Record<string, PlanDetails>>(DEFAULT_PLANS);
  const [userPlan, setUserPlan] = useState<string>('standard');
  const [planExpiresAt, setPlanExpiresAt] = useState<Date | null>(null);

  // Load plans config in real time, merging with DEFAULT_PLANS to preserve code defaults & tier inheritance
  useEffect(() => {
    const unsubPlans = onSnapshot(doc(db, 'system', 'plans_config'), (docSnap) => {
      const firestorePlans = docSnap.exists() ? docSnap.data()?.plans || {} : {};

      const standardFeatures = new Set([
        ...(DEFAULT_PLANS.standard.features || []),
        ...(firestorePlans.standard?.features || [])
      ]);

      const proFeatures = new Set([
        ...standardFeatures,
        ...(DEFAULT_PLANS.pro.features || []),
        ...(firestorePlans.pro?.features || [])
      ]);

      const maxFeatures = new Set([
        ...proFeatures,
        ...(DEFAULT_PLANS.max.features || []),
        ...(firestorePlans.max?.features || [])
      ]);

      const merged: Record<string, PlanDetails> = {
        standard: {
          ...DEFAULT_PLANS.standard,
          ...(firestorePlans.standard || {}),
          features: Array.from(standardFeatures)
        },
        pro: {
          ...DEFAULT_PLANS.pro,
          ...(firestorePlans.pro || {}),
          features: Array.from(proFeatures)
        },
        max: {
          ...DEFAULT_PLANS.max,
          ...(firestorePlans.max || {}),
          features: Array.from(maxFeatures)
        }
      };

      // Retain any additional custom plans
      Object.keys(firestorePlans).forEach(k => {
        if (!merged[k]) {
          merged[k] = firestorePlans[k];
        }
      });

      setPlansConfig(merged);
    });
    return () => unsubPlans();
  }, []);

  useEffect(() => {
    if (!user) {
      setIsPro(false);
      setIsBanned(false);
      setDisabledFeatures([]);
      setUserPlan('standard');
      setPlanExpiresAt(null);
      return;
    }

    const unsubUser = onSnapshot(doc(db, 'registered_users', user.uid), (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        // Fallback to 'pro' if isPro is true but data.plan is missing
        const planName = data.plan || (data.isPro ? 'pro' : 'standard');
        setUserPlan(planName);
        setIsPro(planName !== 'standard' || !!data.isPro);
        setIsBanned(!!data.isBanned);
        setDisabledFeatures(data.disabledFeatures || []);

        // Sync user-specific Gemini API key from Firestore
        if (data.geminiApiKey) {
          localStorage.setItem('user_gemini_api_key', data.geminiApiKey);
        } else {
          localStorage.removeItem('user_gemini_api_key');
        }
        refreshProviderConfig();

        if (data.planExpiresAt) {
          const expiresDate = data.planExpiresAt.toDate();
          setPlanExpiresAt(expiresDate);
          
          // Auto downgrade if expired
          const now = new Date();
          if (expiresDate < now && planName !== 'standard') {
            updateDoc(doc(db, 'registered_users', user.uid), {
              plan: 'standard',
              planExpiresAt: null,
              planAssignedBy: 'expiry_daemon'
            }).catch(err => console.error('Failed to auto-downgrade expired plan:', err));
          }
        } else {
          setPlanExpiresAt(null);
        }
      }
    });

    const startTimestamp = Date.now();

    // 1. User-Specific notifications listener
    const qUser = query(
      collection(db, `users/${user.uid}/notifications`),
      orderBy('timestamp', 'desc'),
      limit(5)
    );
    const unsubUserNotifs = onSnapshot(qUser, (snapshot) => {
      snapshot.docChanges().forEach((change) => {
        if (change.type === 'added') {
          const data = change.doc.data();
          const msgTime = data.timestamp?.seconds ? data.timestamp.seconds * 1000 : Date.now();
          if (msgTime > startTimestamp && !data.read) {
            toast.info(data.message || 'New notification', {
              duration: 8000,
              action: {
                label: 'Dismiss',
                onClick: () => {
                  try {
                    updateDoc(doc(db, `users/${user.uid}/notifications`, change.doc.id), { read: true });
                  } catch (e) {
                    console.error(e);
                  }
                }
              }
            });
          }
        }
      });
    }, (err) => console.error('Error listening to user notifications:', err));

    // 2. Global Broadcast notifications listener
    const qGlobal = query(
      collection(db, 'broadcast_notifications'),
      orderBy('timestamp', 'desc'),
      limit(5)
    );
    const unsubGlobal = onSnapshot(qGlobal, (snapshot) => {
      snapshot.docChanges().forEach((change) => {
        if (change.type === 'added') {
          const data = change.doc.data();
          const msgTime = data.timestamp?.seconds ? data.timestamp.seconds * 1000 : Date.now();
          if (msgTime > startTimestamp) {
            toast.success(`📢 BROADCAST: ${data.message}`, {
              duration: 10000,
            });
          }
        }
      });
    }, (err) => console.error('Error listening to global broadcasts:', err));

    return () => {
      unsubUser();
      unsubUserNotifs();
      unsubGlobal();
    };
  }, [user]);

  useEffect(() => {
    const unsubscribe = onSnapshot(doc(db, 'system', 'global_config'), (doc) => {
      if (doc.exists()) {
        const newConfig = doc.data() as GlobalConfig;
        if (!newConfig.exchanges) {
          newConfig.exchanges = [
            { id: 'mexc', name: 'MEXC Global', logoUrl: '', enabled: true }
          ];
        }
        
        // Sync Fallback AI Configuration variables to localStorage
        if (newConfig.fallbackApiKey) {
          localStorage.setItem('fallback_gemini_api_key', newConfig.fallbackApiKey);
        } else {
          localStorage.removeItem('fallback_gemini_api_key');
        }
        if (newConfig.fallbackModelId) {
          localStorage.setItem('fallback_ai_model_id', newConfig.fallbackModelId);
        } else {
          localStorage.removeItem('fallback_ai_model_id');
        }
        if (newConfig.globalSystemInstruction) {
          localStorage.setItem('global_system_instruction', newConfig.globalSystemInstruction);
        } else {
          localStorage.removeItem('global_system_instruction');
        }

        refreshProviderConfig();
        setConfig(newConfig);
        setShowAnnouncement(true);
      }
      setIsLoading(false);
    }, (error) => {
      console.error('Failed to listen to global config:', error);
      setIsLoading(false);
    });

    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (config.emergencyMessage) setShowEmergency(true);
  }, [config.emergencyMessage]);

  // Maintenance Screen Logic
  const isInternalAdmin = localStorage.getItem('admin_authorized') === 'true';
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
          {config.announcement && (
            <div className="p-4 bg-muted rounded-2xl border border-border text-sm italic">
              "{config.announcement}"
            </div>
          )}
          <div className="pt-8 text-[10px] text-muted-foreground uppercase tracking-widest font-bold">
            System Version {config.version}
          </div>
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
            If you believe this is a mistake, please contact support.
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
      planLimits
    }}>
      {/* Emergency Modal */}
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

      {/* Global Announcement Banner */}
      {config.announcement && showAnnouncement && !config.maintenanceMode && (
        <div className="bg-amber-500/10 dark:bg-amber-950/30 text-amber-800 dark:text-amber-200 border-b border-amber-500/20 dark:border-amber-500/10 px-4 py-3 relative z-[100] animate-in slide-in-from-top duration-300">
          <div className="max-w-4xl mx-auto flex items-start gap-3 pr-8">
            <Info size={18} className="shrink-0 mt-0.5 text-amber-600 dark:text-amber-400" />
            <p className="text-xs font-medium leading-relaxed whitespace-pre-wrap">
              {(() => {
                const text = config.announcement;
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
                        className="underline hover:opacity-85 font-bold transition-colors ml-1 mr-1 text-amber-950 dark:text-amber-100"
                      >
                        {linkMatch[1]}
                      </a>
                    );
                  }
                  return part;
                });
              })()}
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
