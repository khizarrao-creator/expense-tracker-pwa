import React, { useEffect, useState, useCallback, useRef } from 'react';
import {
  getExpensesByCategoryByPeriod,
  getNetWorth,
  getPaymentMethodStatsByPeriod,
  getMonthlyComparison,
  getBurnRate,
  getCategorySpikes,
  calculatePortfolioValue,
  setBudget,
  deleteBudget,
  getBudgetVsActual,
  getDailySpendingForMonth,
  getCategories,
  type ChartPeriod,
  type BudgetVsActualRow,
  type DailySpend,
} from '../db/queries';
import { Doughnut, Pie, Bar } from 'react-chartjs-2';
import {
  Chart as ChartJS,
  ArcElement,
  Tooltip,
  Legend,
  CategoryScale,
  LinearScale,
  BarElement
} from 'chart.js';
import {
  ArrowDownIcon, ArrowUpIcon, Wallet, Zap, TrendingUp, TrendingDown,
  Banknote, AlertTriangle, ShieldCheck, Clock,
  Pencil, Trash2, Plus, Check, X as XIcon
} from 'lucide-react';
import { useCurrency } from '../contexts/CurrencyContext';

ChartJS.register(ArcElement, Tooltip, Legend, CategoryScale, LinearScale, BarElement);

// ─── Period Toggle ──────────────────────────────────────────────────────────

const PERIOD_OPTIONS: { label: string; value: ChartPeriod }[] = [
  { label: 'Day', value: 'day' },
  { label: 'Week', value: 'week' },
  { label: 'Month', value: 'month' },
];

interface PeriodToggleProps {
  value: ChartPeriod;
  onChange: (p: ChartPeriod) => void;
}

const PeriodToggle: React.FC<PeriodToggleProps> = ({ value, onChange }) => (
  <div className="flex gap-1 bg-muted rounded-lg p-1 shrink-0">
    {PERIOD_OPTIONS.map((opt) => (
      <button
        key={opt.value}
        onClick={() => onChange(opt.value)}
        className={`px-2.5 py-1 text-xs font-semibold rounded-md transition-all duration-200 ${value === opt.value
            ? 'bg-primary text-primary-foreground shadow-sm'
            : 'text-muted-foreground hover:text-foreground'
          }`}
      >
        {opt.label}
      </button>
    ))}
  </div>
);

// ─── Budget vs Actual ───────────────────────────────────────────────────────

interface BudgetVsActualProps {
  rows: BudgetVsActualRow[];
  categories: any[];
  formatAmount: (n: number) => string;
  onSave: (cat: string, amount: number, subcat?: string | null) => void;
  onDelete: (cat: string, subcat?: string | null) => void;
}

