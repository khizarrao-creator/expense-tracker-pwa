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

interface AuthContextType {
  user: User | null;
  isPro: boolean;
  loading: boolean;
  signInWithGoogle: () => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  isPro: false,
  loading: true,
  signInWithGoogle: async () => { },
  signOut: async () => { },
});

export const useAuth = () => useContext(AuthContext);

export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [isPro, setIsPro] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
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

          await supabase.from('users').upsert({
            id: currentUser.uid,
            email: currentUser.email || '',
            display_name: currentUser.displayName || null,
            photo_url: currentUser.photoURL || null,
            last_login: new Date().toISOString(),
            last_ip: ip,
            updated_at: new Date().toISOString()
          }, { onConflict: 'id' });
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

  if (!auth && !loading) {
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
    <AuthContext.Provider value={{ user, isPro, loading, signInWithGoogle, signOut }}>
      {loading ? (
        <div className="flex h-screen items-center justify-center bg-background text-foreground">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
        </div>
      ) : (
        children
      )}
    </AuthContext.Provider>
  );
};
