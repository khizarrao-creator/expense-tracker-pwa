import {
  getSummaryByAccount,
  getMonthlyComparison,
  getExpensesByCategory,
  getTransactions,
  getBudgetVsActual,
  getGoals,
  getLoans,
  getReminders,
  getInvestments,
  getFuelLogs,
  calculatePortfolioValue,
  getInvestmentProfitLoss
} from '../db/queries';

const CACHE_KEY = 'ai_financial_snapshot';
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

export interface FinancialSnapshot {
  generatedAt: string;
  accounts: {
    id: string;
    name: string;
    type: string;
    currency: string;
    balance: number;
  }[];
  monthlySummary: {
    month: string;
    income: number;
    expenses: number;
    netSavings: number;
    prevMonthIncome: number;
    prevMonthExpenses: number;
  };
  topCategories: {
    category: string;
    subcategory?: string;
    total: number;
  }[];
  recentTransactions: {
    id: string;
    date: string;
    type: string;
    category: string;
    subcategory?: string;
    description: string;
    amount: number;
    accountName: string;
    currency: string;
  }[];
  budgets: {
    category: string;
    limit: number;
    spent: number;
    pct: number;
    status: 'ok' | 'warning' | 'over';
  }[];
  goals: {
    name: string;
    targetAmount: number;
    currentAmount: number;
    deadline: string | null;
    progressPct: number;
  }[];
  loans: {
    id: string;
    party: string;
    direction: string;
    amount: number;
    remaining: number;
    status: string;
  }[];
  upcomingReminders: {
    title: string;
    amount: number;
    dueDate: string;
    isPaid: boolean;
  }[];
  investments: {
    name: string;
    type: string;
    units: number;
    currentPrice: number;
    avgBuyPrice: number;
    currency: string;
    currentValueBase: number;
    profitLoss: number;
    profitLossPct: number;
  }[];
  portfolioSummary: {
    totalValue: number;
    totalProfitLoss: number;
    totalProfitLossPct: number;
  };
  fuelLogs: {
    fuelType: string;
    pricePerLiter: number;
    totalCost: number;
    liters: number;
    date: string;
    vehicleName?: string;
  }[];
}

interface CachedSnapshot {
  data: FinancialSnapshot;
  cachedAt: number;
}

/** Invalidate the cached snapshot — call this after any data mutation */
export const invalidateAICache = () => {
  localStorage.removeItem(CACHE_KEY);
};