const BudgetVsActualPanel: React.FC<BudgetVsActualProps> = ({
  rows, categories, formatAmount, onSave, onDelete
}) => {
  const [editingCat, setEditingCat] = useState<string | null>(null);
  const [editVal, setEditVal] = useState('');
  const [adding, setAdding] = useState(false);
  const [newCat, setNewCat] = useState('');
  const [newAmt, setNewAmt] = useState('');
  const editRef = useRef<HTMLInputElement>(null);

  const existingCats = new Set(rows.map(r => r.category));
  const availableCats = categories.filter(c => !existingCats.has(c));

  const startEdit = (row: BudgetVsActualRow) => {
    const key = row.subcategory ? `${row.category}:${row.subcategory}` : row.category;
    setEditingCat(key);
    setEditVal(String(row.budget));
    setTimeout(() => editRef.current?.focus(), 50);
  };

  const commitEdit = (row: BudgetVsActualRow) => {
    const amt = parseFloat(editVal);
    if (!isNaN(amt) && amt > 0) onSave(row.category, amt, row.subcategory);
    setEditingCat(null);
  };

  const commitAdd = () => {
    const amt = parseFloat(newAmt);
    if (newCat && !isNaN(amt) && amt > 0) {
      if (newCat.includes(' > ')) {
        const [p, s] = newCat.split(' > ');
        onSave(p, amt, s);
      } else {
        onSave(newCat, amt, null);
      }
      setNewCat('');
      setNewAmt('');
      setAdding(false);
    }
  };

  if (rows.length === 0 && !adding) {
    return (
      <div className="flex flex-col items-center justify-center py-8 gap-3">
        <p className="text-muted-foreground text-sm">No budgets set yet.</p>
        <button
          onClick={() => setAdding(true)}
          className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground text-sm font-semibold rounded-xl hover:opacity-90 transition"
        >
          <Plus size={15} /> Set First Budget
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {rows.map(row => {
        const isOver = row.pct > 100;
        const barW = Math.min(row.pct, 100);
        const barColor = isOver ? 'bg-destructive' : row.pct > 75 ? 'bg-amber-500' : 'bg-primary';
        const pctColor = isOver ? 'text-destructive font-bold' : row.pct > 75 ? 'text-amber-500' : 'text-emerald-500';
        const rowKey = row.subcategory ? `${row.category}:${row.subcategory}` : row.category;
        const isEditing = editingCat === rowKey;

        return (
          <div key={`${row.category}-${row.subcategory}`} className={`p-3 rounded-xl border ${isOver ? 'border-destructive/30 bg-destructive/5' : 'border-border bg-muted/30'}`}>
            <div className="flex items-center justify-between mb-2 gap-2">
              <span className="text-sm font-semibold truncate">
                {row.subcategory ? `${row.category} > ${row.subcategory}` : row.category}
              </span>
              <div className="flex items-center gap-1 shrink-0">
                <span className={`text-xs ${pctColor}`}>{row.pct.toFixed(0)}%</span>
                {isOver && <AlertTriangle size={12} className="text-destructive" />}
                <button
                  onClick={() => startEdit(row)}
                  className="p-1 rounded text-muted-foreground hover:text-foreground transition"
                >
                  <Pencil size={13} />
                </button>
                <button
                  onClick={() => onDelete(row.category, row.subcategory)}
                  className="p-1 rounded text-muted-foreground hover:text-destructive transition"
                >
                  <Trash2 size={13} />
                </button>
              </div>
            </div>

            {/* Progress bar */}
            <div className="w-full h-2 bg-muted rounded-full overflow-hidden mb-2">
              <div
                className={`h-full rounded-full transition-all duration-500 ${barColor}`}
                style={{ width: `${barW}%` }}
              />
            </div>

            {isEditing ? (
              <div className="flex items-center gap-2 mt-1">
                <input
                  ref={editRef}
                  type="number"
                  value={editVal}
                  onChange={e => setEditVal(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') commitEdit(row); if (e.key === 'Escape') setEditingCat(null); }}
                  className="flex-1 text-xs px-2 py-1 rounded-lg border border-border bg-background focus:outline-none focus:border-primary"
                  placeholder="Budget amount"
                />
                <button onClick={() => commitEdit(row)} className="p-1 text-emerald-500 hover:opacity-80"><Check size={14} /></button>
                <button onClick={() => setEditingCat(null)} className="p-1 text-muted-foreground hover:opacity-80"><XIcon size={14} /></button>
              </div>
            ) : (
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>{formatAmount(row.spent)} spent</span>
                <span>of {formatAmount(row.budget)}</span>
              </div>
            )}
          </div>
        );
      })}

      {/* Add budget row */}
      {adding ? (
        <div className="flex flex-wrap items-center gap-2 p-3 rounded-xl border border-border bg-muted/30">
          <select
            value={newCat}
            onChange={e => setNewCat(e.target.value)}
            className="flex-1 min-w-0 text-sm px-2 py-1.5 rounded-lg border border-border bg-background focus:outline-none focus:border-primary"
          >
            <option value="">Select category…</option>
            {categories.filter(c => !c.parent_id).map(parent => (
              <React.Fragment key={parent.id}>
                <option value={parent.name}>{parent.name}</option>
                {categories.filter(sub => sub.parent_id === parent.id).map(sub => (
                  <option key={sub.id} value={`${parent.name} > ${sub.name}`}>
                    &nbsp;&nbsp;&nbsp;{sub.name}
                  </option>
                ))}
              </React.Fragment>
            ))}
          </select>
          <input
            type="number"
            value={newAmt}
            onChange={e => setNewAmt(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') commitAdd(); if (e.key === 'Escape') setAdding(false); }}
            placeholder="Budget"
            className="w-28 text-sm px-2 py-1.5 rounded-lg border border-border bg-background focus:outline-none focus:border-primary"
          />
          <button onClick={commitAdd} className="p-1.5 rounded-lg text-emerald-500 hover:opacity-80"><Check size={16} /></button>
          <button onClick={() => setAdding(false)} className="p-1.5 rounded-lg text-muted-foreground hover:opacity-80"><XIcon size={16} /></button>
        </div>
      ) : rows.length > 0 && availableCats.length > 0 && (
        <button
          onClick={() => setAdding(true)}
          className="flex items-center gap-2 text-xs text-primary hover:opacity-80 transition font-medium py-1"
        >
          <Plus size={14} /> Add another budget
        </button>
      )}
    </div>
  );
};

// ─── Spending Heatmap ───────────────────────────────────────────────────────

const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

interface HeatmapProps {
  year: number;
  month: number; // 1-indexed
  dailyData: DailySpend[];
  formatAmount: (n: number) => string;
}

const SpendingHeatmap: React.FC<HeatmapProps> = ({ year, month, dailyData, formatAmount }) => {
  const spendMap = new Map<string, number>();
  dailyData.forEach(d => spendMap.set(d.date, d.total));

  const maxSpend = dailyData.reduce((m, d) => Math.max(m, d.total), 0);

  const today = new Date();
  const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

  const daysInMonth = new Date(year, month, 0).getDate();
  const firstDow = new Date(year, month - 1, 1).getDay(); // 0=Sun

  const cells: { day: number | null; dateStr: string | null }[] = [];
  for (let i = 0; i < firstDow; i++) cells.push({ day: null, dateStr: null });
  for (let d = 1; d <= daysInMonth; d++) {
    const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    cells.push({ day: d, dateStr });
  }

  const getOpacity = (total: number) => {
    if (!total || maxSpend === 0) return 0;
    return 0.15 + (total / maxSpend) * 0.85;
  };

  return (
    <div>
      <div className="grid grid-cols-7 gap-0.5 mb-1">
        {DAY_LABELS.map(d => (
          <div key={d} className="text-center text-[10px] text-muted-foreground font-medium py-1">{d}</div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-1">
        {cells.map((cell, idx) => {
          if (!cell.day || !cell.dateStr) {
            return <div key={`empty-${idx}`} />;
          }
          const amt = spendMap.get(cell.dateStr) ?? 0;
          const opacity = getOpacity(amt);
          const isToday = cell.dateStr === todayStr;
          return (
            <div
              key={cell.dateStr}
              title={amt > 0 ? `${cell.dateStr} · ${formatAmount(amt)}` : cell.dateStr}
              className={`
                relative aspect-square rounded-lg flex items-center justify-center cursor-default
                transition-all duration-200 hover:scale-110
                ${isToday ? 'ring-2 ring-primary ring-offset-1 ring-offset-background' : ''}
              `}
              style={{
                backgroundColor: amt > 0
                  ? `hsl(var(--primary) / ${opacity})`
                  : 'hsl(var(--muted) / 0.5)',
              }}
            >
              <span className={`text-[10px] font-medium select-none ${amt > 0 && opacity > 0.5 ? 'text-primary-foreground' : 'text-muted-foreground'}`}>
                {cell.day}
              </span>
            </div>
          );
        })}
      </div>
      {/* Legend */}
      <div className="flex items-center gap-2 mt-3 justify-end">
        <span className="text-[10px] text-muted-foreground">Less</span>
        {[0.1, 0.3, 0.55, 0.75, 1].map((op, i) => (
          <div
            key={i}
            className="w-4 h-4 rounded-sm"
            style={{ backgroundColor: `hsl(var(--primary) / ${op})` }}
          />
        ))}
        <span className="text-[10px] text-muted-foreground">More</span>
      </div>
    </div>
  );
};

// ─── Main Dashboard ─────────────────────────────────────────────────────────

const Dashboard: React.FC = () => {
  const { formatAmount } = useCurrency();
  const now = new Date();
  const currentYear = now.getFullYear().toString();
  const currentMonth = (now.getMonth() + 1).toString();

  const [summary, setSummary] = useState({ income: 0, expense: 0, balance: 0 });
  const [netWorth, setNetWorth] = useState(0);
  const [cashFlowChart, setCashFlowChart] = useState<any>(null);
  const [burnRate, setBurnRate] = useState(0);
  const [insights, setInsights] = useState<any[]>([]);
  const [monthlyComp, setMonthlyComp] = useState<any>(null);
  const [portfolioValue, setPortfolioValue] = useState(0);
  const [loading, setLoading] = useState(true);

  // Period charts
  const [categoryPeriod, setCategoryPeriod] = useState<ChartPeriod>('month');
  const [paymentPeriod, setPaymentPeriod] = useState<ChartPeriod>('month');
  const [categoryChart, setCategoryChart] = useState<any>(null);
  const [paymentChart, setPaymentChart] = useState<any>(null);

  // Budgets
  const [budgetRows, setBudgetRows] = useState<BudgetVsActualRow[]>([]);
  const [expenseCategories, setExpenseCategories] = useState<any[]>([]);

  // Heatmap
  const [dailySpend, setDailySpend] = useState<DailySpend[]>([]);

  // ── Loaders ────────────────────────────────────────────────────────────────

  const loadBaseData = useCallback(async () => {
    try {
      const [nw, comp, burn, spikes, pValue] = await Promise.all([
        getNetWorth(), getMonthlyComparison(),
        getBurnRate(), getCategorySpikes(), calculatePortfolioValue()
      ]);

      setSummary({
        income: comp.current_income || 0,
        expense: comp.current_expense || 0,
        balance: (comp.current_income || 0) - (comp.current_expense || 0)
      });
      setNetWorth(nw);
      setPortfolioValue(pValue);
      setMonthlyComp(comp);
      setBurnRate(burn);
      setInsights(spikes);

      setCashFlowChart({
        labels: ['Prev Month', 'This Month'],
        datasets: [
          { label: 'Income', data: [comp.prev_income, comp.current_income], backgroundColor: '#10b981', borderRadius: 8 },
          { label: 'Expense', data: [comp.prev_expense, comp.current_expense], backgroundColor: '#ef4444', borderRadius: 8 },
        ]
      });
    } catch (err) {
      console.error('Failed to load dashboard base data', err);
    } finally {
      setLoading(false);
    }
  }, []);

  const loadCategoryChart = useCallback(async (period: ChartPeriod) => {
    try {
      const cats = await getExpensesByCategoryByPeriod(period);
      setCategoryChart(cats?.length ? {
        labels: cats.map((d: any) => d.subcategory ? `${d.category} > ${d.subcategory}` : d.category),
        datasets: [{ data: cats.map((d: any) => d.total), backgroundColor: ['#3b82f6', '#ef4444', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899', '#6b7280'], borderWidth: 0, hoverOffset: 4 }]
      } : null);
    } catch { /* ignore */ }
  }, []);

  const loadPaymentChart = useCallback(async (period: ChartPeriod) => {
    try {
      const payments = await getPaymentMethodStatsByPeriod(period);
      setPaymentChart(payments?.length ? {
        labels: payments.map((d: any) => d.payment_method),
        datasets: [{ data: payments.map((d: any) => d.total), backgroundColor: ['#6366f1', '#8b5cf6', '#d946ef', '#f43f5e'], borderWidth: 0 }]
      } : null);
    } catch { /* ignore */ }
  }, []);

  const loadBudgets = useCallback(async () => {
    try {
      const [rows, cats] = await Promise.all([
        getBudgetVsActual(currentYear, currentMonth),
        getCategories('expense', 'all'),
      ]);
      setBudgetRows(rows);
      setExpenseCategories(cats);
    } catch { /* ignore */ }
  }, [currentYear, currentMonth]);

  const loadHeatmap = useCallback(async () => {
    try {
      const data = await getDailySpendingForMonth(currentYear, currentMonth);
      setDailySpend(data);
    } catch { /* ignore */ }
  }, [currentYear, currentMonth]);

  // ── Effects ────────────────────────────────────────────────────────────────

  useEffect(() => {
    loadBaseData();
    loadBudgets();
    loadHeatmap();
    window.addEventListener('app-sync-complete', loadBaseData);
    return () => window.removeEventListener('app-sync-complete', loadBaseData);
  }, [loadBaseData, loadBudgets, loadHeatmap]);

  useEffect(() => { loadCategoryChart(categoryPeriod); }, [categoryPeriod, loadCategoryChart]);
  useEffect(() => { loadPaymentChart(paymentPeriod); }, [paymentPeriod, loadPaymentChart]);

  // ── Budget handlers ────────────────────────────────────────────────────────

  const handleSaveBudget = async (category: string, amount: number, subcategory: string | null = null) => {
    await setBudget(category, amount, subcategory);
    loadBudgets();
  };

  const handleDeleteBudget = async (category: string, subcategory: string | null = null) => {
    await deleteBudget(category, subcategory);
    loadBudgets();
  };

  // ── Derived ────────────────────────────────────────────────────────────────

  const savingsRate = summary.income > 0 ? ((summary.income - summary.expense) / summary.income) * 100 : 0;
  const currentBalance = netWorth + portfolioValue;
  const daysRemaining = burnRate > 0 && currentBalance > 0 ? Math.floor(currentBalance / burnRate) : null;

  if (loading) {
    return (
      <div className="flex justify-center items-center h-full">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  const periodLabel: Record<ChartPeriod, string> = { day: 'today', week: 'this week', month: 'this month' };

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-4 md:space-y-6">

      {/* ── Header ── */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-xl md:text-2xl font-bold">Financial Overview</h1>
      </div>

      {/* ── Primary Stats ── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 md:gap-4">
        <div className="sm:col-span-2 lg:col-span-1 bg-primary text-primary-foreground p-4 md:p-6 rounded-2xl shadow-lg relative overflow-hidden group">
          <div className="absolute -right-4 -bottom-4 bg-white/10 w-24 h-24 rounded-full blur-2xl group-hover:scale-150 transition-transform duration-500" />
          <div className="flex items-center justify-between mb-1 md:mb-2 opacity-80">
            <span className="text-xs md:text-sm font-medium">Total Net Worth</span>
            <Wallet size={16} />
          </div>
          <p className="text-2xl md:text-3xl font-black">{formatAmount(netWorth + portfolioValue)}</p>
        </div>

        <div className="bg-card p-3 md:p-6 rounded-2xl shadow-sm border border-border">
          <div className="flex items-center justify-between mb-1 md:mb-2 text-emerald-500">
            <span className="text-xs md:text-sm font-medium leading-tight">Monthly Income</span>
            <ArrowUpIcon size={16} />
          </div>
          <p className="text-base md:text-xl font-bold">{formatAmount(summary.income)}</p>
        </div>

        <div className="bg-card p-3 md:p-6 rounded-2xl shadow-sm border border-border">
          <div className="flex items-center justify-between mb-1 md:mb-2 text-destructive">
            <span className="text-xs md:text-sm font-medium leading-tight">Monthly Expense</span>
            <ArrowDownIcon size={16} />
          </div>
          <p className="text-base md:text-xl font-bold">{formatAmount(summary.expense)}</p>
        </div>

        <div className="bg-card p-3 md:p-6 rounded-2xl shadow-sm border border-border">
          <div className="flex items-center justify-between mb-1 md:mb-2 text-amber-500">
            <span className="text-xs md:text-sm font-medium leading-tight">Investments</span>
            <TrendingUp size={16} />
          </div>
          <p className="text-base md:text-xl font-bold">{formatAmount(portfolioValue)}</p>
        </div>

        <div className="bg-card p-3 md:p-6 rounded-2xl shadow-sm border border-border">
          <div className="flex items-center justify-between mb-1 md:mb-2 text-primary">
            <span className="text-xs md:text-sm font-medium leading-tight">Savings Rate</span>
            <Banknote size={16} />
          </div>
          <p className="text-base md:text-xl font-bold">{savingsRate.toFixed(1)}%</p>
        </div>
      </div>

      {/* ── Burn Rate Projection ── */}
      {(() => {
        if (burnRate <= 0) return null;
        const isZero = currentBalance <= 0;
        const isCritical = !isZero && daysRemaining !== null && daysRemaining < 30;
        const isWarning = !isZero && daysRemaining !== null && daysRemaining >= 30 && daysRemaining < 90;

        const bg = isZero || isCritical ? 'bg-destructive/10 border-destructive/30' : isWarning ? 'bg-amber-500/10 border-amber-500/30' : 'bg-emerald-500/10 border-emerald-500/30';
        const iconColor = isZero || isCritical ? 'text-destructive' : isWarning ? 'text-amber-500' : 'text-emerald-500';
        const textColor = isZero || isCritical ? 'text-destructive' : isWarning ? 'text-amber-600' : 'text-emerald-600';
        const Icon = isZero || isCritical ? AlertTriangle : isWarning ? Clock : ShieldCheck;
        const message = isZero ? 'Your balance has already hit zero.' : `You will run out of money in ${daysRemaining} day${daysRemaining === 1 ? '' : 's'}.`;
        const sub = isZero || isCritical ? 'Reduce spending or add income immediately.' : isWarning ? 'Consider cutting back on non-essential expenses.' : 'You are on a healthy financial track.';

        return (
          <div className={`flex flex-col sm:flex-row items-start sm:items-center gap-4 p-4 md:p-5 rounded-2xl border ${bg}`}>
            <div className={`p-2.5 rounded-xl bg-white/50 dark:bg-black/20 shrink-0 ${iconColor}`}><Icon size={22} /></div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-0.5">Burn Rate Projection</p>
              <p className={`text-base md:text-lg font-bold ${textColor}`}>{message}</p>
              <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>
            </div>
            <div className="shrink-0 text-right">
              <p className="text-xs text-muted-foreground">Daily Burn</p>
              <p className={`text-lg md:text-xl font-black ${iconColor}`}>{formatAmount(burnRate)}<span className="text-xs font-normal text-muted-foreground">/day</span></p>
            </div>
          </div>
        );
      })()}

      {/* ── Intelligence Brief + Cash Flow ── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 md:gap-6">
        <div className="lg:col-span-1 bg-card p-4 md:p-6 rounded-2xl shadow-sm border border-border">
          <h2 className="text-base md:text-lg font-semibold mb-4 flex items-center gap-2">
            <Zap size={18} className="text-primary" /> Intelligence Brief
          </h2>
          <div className="space-y-3">
            {monthlyComp && (
              <div className="p-3 md:p-4 rounded-xl bg-muted/50 border border-border">
                <div className="flex items-start gap-3">
                  {monthlyComp.current_expense > monthlyComp.prev_expense
                    ? <TrendingUp className="text-destructive mt-1 shrink-0" size={16} />
                    : <TrendingDown className="text-emerald-500 mt-1 shrink-0" size={16} />}
                  <div>
                    <p className="text-sm font-medium">
                      {monthlyComp.prev_expense === 0
                        ? "Great start! You've started tracking your finances."
                        : monthlyComp.current_expense > monthlyComp.prev_expense
                          ? `Spending is up by ${(((monthlyComp.current_expense - monthlyComp.prev_expense) / monthlyComp.prev_expense) * 100).toFixed(0)}%`
                          : `Good job! You've spent less than last month.`}
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">
                      {monthlyComp.prev_expense === 0 ? 'Comparison will be available next month' : 'Compared to previous month metrics'}
                    </p>
                  </div>
                </div>
              </div>
            )}
            {insights.map((insight, idx) => (
              <div key={idx} className="p-3 md:p-4 rounded-xl bg-orange-500/5 border border-orange-500/20">
                <p className="text-sm font-medium text-orange-600">{insight.category} expense hiked!</p>
                <p className="text-xs text-orange-500/80 mt-1">Increased by {insight.increase_pct.toFixed(0)}% from last month</p>
              </div>
            ))}
            {(insights.length === 0 || (monthlyComp && monthlyComp.prev_expense === 0)) && (
              <div className="flex flex-col items-center justify-center py-6 opacity-50">
                <p className="text-muted-foreground text-sm italic">Gathering data for more insights...</p>
              </div>
            )}
          </div>
        </div>

        <div className="lg:col-span-2 bg-card p-4 md:p-6 rounded-2xl shadow-sm border border-border">
          <h2 className="text-base md:text-lg font-semibold mb-4">Cash Flow Analysis</h2>
          <div className="h-52 md:h-64">
            {cashFlowChart ? (
              <Bar data={cashFlowChart} options={{
                maintainAspectRatio: false,
                scales: {
                  x: { grid: { display: false } },
                  y: { beginAtZero: true, grid: { color: 'rgba(0,0,0,0.05)' }, ticks: { maxTicksLimit: 5 } }
                },
                plugins: { legend: { position: 'top', labels: { usePointStyle: true, padding: 12, boxWidth: 8 } } }
              }} />
            ) : (
              <div className="h-full flex items-center justify-center">
                <p className="text-muted-foreground text-sm">Loading cash flow data...</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Budget vs Actual + Spending Heatmap ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 md:gap-6">

        {/* Budget vs Actual */}
        <div className="bg-card p-4 md:p-6 rounded-2xl shadow-sm border border-border">
          <div className="flex items-center justify-between mb-4 gap-2">
            <div>
              <h2 className="text-base md:text-lg font-semibold">Budget vs Actual</h2>
              <p className="text-xs text-muted-foreground mt-0.5">
                {MONTH_NAMES[now.getMonth()]} {now.getFullYear()}
              </p>
            </div>
            {budgetRows.length > 0 && expenseCategories.length > 0 && (
              <div className="text-xs text-muted-foreground shrink-0">
                {budgetRows.filter(r => r.pct > 100).length > 0 && (
                  <span className="text-destructive font-semibold">
                    {budgetRows.filter(r => r.pct > 100).length} over budget
                  </span>
                )}
              </div>
            )}
          </div>
          <BudgetVsActualPanel
            rows={budgetRows}
            categories={expenseCategories}
            formatAmount={formatAmount}
            onSave={handleSaveBudget}
            onDelete={handleDeleteBudget}
          />
        </div>

        {/* Spending Heatmap */}
        <div className="bg-card p-4 md:p-6 rounded-2xl shadow-sm border border-border">
          <div className="mb-4">
            <h2 className="text-base md:text-lg font-semibold">Spending Heatmap</h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              {MONTH_NAMES[now.getMonth()]} {now.getFullYear()} · Darker = higher spend
            </p>
          </div>
          <SpendingHeatmap
            year={now.getFullYear()}
            month={now.getMonth() + 1}
            dailyData={dailySpend}
            formatAmount={formatAmount}
          />
        </div>
      </div>

      {/* ── Category & Payment Charts ── */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6">
        <div className="bg-card p-4 md:p-6 rounded-2xl shadow-sm border border-border">
          <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
            <h2 className="text-base md:text-lg font-semibold">Expenses by Category</h2>
            <PeriodToggle value={categoryPeriod} onChange={setCategoryPeriod} />
          </div>
          <div className="h-56 md:h-64 flex justify-center items-center">
            {categoryChart ? (
              <Doughnut data={categoryChart} options={{ maintainAspectRatio: false, cutout: '68%', plugins: { legend: { position: 'bottom', labels: { usePointStyle: true, padding: 14, boxWidth: 8, font: { size: 11 } } } } }} />
            ) : (
              <p className="text-muted-foreground text-sm">No data {periodLabel[categoryPeriod]}.</p>
            )}
          </div>
        </div>

        <div className="bg-card p-4 md:p-6 rounded-2xl shadow-sm border border-border">
          <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
            <h2 className="text-base md:text-lg font-semibold">Payment Methods</h2>
            <PeriodToggle value={paymentPeriod} onChange={setPaymentPeriod} />
          </div>
          <div className="h-56 md:h-64 flex justify-center items-center">
            {paymentChart ? (
              <Pie data={paymentChart} options={{ maintainAspectRatio: false, plugins: { legend: { position: 'bottom', labels: { usePointStyle: true, padding: 14, boxWidth: 8, font: { size: 11 } } } } }} />
            ) : (
              <p className="text-muted-foreground text-sm">No data {periodLabel[paymentPeriod]}.</p>
            )}
          </div>
        </div>
      </div>

    </div>
  );
};

export default Dashboard;
