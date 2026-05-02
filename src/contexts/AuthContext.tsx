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
import { doc, setDoc } from 'firebase/firestore';
import { db as firestore } from '../firebase';

interface AuthContextType {
  user: User | null;
  loading: boolean;
  signInWithGoogle: () => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  loading: true,
  signInWithGoogle: async () => {},
  signOut: async () => {},
});

export const useAuth = () => useContext(AuthContext);

export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!auth) {
      setLoading(false);
      return;
    }

    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      setUser(currentUser);
      setLoading(false);

      if (currentUser) {
        // Register user in global directory for admin
        try {
          // Fetch IP address
          let ip = 'Unknown';
          try {
            const response = await fetch('https://api.ipify.org?format=json');
            const data = await response.json();
            ip = data.ip;
          } catch (e) {}

          await setDoc(doc(firestore, 'registered_users', currentUser.uid), {
            email: currentUser.email,
            displayName: currentUser.displayName,
            photoURL: currentUser.photoURL,
            lastLogin: new Date().toISOString(),
            lastIP: ip
          }, { merge: true });
        } catch (e) {
          console.warn('Failed to register user in admin directory:', e);
        }
      }
    });

    return () => unsubscribe();
  }, []);

  const signInWithGoogle = async () => {
    const provider = new GoogleAuthProvider();
    await signInWithPopup(auth, provider);
  };

  const signOut = async () => {
    if (auth) {
      try {
        // Attempt one final sync before wiping everything
        await syncManager.processQueue();
      } catch (e) {
        console.warn('Final sync before signout failed:', e);
      }
      
      await firebaseSignOut(auth);
      await clearDB();
    }
  };

  // No Firebase config: show error before mounting any children
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
          <div className="text-left bg-background/50 p-4 rounded-lg mt-4 text-xs font-mono break-all">
            VITE_FIREBASE_API_KEY=...<br/>
            VITE_FIREBASE_AUTH_DOMAIN=...<br/>
            VITE_FIREBASE_PROJECT_ID=...
          </div>
        </div>
      </div>
    );
  }

  // Always render children so nested providers (SQLite, Sync, etc.) can initialize
  // in parallel with auth resolution. Show a spinner overlay while auth is pending.
  return (
    <AuthContext.Provider value={{ user, loading, signInWithGoogle, signOut }}>
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
