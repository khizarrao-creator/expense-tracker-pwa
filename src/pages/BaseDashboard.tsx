import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { executeQuery } from '../db/sqlite';
import { getNetWorth, getMonthlyComparison, getTransactions } from '../db/queries';
import { useAuth } from '../contexts/AuthContext';
import { useCurrency } from '../contexts/CurrencyContext';
import { supabase, isSupabaseConfigured } from '../supabase';
import {
  Landmark,
  Briefcase,
  MessageSquare,
  Sparkles,
  ArrowUpRight,
  ArrowDownRight,
  FolderKanban,
  CheckSquare,
  Send,
  Plus,
  ChevronRight,
  LayoutDashboard,
  Eye,
  EyeOff
} from 'lucide-react';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { useApp } from '../contexts/AppContext';

export const BaseDashboard: React.FC = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { formatAmount } = useCurrency();

  const { isPrivacyMode, togglePrivacyMode } = useApp();

  // Metrics State
  const [totalBalance, setTotalBalance] = useState<number>(0);
  const [monthlyIncome, setMonthlyIncome] = useState<number>(0);
  const [monthlyExpense, setMonthlyExpense] = useState<number>(0);
  const [activeProjectsCount, setActiveProjectsCount] = useState<number>(0);
  const [pendingTasksCount, setPendingTasksCount] = useState<number>(0);
  const [unpaidLoansAmount, setUnpaidLoansAmount] = useState<number>(0);
  const [recentTransactions, setRecentTransactions] = useState<any[]>([]);
  const [recentProjects, setRecentProjects] = useState<any[]>([]);
  const [aiPromptInput, setAiPromptInput] = useState<string>('');

  const loadBaseDashboardData = async () => {
    try {
      // 1. Ledger Net Worth & Monthly Comparison using established db queries
      const [nw, comp, txs] = await Promise.all([
        getNetWorth(),
        getMonthlyComparison(),
        getTransactions(5)
      ]);

      setTotalBalance(nw || 0);
      setMonthlyIncome(comp?.current_income || 0);
      setMonthlyExpense(comp?.current_expense || 0);
      setRecentTransactions(txs || []);

      // 2. Work / Projects (Fetch from Supabase & SQLite)
      let projList: any[] = [];
      let totalProjects = 0;

      if (user && isSupabaseConfigured) {
        try {
          const { data: memberRows } = await supabase.from('project_members').select('project_id').eq('user_id', user.uid);
          const memberProjIds = (memberRows || []).map((r: any) => r.project_id);
          if (memberProjIds.length > 0) {
            const { data: projs, count } = await supabase
              .from('projects')
              .select('*', { count: 'exact' })
              .in('id', memberProjIds)
              .order('updated_at', { ascending: false });
            if (projs && projs.length > 0) {
              projList = projs;
              totalProjects = count || projs.length;
            }
          }
        } catch (se) {
          console.warn('[BaseDashboard] Supabase projects load notice:', se);
        }
      }

      if (projList.length === 0) {
        try {
          const localProjs = await executeQuery(`SELECT * FROM projects ORDER BY rowid DESC`);
          if (localProjs && localProjs.length > 0) {
            projList = localProjs;
            totalProjects = localProjs.length;
          }
        } catch (pe) {}
      }

      setRecentProjects(projList.slice(0, 3));
      setActiveProjectsCount(totalProjects);

      // 3. Work / Tasks
      try {
        const taskRes = await executeQuery(`SELECT COUNT(*) as count FROM tasks WHERE status NOT IN ('completed', 'done')`);
        setPendingTasksCount(taskRes[0]?.count || 0);
      } catch (te) {
        setPendingTasksCount(0);
      }

      // 4. Operations / Loans
      try {
        const loanRes = await executeQuery(`SELECT SUM(amount - COALESCE(paid_amount, 0)) as total FROM loans WHERE status != 'closed'`);
        setUnpaidLoansAmount(loanRes[0]?.total || 0);
      } catch (le) {
        setUnpaidLoansAmount(0);
      }
    } catch (e) {
      console.error('[BaseDashboard] Error loading dashboard data:', e);
    }
  };

  useEffect(() => {
    loadBaseDashboardData();
    window.addEventListener('app-sync-complete', loadBaseDashboardData);
    return () => window.removeEventListener('app-sync-complete', loadBaseDashboardData);
  }, []);

  const handleQuickAiPrompt = (e: React.FormEvent) => {
    e.preventDefault();
    if (!aiPromptInput.trim()) return;
    const prompt = aiPromptInput.trim();
    setAiPromptInput('');
    navigate(`/ai?prompt=${encodeURIComponent(prompt)}`);
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Hero Welcome */}
      <div className="p-6 md:p-8 rounded-2xl bg-card border border-border/80 shadow-sm">
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <div>
            <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-1">
              The Base Command Center
            </p>
            <h1 className="text-2xl md:text-3xl font-black tracking-tight text-foreground">
              Welcome back, {user?.displayName || 'User'}
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Your unified executive summary across finance, work, and communications.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              onClick={() => navigate('/ledger/overview')}
              className="gap-2 font-bold bg-card text-xs"
            >
              <LayoutDashboard size={14} />
              Ledger Overview
            </Button>
            <Button
              variant="primary"
              onClick={() => navigate('/add')}
              className="gap-2 font-bold shadow-md text-xs"
            >
              <Plus size={14} />
              Add Record
            </Button>
          </div>
        </div>
      </div>

      {/* 3 Module Pillars */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Pillar 1: Ledger */}
        <Card
          onClick={() => navigate('/ledger/overview')}
          className="p-5 rounded-2xl border-border/80 hover:border-primary/50 transition-all duration-200 cursor-pointer group hover:shadow-md bg-card"
        >
          <div className="flex items-center justify-between mb-3">
            <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Ledger · Net Worth</span>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  togglePrivacyMode();
                }}
                title={isPrivacyMode ? "Show values" : "Blur values"}
                className="p-1 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
              >
                {isPrivacyMode ? <EyeOff size={14} /> : <Eye size={14} />}
              </button>
              <div className="p-2 rounded-xl bg-primary/10 text-primary group-hover:scale-110 transition-transform">
                <Landmark size={16} />
              </div>
            </div>
          </div>
          <div className={`text-2xl font-black font-mono text-foreground ${isPrivacyMode ? 'blur-md select-none transition-all duration-300 hover:blur-none' : ''}`}>
            {formatAmount(totalBalance)}
          </div>
          <div className="mt-3 flex items-center justify-between text-xs text-muted-foreground border-t border-border/40 pt-2.5">
            <span className={`flex items-center gap-1 text-emerald-500 font-bold ${isPrivacyMode ? 'blur-sm select-none transition-all duration-300 hover:blur-none' : ''}`}>
              <ArrowUpRight size={13} /> {formatAmount(monthlyIncome)}
            </span>
            <span className={`flex items-center gap-1 text-rose-500 font-bold ${isPrivacyMode ? 'blur-sm select-none transition-all duration-300 hover:blur-none' : ''}`}>
              <ArrowDownRight size={13} /> {formatAmount(monthlyExpense)}
            </span>
          </div>
        </Card>

        {/* Pillar 2: Work */}
        <Card
          onClick={() => navigate('/work/projects')}
          className="p-5 rounded-2xl border-border/80 hover:border-indigo-500/50 transition-all duration-200 cursor-pointer group hover:shadow-md bg-card"
        >
          <div className="flex items-center justify-between mb-3">
            <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Work Management</span>
            <div className="p-2 rounded-xl bg-indigo-500/10 text-indigo-500 group-hover:scale-110 transition-transform">
              <Briefcase size={16} />
            </div>
          </div>
          <div className="text-2xl font-black font-mono text-foreground">{activeProjectsCount} Projects</div>
          <div className="mt-3 flex items-center justify-between text-xs text-muted-foreground border-t border-border/40 pt-2.5">
            <span className="font-semibold">{pendingTasksCount} tasks pending</span>
            <ChevronRight size={14} className="group-hover:translate-x-1 transition-transform text-indigo-500" />
          </div>
        </Card>

        {/* Pillar 3: Communications */}
        <Card
          onClick={() => navigate('/comms/whatsapp')}
          className="p-5 rounded-2xl border-border/80 hover:border-emerald-500/50 transition-all duration-200 cursor-pointer group hover:shadow-md bg-card"
        >
          <div className="flex items-center justify-between mb-3">
            <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Communications</span>
            <div className="p-2 rounded-xl bg-emerald-500/10 text-emerald-500 group-hover:scale-110 transition-transform">
              <MessageSquare size={16} />
            </div>
          </div>
          <div className="text-2xl font-black text-foreground">WhatsApp</div>
          <div className="mt-3 flex items-center justify-between text-xs text-muted-foreground border-t border-border/40 pt-2.5">
            <span className="font-semibold">Copilot Ready</span>
            <ChevronRight size={14} className="group-hover:translate-x-1 transition-transform text-emerald-500" />
          </div>
        </Card>
      </div>

      {/* AI Copilot — Cross-cutting intelligence layer */}
      <Card className="p-5 rounded-2xl border-primary/20 bg-card shadow-sm">
        <form onSubmit={handleQuickAiPrompt} className="flex flex-col md:flex-row items-center gap-3">
          <div className="flex items-center gap-3 flex-1 w-full">
            <div className="p-2.5 rounded-xl bg-primary/10 text-primary shrink-0">
              <Sparkles size={18} />
            </div>
            <div className="flex-1">
              <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-1">AI Copilot · Intelligence Layer</p>
              <input
                type="text"
                value={aiPromptInput}
                onChange={e => setAiPromptInput(e.target.value)}
                placeholder="Ask anything — 'Summarize my spending', 'What tasks need attention?'..."
                className="w-full bg-transparent border-none outline-none text-sm text-foreground placeholder:text-muted-foreground font-medium"
              />
            </div>
          </div>
          <Button type="submit" variant="primary" className="gap-2 shrink-0 font-bold w-full md:w-auto text-xs">
            <Send size={13} />
            Ask AI
          </Button>
        </form>
      </Card>

      {/* Combined Grid: Recent Activity + Quick Links */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left 2 Columns: Recent Transactions */}
        <div className="lg:col-span-2 space-y-6">
          <Card className="p-5 rounded-2xl border-border/80">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-bold text-foreground flex items-center gap-2">
                <Landmark size={16} className="text-primary" />
                Recent Ledger Activity
              </h3>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => navigate('/ledger/transactions')}
                className="gap-1 text-[11px] font-bold text-primary"
              >
                View All <ChevronRight size={13} />
              </Button>
            </div>

            {recentTransactions.length === 0 ? (
              <div className="py-8 text-center text-muted-foreground text-xs font-medium">
                No transactions yet. Add your first record to get started.
              </div>
            ) : (
              <div className="divide-y divide-border/50">
                {recentTransactions.map(tx => (
                  <div key={tx.id} className="py-2.5 flex items-center justify-between first:pt-0 last:pb-0">
                    <div className="flex items-center gap-3">
                      <div className={`p-2 rounded-lg text-xs ${tx.type === 'income' ? 'bg-emerald-500/10 text-emerald-500' : 'bg-rose-500/10 text-rose-500'}`}>
                        {tx.type === 'income' ? <ArrowUpRight size={14} /> : <ArrowDownRight size={14} />}
                      </div>
                      <div>
                        <div className="font-semibold text-xs text-foreground">{tx.description || tx.category || 'Transaction'}</div>
                        <div className="text-[10px] text-muted-foreground font-mono">
                          {tx.date} · {tx.account_name || tx.payment_method || 'Account'}
                        </div>
                      </div>
                    </div>
                    <div className={`font-mono font-bold text-xs ${tx.type === 'income' ? 'text-emerald-500' : 'text-foreground'}`}>
                      {tx.type === 'income' ? '+' : '-'}{formatAmount(tx.amount)}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>

          {/* Active Projects */}
          <Card className="p-5 rounded-2xl border-border/80">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-bold text-foreground flex items-center gap-2">
                <FolderKanban size={16} className="text-indigo-500" />
                Work · Projects
              </h3>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => navigate('/work/projects')}
                className="gap-1 text-[11px] font-bold text-indigo-500"
              >
                All Projects <ChevronRight size={13} />
              </Button>
            </div>

            {recentProjects.length === 0 ? (
              <div className="py-6 text-center text-muted-foreground text-xs font-medium">
                No active projects. Create one to organize your work.
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {recentProjects.map(proj => (
                  <div
                    key={proj.id || proj.name}
                    onClick={() => navigate('/work/projects')}
                    className="p-3.5 bg-muted/30 border border-border/50 rounded-xl hover:border-indigo-500/40 cursor-pointer transition-all group"
                  >
                    <span className="font-bold text-xs text-foreground group-hover:text-indigo-500 transition-colors">{proj.name}</span>
                    <p className="text-[10px] text-muted-foreground mt-1 line-clamp-2">{proj.description || 'Workspace'}</p>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>

        {/* Right Column: Quick Links */}
        <div className="space-y-6">
          {/* Loan Status */}
          {unpaidLoansAmount > 0 && (
            <Card className="p-5 rounded-2xl border-border/80">
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-sm font-bold text-foreground">Outstanding Loans</h3>
              </div>
              <div className="text-xl font-black font-mono text-foreground">{formatAmount(unpaidLoansAmount)}</div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => navigate('/ledger/loans')}
                className="gap-1 text-[11px] font-bold text-primary mt-2 p-0"
              >
                Manage Loans <ChevronRight size={13} />
              </Button>
            </Card>
          )}

          {/* Tasks Overview */}
          <Card className="p-5 rounded-2xl border-border/80">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-bold text-foreground flex items-center gap-2">
                <CheckSquare size={16} className="text-blue-500" />
                Pending Tasks
              </h3>
            </div>
            <div className="text-xl font-black font-mono text-foreground">{pendingTasksCount}</div>
            <p className="text-[10px] text-muted-foreground mt-1">tasks need your attention</p>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => navigate('/work/tasks')}
              className="gap-1 text-[11px] font-bold text-blue-500 mt-2 p-0"
            >
              View Tasks <ChevronRight size={13} />
            </Button>
          </Card>
        </div>
      </div>
    </div>
  );
};

export default BaseDashboard;
