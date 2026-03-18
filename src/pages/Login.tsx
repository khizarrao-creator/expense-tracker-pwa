import React from 'react';
import { useAuth } from '../contexts/AuthContext';
import { Navigate } from 'react-router-dom';
import { Wallet, LogIn } from 'lucide-react';

const Login: React.FC = () => {
  const { user, signInWithGoogle } = useAuth();

  if (user) {
    return <Navigate to="/" replace />;
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4 relative overflow-hidden">
      {/* Background decorations */}
      <div className="absolute top-0 right-0 -m-32 w-96 h-96 rounded-full bg-primary/10 blur-3xl shadow-xl z-0"></div>
      <div className="absolute bottom-0 left-0 -m-32 w-80 h-80 rounded-full bg-secondary/30 blur-3xl z-0"></div>

      <div className="bg-card w-full max-w-md p-8 rounded-2xl shadow-2xl border border-border z-10">
        <div className="flex flex-col items-center mb-8">
          <div className="bg-primary/10 p-4 rounded-full mb-4">
            <Wallet size={48} className="text-primary" />
          </div>
          <h1 className="text-3xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-primary to-accent tracking-tight">Ledger</h1>
          <p className="text-muted-foreground mt-2 text-center text-sm font-medium">
            Elite financial tracking.<br />Secure, offline, always available.
          </p>
        </div>

        <button
          onClick={signInWithGoogle}
          className="w-full flex justify-center items-center gap-3 bg-primary text-primary-foreground py-3 px-4 rounded-xl font-semibold hover:bg-primary/90 transition-all shadow-md active:scale-95 group"
        >
          <div className="bg-primary-foreground/20 p-1.5 rounded-full group-hover:bg-primary-foreground/30 transition-colors">
            <LogIn size={20} className="" />
          </div>
          Continue with Google
        </button>

        <div className="mt-8 text-center">
          <p className="text-xs text-muted-foreground">
            By signing in, you agree to our Terms of Service and Privacy Policy. Syncing starts automatically.
          </p>
        </div>
      </div>
    </div>
  );
};

export default Login;
