import React from 'react';
import { useAuth } from '../contexts/AuthContext';
import { Navigate } from 'react-router-dom';
import { LogIn, UserX, Layers, Wallet, Briefcase, MessageSquare, Sparkles, ShieldCheck } from 'lucide-react';
import { useApp } from '../contexts/AppContext';

const Login: React.FC = () => {
  const { user, signInWithGoogle } = useAuth();
  const { config } = useApp();

  if (user) {
    return <Navigate to="/" replace />;
  }

  return (
    <div className="min-h-screen relative flex items-center justify-center bg-background p-4 sm:p-6 overflow-hidden">
      {/* Dynamic Background Glows */}
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] bg-primary/10 rounded-full blur-[120px] pointer-events-none" />
      <div className="absolute bottom-10 right-10 w-[300px] h-[300px] bg-emerald-500/10 rounded-full blur-[100px] pointer-events-none" />
      <div className="absolute top-10 left-10 w-[300px] h-[300px] bg-indigo-500/10 rounded-full blur-[100px] pointer-events-none" />

      <div className="relative w-full max-w-md">
        {/* Brand Header */}
        <div className="text-center mb-6 space-y-3">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-gradient-to-br from-primary/20 via-primary/10 to-emerald-500/20 border border-primary/30 text-primary shadow-xl backdrop-blur-md mb-2">
            <Layers size={28} className="animate-pulse" />
          </div>
          <div className="space-y-1">
            <span className="text-[10px] font-extrabold uppercase tracking-widest text-primary font-mono bg-primary/10 px-2.5 py-1 rounded-full border border-primary/20">
              Executive Command Center
            </span>
            <h1 className="text-3xl font-black text-foreground tracking-tight">THE BASE</h1>
          </div>
          <p className="text-xs text-muted-foreground max-w-sm mx-auto leading-relaxed">
            The unified workspace powering your financials, project execution, and client communications.
          </p>
        </div>

        {/* Main Card */}
        <div className="bg-card/80 backdrop-blur-xl p-6 sm:p-8 rounded-3xl border border-border/80 shadow-2xl space-y-6">
          {/* Module Feature Pillars */}
          <div className="grid grid-cols-3 gap-2">
            <div className="p-3 rounded-2xl bg-muted/40 border border-border/40 text-center space-y-1">
              <div className="w-7 h-7 rounded-xl bg-emerald-500/10 text-emerald-500 flex items-center justify-center mx-auto">
                <Wallet size={15} />
              </div>
              <span className="block text-[11px] font-extrabold text-foreground">Ledger</span>
              <span className="block text-[9px] text-muted-foreground">Financials</span>
            </div>
            <div className="p-3 rounded-2xl bg-muted/40 border border-border/40 text-center space-y-1">
              <div className="w-7 h-7 rounded-xl bg-blue-500/10 text-blue-500 flex items-center justify-center mx-auto">
                <Briefcase size={15} />
              </div>
              <span className="block text-[11px] font-extrabold text-foreground">Work</span>
              <span className="block text-[9px] text-muted-foreground">Projects</span>
            </div>
            <div className="p-3 rounded-2xl bg-muted/40 border border-border/40 text-center space-y-1">
              <div className="w-7 h-7 rounded-xl bg-indigo-500/10 text-indigo-500 flex items-center justify-center mx-auto">
                <MessageSquare size={15} />
              </div>
              <span className="block text-[11px] font-extrabold text-foreground">Comms</span>
              <span className="block text-[9px] text-muted-foreground">WhatsApp</span>
            </div>
          </div>

          {/* AI Banner */}
          <div className="p-3 rounded-2xl bg-gradient-to-r from-primary/10 via-primary/5 to-emerald-500/10 border border-primary/20 flex items-center gap-3">
            <div className="w-8 h-8 rounded-xl bg-primary/20 text-primary flex items-center justify-center shrink-0">
              <Sparkles size={16} />
            </div>
            <div className="text-left text-xs">
              <span className="font-extrabold text-foreground block text-[11px]">AI Copilot Operating System</span>
              <span className="text-muted-foreground text-[10px]">Contextual intelligence throughout all 3 modules.</span>
            </div>
          </div>

          {/* Auth Action Button */}
          {!config.allowSignups ? (
            <div className="bg-destructive/10 border border-destructive/25 p-4 rounded-2xl flex items-start gap-3">
              <UserX className="text-destructive shrink-0 mt-0.5" size={18} />
              <p className="text-xs text-destructive/90 leading-relaxed font-medium">
                New registrations are temporarily closed by the system administrator. Only authorized members can sign in.
              </p>
            </div>
          ) : (
            <button
              onClick={signInWithGoogle}
              className="w-full flex justify-center items-center gap-3 bg-primary text-primary-foreground py-3.5 px-5 rounded-2xl font-bold hover:bg-primary/95 transition-all shadow-lg hover:shadow-primary/20 active:scale-[0.98] text-sm"
            >
              <LogIn size={18} strokeWidth={2.5} />
              Continue with Google Account
            </button>
          )}

          {/* Footer Security Note */}
          <div className="pt-2 text-center space-y-2 border-t border-border/50">
            <div className="inline-flex items-center gap-1.5 text-[10px] font-mono text-emerald-500 bg-emerald-500/10 px-2.5 py-0.5 rounded-full border border-emerald-500/20">
              <ShieldCheck size={12} />
              Offline-First PWA • Dual Cloud Sync
            </div>
            <p className="text-[10px] text-muted-foreground leading-normal max-w-xs mx-auto">
              Protected by Enterprise End-to-End Encryption. By continuing, you agree to our Terms & Privacy Policy.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Login;
