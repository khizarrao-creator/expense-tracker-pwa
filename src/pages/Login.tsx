import React from 'react';
import { useAuth } from '../contexts/AuthContext';
import { Navigate } from 'react-router-dom';
import { Layers, LogIn, UserX } from 'lucide-react';
import { useApp } from '../contexts/AppContext';

const Login: React.FC = () => {
  const { user, signInWithGoogle } = useAuth();
  const { config } = useApp();

  if (user) {
    return <Navigate to="/" replace />;
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-6">
      <div className="bg-card w-full max-w-md p-8 rounded-2xl border border-border shadow-sm">
        {/* Brand & Logo */}
        <div className="flex flex-col items-center mb-8">
          <div className="bg-secondary text-foreground p-3.5 rounded-xl mb-4 border border-border/40">
            <Layers size={28} strokeWidth={1.75} />
          </div>
          <h1 className="text-2xl font-bold text-foreground tracking-tight">The Base</h1>
          <p className="text-muted-foreground mt-2 text-center text-xs font-normal max-w-xs leading-relaxed">
            Unified executive workspace for Ledger, Work & Communications.
          </p>
        </div>

        {/* Auth Actions */}
        {!config.allowSignups ? (
          <div className="bg-destructive/10 border border-destructive/25 p-4 rounded-xl flex items-start gap-3">
            <UserX className="text-destructive shrink-0 mt-0.5" size={18} />
            <p className="text-xs text-destructive/80 leading-relaxed font-normal">
              New registrations are closed by the administrator. Only existing users can sign in.
            </p>
          </div>
        ) : (
          <button
            onClick={signInWithGoogle}
            className="w-full flex justify-center items-center gap-3 bg-primary text-primary-foreground py-3 px-4 rounded-xl font-medium hover:bg-primary/95 transition-all active:scale-[0.98] text-xs"
          >
            <LogIn size={16} strokeWidth={2} />
            Continue with Google
          </button>
        )}

        {/* Footer info */}
        <div className="mt-8 text-center border-t border-border/60 pt-6">
          <p className="text-[11px] text-muted-foreground leading-normal max-w-xs mx-auto">
            Syncing runs securely in the background. By continuing, you agree to the Terms of Service & Privacy Policy.
          </p>
        </div>
      </div>
    </div>
  );
};

export default Login;
