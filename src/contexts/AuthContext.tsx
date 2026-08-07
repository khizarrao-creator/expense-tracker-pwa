import React, { createContext, useContext, useEffect, useState } from 'react';
import { AlertCircle } from 'lucide-react';
import type { ReactNode } from 'react';
import {
  onAuthStateChanged,
  signInWithPopup,
  GoogleAuthProvider,
  signOut as firebaseSignOut
} from 'firebase/auth';
import type { User } from 'firebase/auth';
import { auth } from '../firebase';
import { syncManager } from '../db/SyncManager';
import { clearDB } from '../db/sqlite';
import { supabase, isSupabaseConfigured } from '../supabase';

import { userMigrationSyncManager } from '../services/UserMigrationSyncManager';
import { toast } from 'sonner';

interface AuthContextType {
  user: User | null;
  isPro: boolean;
  loading: boolean;
  isSimulating: boolean;
  isReadOnly: boolean;
  setIsReadOnly: (val: boolean) => void;
  signInWithGoogle: () => Promise<void>;
  signOut: () => Promise<void>;
  exitSimulation: () => void;
  switchSimulatedUser: (id: string, email: string) => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  isPro: false,
  loading: true,
  isSimulating: false,
  isReadOnly: true,
  setIsReadOnly: () => { },
  signInWithGoogle: async () => { },
  signOut: async () => { },
  exitSimulation: () => { },
  switchSimulatedUser: async () => { }
});

export const useAuth = () => useContext(AuthContext);