/** Build a clean, human-readable financial snapshot from SQLite */
export const buildFinancialSnapshot = async (): Promise<FinancialSnapshot> => {
  const now = new Date();
  const year = now.getFullYear().toString();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const monthName = now.toLocaleString('default', { month: 'long', year: 'numeric' });

  const [
    accountRows,
    monthlyComp,
    categoryRows,
    recentRows,
    budgetRows,
    goalRows,
    loanRows,
    reminderRows,
    investmentRows,
    fuelRows,
    portfolioValueBase,
    portfolioProfitLoss
  ] = await Promise.all([
    getSummaryByAccount(),
    getMonthlyComparison(),
    getExpensesByCategory(year, month),
    getTransactions(20, 0),
    getBudgetVsActual(year, month),
    getGoals(),
    getLoans({ status: 'all' }),
    getReminders(),
    getInvestments(),
    getFuelLogs(),
    calculatePortfolioValue(),
    getInvestmentProfitLoss()
  ]);

  // --- Accounts ---
  const accounts = (accountRows || []).map((a: any) => {
    const balance =
      (a.initial_balance || 0) +
      (a.income || 0) +
      (a.transfer_in || 0) -
      (a.expense || 0) -
      (a.transfer_out || 0);
    return {
      id: a.id,
      name: a.name,
      type: a.type || 'wallet',
      currency: a.currency || 'PKR',
      balance: Math.round(balance * 100) / 100,
    };
  });

  // --- Monthly Summary ---
  const income = monthlyComp?.current_income || 0;
  const expenses = monthlyComp?.current_expense || 0;
  const monthlySummary = {
    month: monthName,
    income,
    expenses,
    netSavings: income - expenses,
    prevMonthIncome: monthlyComp?.prev_income || 0,
    prevMonthExpenses: monthlyComp?.prev_expense || 0,
  };

  // --- Top Categories (this month) ---
  const topCategories = (categoryRows || []).slice(0, 8).map((c: any) => ({
    category: c.category,
    subcategory: c.subcategory || undefined,
    total: Math.round((c.total || 0) * 100) / 100,
  }));

  // --- Recent Transactions (clean, no internal IDs) ---
  const recentTransactions = (recentRows || []).map((t: any) => ({
    id: t.id,
    date: t.date,
    type: t.type,
    category: t.category || 'Uncategorized',
    subcategory: t.subcategory || undefined,
    description: t.description || '',
    amount: Math.round((t.amount || 0) * 100) / 100,
    accountName: t.account_name || 'Unknown Account',
    currency: t.account_currency || 'PKR',
  }));

  // --- Budgets vs Actual ---
  const budgets = (budgetRows || []).map((b: any) => {
    const pct = b.pct || 0;
    return {
      category: b.subcategory ? `${b.category} > ${b.subcategory}` : b.category,
      limit: Math.round((b.budget || 0) * 100) / 100,
      spent: Math.round((b.spent || 0) * 100) / 100,
      pct: Math.round(pct),
      status: (pct > 100 ? 'over' : pct > 75 ? 'warning' : 'ok') as 'ok' | 'warning' | 'over',
    };
  });

  // --- Goals ---
  const goals = (goalRows || []).map((g: any) => {
    const progress = g.target_amount > 0
      ? Math.round((g.current_amount / g.target_amount) * 100)
      : 0;
    return {
      name: g.name,
      targetAmount: g.target_amount || 0,
      currentAmount: g.current_amount || 0,
      deadline: g.target_date || null,
      progressPct: progress,
    };
  });

  // --- Active Loans ---
  const loans = (loanRows || [])
    .filter((l: any) => !['closed'].includes(l.status))
    .slice(0, 10)
    .map((l: any) => ({
      id: l.id,
      party: l.party_name || 'Unknown',
      direction: l.direction === 'given' ? 'Lent Out' : 'Borrowed',
      amount: Math.round((l.amount || 0) * 100) / 100,
      remaining: Math.round((l.remaining_balance || l.amount || 0) * 100) / 100,
      status: l.status || 'open',
    }));

  // --- Upcoming/Unpaid Reminders ---
  const upcomingReminders = (reminderRows || [])
    .filter((r: any) => r.status !== 'paid')
    .slice(0, 5)
    .map((r: any) => ({
      title: r.title,
      amount: Math.round((r.amount || 0) * 100) / 100,
      dueDate: r.due_date || 'No deadline',
      isPaid: r.status === 'paid',
    }));

  // --- Investments ---
  const investments = (investmentRows || []).map((inv: any) => {
    const currentExRate = inv.current_exchange_rate || 1;
    const buyExRate = inv.buy_exchange_rate || 1;
    const currentValueBase = inv.units * inv.current_price * currentExRate;
    const costBasisBase = inv.units * inv.average_buy_price * buyExRate;
    const profitLoss = currentValueBase - costBasisBase;
    const profitLossPct = costBasisBase > 0 ? (profitLoss / costBasisBase) * 100 : 0;

    return {
      name: inv.name,
      type: inv.type,
      units: inv.units,
      currentPrice: inv.current_price,
      avgBuyPrice: inv.average_buy_price,
      currency: inv.currency || 'PKR',
      currentValueBase: Math.round(currentValueBase * 100) / 100,
      profitLoss: Math.round(profitLoss * 100) / 100,
      profitLossPct: Math.round(profitLossPct * 100) / 100,
    };
  });

  const portfolioSummary = {
    totalValue: Math.round((portfolioValueBase || 0) * 100) / 100,
    totalProfitLoss: Math.round((portfolioProfitLoss?.profit_loss || 0) * 100) / 100,
    totalProfitLossPct: Math.round((portfolioProfitLoss?.profit_loss_pct || 0) * 100) / 100
  };

  // --- Fuel Logs ---
  const fuelLogs = (fuelRows || []).slice(0, 10).map((f: any) => ({
    fuelType: f.fuel_type,
    pricePerLiter: f.price_per_liter,
    totalCost: f.total_cost,
    liters: f.liters,
    date: f.date,
    vehicleName: f.vehicle_name || undefined
  }));

  return {
    generatedAt: now.toISOString(),
    accounts,
    monthlySummary,
    topCategories,
    recentTransactions,
    budgets,
    goals,
    loans,
    upcomingReminders,
    investments,
    portfolioSummary,
    fuelLogs
  };
};

/** Get from cache or rebuild if stale */
export const getCachedSnapshot = async (): Promise<FinancialSnapshot> => {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (raw) {
      const cached: CachedSnapshot = JSON.parse(raw);
      if (Date.now() - cached.cachedAt < CACHE_TTL_MS) {
        return cached.data;
      }
    }
  } catch (_) {
    // ignore parse errors
  }

  const fresh = await buildFinancialSnapshot();
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify({ data: fresh, cachedAt: Date.now() }));
  } catch (_) {
    // storage might be full; silently fail
  }
  return fresh;
};

