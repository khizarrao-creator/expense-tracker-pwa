import React, { createContext, useContext, useEffect, useState } from 'react';
import * as XLSX from 'xlsx';
import { db } from '../firebase';
import { doc, onSnapshot } from 'firebase/firestore';
import { ShieldAlert, Info, X, AlertTriangle } from 'lucide-react';
import { useAuth } from './AuthContext';
import { useLocation } from 'react-router-dom';

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

interface AppContextType {
  config: GlobalConfig;
  isLoading: boolean;
  isPro: boolean;
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
  const [isLoading, setIsLoading] = useState(true);
  const [isPro, setIsPro] = useState(false);
  const [isBanned, setIsBanned] = useState(false);
  const [showAnnouncement, setShowAnnouncement] = useState(true);
  const [showEmergency, setShowEmergency] = useState(true);
  const { user } = useAuth();
  const location = useLocation();

  useEffect(() => {
    if (!user) {
      setIsPro(false);
      setIsBanned(false);
      return;
    }

    const unsubUser = onSnapshot(doc(db, 'registered_users', user.uid), (doc) => {
      if (doc.exists()) {
        const data = doc.data();
        setIsPro(!!data.isPro);
        setIsBanned(!!data.isBanned);
      }
    });

    return () => unsubUser();
  }, [user]);

  useEffect(() => {
    const unsubscribe = onSnapshot(doc(db, 'system', 'global_config'), (doc) => {
      if (doc.exists()) {
        const newConfig = doc.data() as GlobalConfig;
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

  return (
    <AppContext.Provider value={{ config, isLoading, isPro }}>
      {/* Emergency Modal */}
      {config.emergencyMessage && showEmergency && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-300">
          <div className="bg-card w-full max-w-sm rounded-3xl p-8 border border-border shadow-2xl space-y-6 text-center animate-in zoom-in duration-300">
            <div className="w-20 h-20 bg-rose-500/20 text-rose-500 rounded-full flex items-center justify-center mx-auto">
              <AlertTriangle size={40} />
            </div>
            <div className="space-y-2">
              <h2 className="text-2xl font-bold text-rose-500">Emergency Alert</h2>
              <p className="text-muted-foreground leading-relaxed">
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
        <div className="bg-primary text-primary-foreground px-4 py-2.5 relative z-[100] animate-in slide-in-from-top duration-300">
          <div className="max-w-4xl mx-auto flex items-center gap-3 pr-8">
            <Info size={18} className="shrink-0" />
            <p className="text-xs font-medium leading-tight">{config.announcement}</p>
          </div>
          <button
            onClick={() => setShowAnnouncement(false)}
            className="absolute right-2 top-1/2 -translate-y-1/2 p-1 hover:bg-white/20 rounded-full transition-colors"
          >
            <X size={16} />
          </button>
        </div>
      )}
      {children}
    </AppContext.Provider>
  );
};