export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [isPro, setIsPro] = useState(false);
  const [loading, setLoading] = useState(true);
  const [isSimulating, setIsSimulating] = useState(false);
  const [isReadOnly, setIsReadOnlyState] = useState<boolean>(() => {
    return localStorage.getItem('simulated_read_only') !== 'false';
  });
  const [allUsers, setAllUsers] = useState<Array<{ id: string; email: string; display_name: string | null }>>([]);

  const setIsReadOnly = (val: boolean) => {
    localStorage.setItem('simulated_read_only', val ? 'true' : 'false');
    setIsReadOnlyState(val);
    if (val) {
      toast.info('🔒 Read-Only Safeguard Enabled (Mutations disabled)');
    } else {
      toast.warning('⚠️ Read-Only Safeguard Disabled (Mutations allowed)');
    }
  };

  const exitSimulation = () => {
    localStorage.removeItem('simulated_user_id');
    localStorage.removeItem('simulated_user_email');
    localStorage.removeItem('simulated_read_only');
    setIsSimulating(false);
    window.location.href = '/admin';
  };

  const switchSimulatedUser = async (targetId: string, targetEmail: string) => {
    localStorage.setItem('simulated_user_id', targetId);
    localStorage.setItem('simulated_user_email', targetEmail);
    toast.info(`Switching simulation to ${targetEmail}... Loading data.`);

    try {
      await userMigrationSyncManager.syncUserData(targetId, targetEmail);
      await syncManager.pullInitialDataForUser(targetId);
    } catch (e) { }

    window.location.reload();
  };

  // Fetch list of users for dropdown when in simulation mode
  useEffect(() => {
    if (isSimulating && isSupabaseConfigured) {
      supabase.from('users').select('id, email, display_name').order('email', { ascending: true })
        .then(({ data }) => {
          if (data && data.length > 0) {
            setAllUsers(data);
          }
        });
    }
  }, [isSimulating]);

  useEffect(() => {
    // Check if simulating a user session from Admin Panel
    const simulatedUid = localStorage.getItem('simulated_user_id');
    const simulatedEmail = localStorage.getItem('simulated_user_email');

    if (simulatedUid) {
      const mockUser = {
        uid: simulatedUid,
        email: simulatedEmail || 'simulated@user.com',
        displayName: simulatedEmail ? simulatedEmail.split('@')[0] : 'Simulated User',
        photoURL: null,
        emailVerified: true,
        isAnonymous: false,
        metadata: {},
        providerData: [],
        refreshToken: '',
        tenantId: null,
        delete: async () => {},
        getIdToken: async () => '',
        getIdTokenResult: async () => ({} as any),
        reload: async () => {},
        toJSON: () => ({})
      } as unknown as User;

      setUser(mockUser);
      setIsSimulating(true);
      setLoading(false);

      if (isSupabaseConfigured) {
        supabase.from('users').select('is_pro, plan').eq('id', simulatedUid).maybeSingle()
          .then(({ data }) => {
            if (data) setIsPro(data.is_pro || data.plan !== 'standard');
          });
      }
      return;
    }

    if (!auth) {
      setLoading(false);
      return;
    }

    let userSubscription: any = null;

    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      setUser(currentUser);

      if (currentUser && isSupabaseConfigured) {
        // 1. Fetch initial user profile from Supabase
        const { data: userProfile } = await supabase
          .from('users')
          .select('is_pro, plan')
          .eq('id', currentUser.uid)
          .maybeSingle();

        if (userProfile) {
          setIsPro(userProfile.is_pro || userProfile.plan !== 'standard');
        }

        // Realtime subscription for user profile changes
        userSubscription = supabase
          .channel(`user-profile-${currentUser.uid}`)
          .on(
            'postgres_changes',
            {
              event: '*',
              schema: 'public',
              table: 'users',
              filter: `id=eq.${currentUser.uid}`,
            },
            (payload: any) => {
              if (payload.new) {
                setIsPro(payload.new.is_pro || payload.new.plan !== 'standard');
              }
            }
          )
          .subscribe();

        // 2. Register/Update user info in Supabase users table
        try {
          let ip = 'Unknown';
          try {
            const response = await fetch('https://api.ipify.org?format=json');
            const data = await response.json();
            ip = data.ip;
          } catch (e) { }

          const userPayload = {
            id: currentUser.uid,
            email: currentUser.email || '',
            display_name: currentUser.displayName || null,
            photo_url: currentUser.photoURL || null,
            last_login: new Date().toISOString(),
            last_ip: ip,
            updated_at: new Date().toISOString()
          };
          const { error } = await supabase.from('users').upsert(userPayload, { onConflict: 'id' });
          if (error && error.code === '23503') {
            await supabase.from('plans').upsert({
              id: 'standard',
              name: 'Standard',
              price: 0,
              currency: 'PKR',
              billing_cycle: 'forever',
              features: ['transactions', 'accounts', 'categories', 'dashboard', 'goals', 'reminders', 'calculator', 'converter', 'tasks', 'loans', 'events', 'fuel', 'reports', 'subscriptions', 'projects'],
              limits: { aiCallsPerDay: 0, maxTransactions: 10000, maxUploadsPerDay: 0 },
              badge_icon: 'shield',
              badge_color: '#6B7280',
              display_order: 1
            }, { onConflict: 'id' });
            await supabase.from('users').upsert(userPayload, { onConflict: 'id' });
          }
        } catch (e) {
          console.warn('Failed to register user in directory:', e);
        }
      } else {
        setIsPro(false);
        if (userSubscription) {
          supabase.removeChannel(userSubscription);
          userSubscription = null;
        }
      }

      setLoading(false);
    });

    return () => {
      unsubscribe();
      if (userSubscription) supabase.removeChannel(userSubscription);
    };
  }, []);

  const signInWithGoogle = async () => {
    const provider = new GoogleAuthProvider();
    await signInWithPopup(auth, provider);
  };

  const signOut = async () => {
    if (isSimulating) {
      exitSimulation();
      return;
    }
    if (auth) {
      try {
        await syncManager.processQueue();
      } catch (e) {
        console.warn('Final sync before signout failed:', e);
      }

      await firebaseSignOut(auth);
      await clearDB();
    }
  };

  if (!auth && !loading && !isSimulating) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-background text-foreground p-6">
        <div className="bg-destructive/10 text-destructive p-6 rounded-2xl max-w-lg w-full text-center space-y-4">
          <div className="flex justify-center mb-4">
            <AlertCircle size={48} />
          </div>
          <h2 className="text-xl font-bold">Firebase Configuration Missing</h2>
          <p className="text-sm">
            Please add your Firebase configuration to your environment variables
            (e.g., <code>.env</code> file) to continue using the application.
          </p>
        </div>
      </div>
    );
  }

  return (
    <AuthContext.Provider value={{ user, isPro, loading, isSimulating, isReadOnly, setIsReadOnly, signInWithGoogle, signOut, exitSimulation, switchSimulatedUser }}>
      {loading ? (
        <div className="flex h-screen items-center justify-center bg-background text-foreground">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
        </div>
      ) : (
        <>
          {isSimulating && (
            <div className="bg-muted border-b border-border text-foreground px-4 py-2 text-xs font-semibold flex flex-wrap items-center justify-between gap-2 z-50 sticky top-0">
              <div className="flex items-center gap-3">
                <span className="bg-primary/10 text-primary px-2.5 py-0.5 rounded-md uppercase text-[10px] font-bold tracking-wider border border-primary/20 shrink-0">
                  Simulation Mode
                </span>
                
                {/* Quick User Switcher Dropdown */}
                <div className="flex items-center gap-1.5">
                  <span className="text-muted-foreground hidden sm:inline">Active User:</span>
                  <select
                    value={user?.uid}
                    onChange={(e) => {
                      const selUser = allUsers.find(u => u.id === e.target.value);
                      if (selUser) {
                        switchSimulatedUser(selUser.id, selUser.email);
                      }
                    }}
                    className="bg-card border border-border text-foreground font-mono text-xs rounded-lg px-2.5 py-1 focus:outline-none focus:ring-1 focus:ring-primary cursor-pointer max-w-[200px] sm:max-w-[260px] truncate"
                  >
                    <option value={user?.uid}>{user?.email} (Active)</option>
                    {allUsers.filter(u => u.id !== user?.uid).map(u => (
                      <option key={u.id} value={u.id}>
                        {u.email}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="flex items-center gap-2">
                {/* Read-Only Safeguard Toggle */}
                <button
                  onClick={() => setIsReadOnly(!isReadOnly)}
                  className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all flex items-center gap-1 border ${
                    isReadOnly
                      ? 'bg-amber-500/10 text-amber-500 border-amber-500/30'
                      : 'bg-emerald-500/10 text-emerald-500 border-emerald-500/30'
                  }`}
                  title={isReadOnly ? 'Mutations are disabled' : 'Mutations are allowed'}
                >
                  {isReadOnly ? '🔒 Read-Only: ON' : '✏️ Read-Only: OFF'}
                </button>

                <button
                  onClick={exitSimulation}
                  className="bg-card hover:bg-muted border border-border px-3 py-1 rounded-lg text-foreground font-semibold transition-all text-xs"
                >
                  Exit Simulation
                </button>
              </div>
            </div>
          )}
          {children}
        </>
      )}
    </AuthContext.Provider>
  );
};