/** Format the snapshot into a clean text block for the AI system prompt */
export const formatSnapshotForAI = (snapshot: FinancialSnapshot, currencySymbol: string): string => {
  const fmt = (n: number) => `${currencySymbol}${n.toLocaleString()}`;
  const lines: string[] = [];

  lines.push(`=== FINANCIAL SNAPSHOT (as of ${snapshot.generatedAt.split('T')[0]}) ===`);

  // Accounts
  lines.push('\nACCOUNTS & BALANCES:');
  if (snapshot.accounts.length === 0) {
    lines.push('  (No accounts found)');
  } else {
    snapshot.accounts.forEach(a => {
      lines.push(`  - ${a.name} [${a.type}] [ID: ${a.id}]: ${a.currency} ${a.balance.toLocaleString()}`);
    });
  }

  // Monthly Summary
  const ms = snapshot.monthlySummary;
  lines.push(`\nMONTHLY SUMMARY — ${ms.month}:`);
  lines.push(`  - Total Income:    ${fmt(ms.income)}`);
  lines.push(`  - Total Expenses:  ${fmt(ms.expenses)}`);
  lines.push(`  - Net Savings:     ${fmt(ms.netSavings)}`);
  if (ms.prevMonthExpenses > 0) {
    const expDiff = ms.expenses - ms.prevMonthExpenses;
    const sign = expDiff >= 0 ? '+' : '';
    lines.push(`  - vs Last Month:   Expenses ${sign}${fmt(expDiff)} change`);
  }

  // Top Categories
  lines.push('\nTOP EXPENSE CATEGORIES (this month):');
  if (snapshot.topCategories.length === 0) {
    lines.push('  (No expenses recorded this month)');
  } else {
    snapshot.topCategories.forEach(c => {
      const label = c.subcategory ? `${c.category} > ${c.subcategory}` : c.category;
      lines.push(`  - ${label}: ${fmt(c.total)}`);
    });
  }

  // Recent Transactions
  lines.push('\nRECENT TRANSACTIONS (last 20):');
  if (snapshot.recentTransactions.length === 0) {
    lines.push('  (No transactions found)');
  } else {
    snapshot.recentTransactions.forEach(t => {
      const catLabel = t.subcategory ? `${t.category}/${t.subcategory}` : t.category;
      const desc = t.description ? ` "${t.description}"` : '';
      lines.push(`  - [ID: ${t.id}] ${t.date} | ${t.type.toUpperCase()} | ${catLabel}${desc} | ${t.currency} ${t.amount.toLocaleString()} (${t.accountName})`);
    });
  }

  // Budgets
  if (snapshot.budgets.length > 0) {
    lines.push('\nBUDGETS vs ACTUAL:');
    snapshot.budgets.forEach(b => {
      const flag = b.status === 'over' ? ' ⚠️ OVER BUDGET' : b.status === 'warning' ? ' ⚠️ NEAR LIMIT' : '';
      lines.push(`  - ${b.category}: ${fmt(b.spent)} of ${fmt(b.limit)} (${b.pct}%)${flag}`);
    });
  }

  // Goals
  if (snapshot.goals.length > 0) {
    lines.push('\nSAVINGS GOALS:');
    snapshot.goals.forEach(g => {
      const deadline = g.deadline ? ` | Deadline: ${g.deadline}` : '';
      lines.push(`  - ${g.name}: ${fmt(g.currentAmount)} / ${fmt(g.targetAmount)} (${g.progressPct}%${deadline})`);
    });
  }

  // Loans
  if (snapshot.loans.length > 0) {
    lines.push('\nOPEN LOANS:');
    snapshot.loans.forEach(l => {
      lines.push(`  - [ID: ${l.id}] ${l.direction} — ${l.party}: ${fmt(l.remaining)} remaining (Status: ${l.status})`);
    });
  }

  // Reminders
  if (snapshot.upcomingReminders.length > 0) {
    lines.push('\nUNPAID UPCOMING BILLS:');
    snapshot.upcomingReminders.forEach(r => {
      lines.push(`  - ${r.title}: ${fmt(r.amount)} due ${r.dueDate}`);
    });
  }

  // Investments
  if (snapshot.investments && snapshot.investments.length > 0) {
    lines.push('\nINVESTMENT PORTFOLIO:');
    lines.push(`  - Total Portfolio Value: ${fmt(snapshot.portfolioSummary.totalValue)}`);
    const plSign = snapshot.portfolioSummary.totalProfitLoss >= 0 ? '+' : '';
    lines.push(`  - Total Net Profit/Loss: ${plSign}${fmt(snapshot.portfolioSummary.totalProfitLoss)} (${snapshot.portfolioSummary.totalProfitLossPct}%)`);
    lines.push('  Holdings:');
    snapshot.investments.forEach(inv => {
      const invPlSign = inv.profitLoss >= 0 ? '+' : '';
      lines.push(`    * ${inv.name} (${inv.type}): ${inv.units.toLocaleString()} units @ Current Price: ${inv.currency} ${inv.currentPrice.toLocaleString()} (Avg Buy Price: ${inv.currency} ${inv.avgBuyPrice.toLocaleString()})`);
      lines.push(`      Value in Base Currency: ${fmt(inv.currentValueBase)} | P&L: ${invPlSign}${fmt(inv.profitLoss)} (${inv.profitLossPct}%)`);
    });
  }

  // Fuel Logs
  if (snapshot.fuelLogs && snapshot.fuelLogs.length > 0) {
    lines.push('\nRECENT FUEL LOGS:');
    snapshot.fuelLogs.forEach(f => {
      const vehicleInfo = f.vehicleName ? ` | Vehicle: ${f.vehicleName}` : '';
      lines.push(`  - ${f.date} | ${f.fuelType} | ${f.liters}L @ ${fmt(f.pricePerLiter)}/L | Total Cost: ${fmt(f.totalCost)}${vehicleInfo}`);
    });
  }

  return lines.join('\n');
};
