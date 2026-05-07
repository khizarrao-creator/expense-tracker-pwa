import React, { useState, useEffect, useMemo } from 'react';
import { 
  getTransactions, 
  getLoans, 
  getFuelLogs, 
  type Transaction, 
  type Loan, 
  type FuelLog 
} from '../db/queries';
import { useCurrency } from '../contexts/CurrencyContext';
import { 
  BarChart3, 
  PieChart as PieChartIcon, 
  TrendingUp, 
  TrendingDown,
  Handshake,
  Fuel,
  Wallet
} from 'lucide-react';
import { 
  Chart as ChartJS, 
  ArcElement, 
  Tooltip, 
  Legend, 
  CategoryScale, 
  LinearScale, 
  BarElement,
  PointElement,
  LineElement,
  Title
} from 'chart.js';
import { Bar, Doughnut, Line } from 'react-chartjs-2';

ChartJS.register(
  ArcElement, Tooltip, Legend, CategoryScale, LinearScale, 
  BarElement, PointElement, LineElement, Title
);

type TabType = 'overview' | 'loans' | 'fuel';

const Reports: React.FC = () => {
  const { formatAmount } = useCurrency();
  const [activeTab, setActiveTab] = useState<TabType>('overview');
  const [loading, setLoading] = useState(true);

  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loans, setLoans] = useState<Loan[]>([]);
  const [fuelLogs, setFuelLogs] = useState<FuelLog[]>([]);

  useEffect(() => {
    const loadData = async () => {
      setLoading(true);
      try {
        // Fetch up to 10,000 to have a good dataset for reports
        const [txs, lns, fuel] = await Promise.all([
          getTransactions(10000, 0),
          getLoans({ status: 'all' }),
          getFuelLogs()
        ]);
        setTransactions(txs as Transaction[]);
        setLoans(lns);
        setFuelLogs(fuel);
      } catch (err) {
        console.error('Failed to load reports data', err);
      } finally {
        setLoading(false);
      }
    };
    loadData();
  }, []);

  // --- Expenses & Income (Overview) Data ---
  const overviewMetrics = useMemo(() => {
    let totalIncome = 0;
    let totalExpense = 0;
    const expenseByCategory: Record<string, number> = {};
    const monthlyData: Record<string, { income: number; expense: number }> = {};

    for (const t of transactions) {
      if (t.type === 'income') totalIncome += t.amount;
      else if (t.type === 'expense') {
        totalExpense += t.amount;
        expenseByCategory[t.category] = (expenseByCategory[t.category] || 0) + t.amount;
      }

      const month = t.date.substring(0, 7); // YYYY-MM
      if (!monthlyData[month]) monthlyData[month] = { income: 0, expense: 0 };
      if (t.type === 'income') monthlyData[month].income += t.amount;
      if (t.type === 'expense') monthlyData[month].expense += t.amount;
    }

    const months = Object.keys(monthlyData).sort(); // chronological
    const monthlyIncome = months.map(m => monthlyData[m].income);
    const monthlyExpense = months.map(m => monthlyData[m].expense);

    const categories = Object.keys(expenseByCategory).sort((a, b) => expenseByCategory[b] - expenseByCategory[a]);
    const topCategories = categories.slice(0, 6);
    const otherExpense = categories.slice(6).reduce((sum, c) => sum + expenseByCategory[c], 0);
    
    if (otherExpense > 0) topCategories.push('Other');
    const categoryData = topCategories.map(c => c === 'Other' ? otherExpense : expenseByCategory[c]);

    return { totalIncome, totalExpense, months, monthlyIncome, monthlyExpense, topCategories, categoryData };
  }, [transactions]);

  // --- Loans Data ---
  const loansMetrics = useMemo(() => {
    let totalGiven = 0;
    let totalTaken = 0;
    let givenRepaid = 0;
    let takenRepaid = 0;
    let givenLoss = 0;

    const partyBalances: Record<string, number> = {}; // positive = they owe you, negative = you owe them
    const partyRisk: Record<string, { loss: number, total: number }> = {};
    const openLoans: (Loan & { estClearanceStr: string })[] = [];

    for (const l of loans) {
      const remaining = l.remaining_balance || 0;
      const repaid = l.total_repaid || 0;
      const loss = l.loss_amount || 0;

      if (!partyRisk[l.party_name || 'Unknown']) {
        partyRisk[l.party_name || 'Unknown'] = { loss: 0, total: 0 };
      }

      if (l.direction === 'given') {
        totalGiven += l.amount;
        givenRepaid += repaid;
        givenLoss += loss;
        partyBalances[l.party_name || 'Unknown'] = (partyBalances[l.party_name || 'Unknown'] || 0) + remaining;
        partyRisk[l.party_name || 'Unknown'].loss += loss;
        partyRisk[l.party_name || 'Unknown'].total += l.amount;
      } else {
        totalTaken += l.amount;
        takenRepaid += repaid;
        partyBalances[l.party_name || 'Unknown'] = (partyBalances[l.party_name || 'Unknown'] || 0) - remaining;
      }

      if (remaining > 0 && l.status !== 'closed' && l.status !== 'loss') {
         let estStr = "Unknown";
         if (l.due_date) {
            const due = new Date(l.due_date);
            const now = new Date();
            const diff = due.getTime() - now.getTime();
            const days = Math.ceil(diff / (1000 * 3600 * 24));
            if (days < 0) estStr = `Overdue by ${Math.abs(days)} days`;
            else if (days === 0) estStr = "Due today";
            else estStr = `Due in ${days} days`;
         }
         openLoans.push({ ...l, estClearanceStr: estStr });
      }
    }

    const riskyParties = Object.keys(partyRisk).filter(p => partyRisk[p].loss > 0 || (partyRisk[p].total > 0 && partyRisk[p].loss / partyRisk[p].total > 0.3));

    const parties = Object.keys(partyBalances).filter(p => partyBalances[p] !== 0).sort((a, b) => Math.abs(partyBalances[b]) - Math.abs(partyBalances[a])).slice(0, 8);
    const partyData = parties.map(p => partyBalances[p]);
    const partyColors = partyData.map(val => val > 0 ? '#10b981' : '#ef4444');

    return { totalGiven, totalTaken, givenRepaid, takenRepaid, givenLoss, parties, partyData, partyColors, riskyParties, openLoans };
  }, [loans]);

  // --- Fuel Data ---
  const fuelMetrics = useMemo(() => {
    let totalCost = 0;
    let totalLiters = 0;
    const monthlyData: Record<string, { cost: number; liters: number; count: number }> = {};
    const weeklyData: Record<string, { cost: number; liters: number }> = {};
    let lastRefillDate: Date | null = null;
    let totalDaysBetweenRefills = 0;
    let refillIntervalCount = 0;

    const sortedFuelLogs = [...fuelLogs].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

    for (const f of sortedFuelLogs) {
      totalCost += f.total_cost;
      totalLiters += f.liters;

      const date = new Date(f.date);
      if (lastRefillDate) {
         const diff = date.getTime() - lastRefillDate.getTime();
         totalDaysBetweenRefills += diff / (1000 * 3600 * 24);
         refillIntervalCount++;
      }
      lastRefillDate = date;

      const month = f.date.substring(0, 7); // YYYY-MM
      if (!monthlyData[month]) monthlyData[month] = { cost: 0, liters: 0, count: 0 };
      monthlyData[month].cost += f.total_cost;
      monthlyData[month].liters += f.liters;
      monthlyData[month].count += 1;

      // Calculate week string like "2023-W42"
      const firstDayOfYear = new Date(date.getFullYear(), 0, 1);
      const pastDaysOfYear = (date.getTime() - firstDayOfYear.getTime()) / 86400000;
      const weekNum = Math.ceil((pastDaysOfYear + firstDayOfYear.getDay() + 1) / 7);
      const week = `${date.getFullYear()}-W${weekNum.toString().padStart(2, '0')}`;
      
      if (!weeklyData[week]) weeklyData[week] = { cost: 0, liters: 0 };
      weeklyData[week].cost += f.total_cost;
      weeklyData[week].liters += f.liters;
    }

    const months = Object.keys(monthlyData).sort();
    const costData = months.map(m => monthlyData[m].cost);
    const litersData = months.map(m => monthlyData[m].liters);
    const avgPriceData = months.map(m => monthlyData[m].liters > 0 ? monthlyData[m].cost / monthlyData[m].liters : 0);

    const avgDaysBetweenRefills = refillIntervalCount > 0 ? totalDaysBetweenRefills / refillIntervalCount : 0;
    let estNextRefillDate = "N/A";
    if (lastRefillDate && avgDaysBetweenRefills > 0) {
       const nextDate = new Date(lastRefillDate.getTime() + avgDaysBetweenRefills * 24 * 3600 * 1000);
       const daysFromNow = Math.ceil((nextDate.getTime() - new Date().getTime()) / (1000 * 3600 * 24));
       if (daysFromNow <= 0) estNextRefillDate = "Due soon";
       else estNextRefillDate = `In ${daysFromNow} days (${nextDate.toLocaleDateString()})`;
    }

    const weeks = Object.keys(weeklyData).sort().slice(-8); // last 8 weeks
    const weeklyLitersData = weeks.map(w => weeklyData[w].liters);

    return { totalCost, totalLiters, months, costData, litersData, avgPriceData, estNextRefillDate, weeks, weeklyLitersData };
  }, [fuelLogs]);

  if (loading) {
    return (
      <div className="flex justify-center items-center h-full">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-20">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Analytics & Reports</h1>
          <p className="text-muted-foreground mt-1">Deep dive into your financial data.</p>
        </div>
      </div>

      {/* Custom Tabs */}
      <div className="flex bg-muted p-1 rounded-2xl w-full max-w-md overflow-hidden">
        <button
          onClick={() => setActiveTab('overview')}
          className={`flex-1 py-2 text-sm font-semibold rounded-xl flex items-center justify-center gap-2 transition-all duration-300 ${activeTab === 'overview' ? 'bg-primary text-primary-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
        >
          <BarChart3 size={16} /> Overview
        </button>
        <button
          onClick={() => setActiveTab('loans')}
          className={`flex-1 py-2 text-sm font-semibold rounded-xl flex items-center justify-center gap-2 transition-all duration-300 ${activeTab === 'loans' ? 'bg-primary text-primary-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
        >
          <Handshake size={16} /> Loans
        </button>
        <button
          onClick={() => setActiveTab('fuel')}
          className={`flex-1 py-2 text-sm font-semibold rounded-xl flex items-center justify-center gap-2 transition-all duration-300 ${activeTab === 'fuel' ? 'bg-primary text-primary-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
        >
          <Fuel size={16} /> Fuel
        </button>
      </div>

      <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
        
        {/* --- OVERVIEW TAB --- */}
        {activeTab === 'overview' && (
          <div className="space-y-6">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="bg-card p-6 rounded-2xl border border-border">
                <div className="flex items-center justify-between mb-2 text-emerald-500">
                  <span className="text-sm font-medium">All Time Income</span>
                  <TrendingUp size={16} />
                </div>
                <p className="text-2xl font-bold">{formatAmount(overviewMetrics.totalIncome)}</p>
              </div>
              <div className="bg-card p-6 rounded-2xl border border-border">
                <div className="flex items-center justify-between mb-2 text-destructive">
                  <span className="text-sm font-medium">All Time Expenses</span>
                  <TrendingDown size={16} />
                </div>
                <p className="text-2xl font-bold">{formatAmount(overviewMetrics.totalExpense)}</p>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Income vs Expense Over Time */}
              <div className="bg-card p-6 rounded-2xl border border-border">
                <h3 className="text-lg font-semibold mb-6 flex items-center gap-2">
                  <BarChart3 size={18} className="text-primary" /> Cash Flow Over Time
                </h3>
                <div className="h-64">
                  {overviewMetrics.months.length > 0 ? (
                    <Bar 
                      data={{
                        labels: overviewMetrics.months,
                        datasets: [
                          { label: 'Income', data: overviewMetrics.monthlyIncome, backgroundColor: '#10b981', borderRadius: 6 },
                          { label: 'Expense', data: overviewMetrics.monthlyExpense, backgroundColor: '#ef4444', borderRadius: 6 }
                        ]
                      }} 
                      options={{ maintainAspectRatio: false, scales: { x: { grid: { display: false } } }, plugins: { legend: { position: 'top' } } }} 
                    />
                  ) : <div className="h-full flex items-center justify-center text-muted-foreground">No data available</div>}
                </div>
              </div>

              {/* Expense Breakdown */}
              <div className="bg-card p-6 rounded-2xl border border-border">
                <h3 className="text-lg font-semibold mb-6 flex items-center gap-2">
                  <PieChartIcon size={18} className="text-primary" /> Expense Breakdown
                </h3>
                <div className="h-64">
                  {overviewMetrics.topCategories.length > 0 ? (
                    <Doughnut 
                      data={{
                        labels: overviewMetrics.topCategories,
                        datasets: [{ data: overviewMetrics.categoryData, backgroundColor: ['#3b82f6', '#ef4444', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899', '#6b7280'], borderWidth: 0, hoverOffset: 8 }]
                      }}
                      options={{ maintainAspectRatio: false, cutout: '70%', plugins: { legend: { position: 'right' } } }}
                    />
                  ) : <div className="h-full flex items-center justify-center text-muted-foreground">No data available</div>}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* --- LOANS TAB --- */}
        {activeTab === 'loans' && (
          <div className="space-y-6">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="bg-card p-6 rounded-2xl border border-emerald-500/20 relative overflow-hidden group">
                <div className="absolute top-0 right-0 p-4 opacity-10">
                  <Handshake size={64} />
                </div>
                <span className="text-sm font-medium text-emerald-500 mb-2 block">Total Given Out</span>
                <p className="text-2xl font-bold">{formatAmount(loansMetrics.totalGiven)}</p>
                <div className="mt-4 pt-4 border-t border-border flex justify-between text-xs text-muted-foreground">
                  <span>Repaid: <span className="text-foreground">{formatAmount(loansMetrics.givenRepaid)}</span></span>
                  {loansMetrics.givenLoss > 0 && <span className="text-destructive">Loss: {formatAmount(loansMetrics.givenLoss)}</span>}
                </div>
              </div>
              <div className="bg-card p-6 rounded-2xl border border-rose-500/20 relative overflow-hidden group">
                <div className="absolute top-0 right-0 p-4 opacity-10 text-rose-500">
                  <Wallet size={64} />
                </div>
                <span className="text-sm font-medium text-rose-500 mb-2 block">Total Taken (Borrowed)</span>
                <p className="text-2xl font-bold">{formatAmount(loansMetrics.totalTaken)}</p>
                <div className="mt-4 pt-4 border-t border-border flex justify-between text-xs text-muted-foreground">
                  <span>Repaid: <span className="text-foreground">{formatAmount(loansMetrics.takenRepaid)}</span></span>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="bg-card p-6 rounded-2xl border border-border">
                <h3 className="text-lg font-semibold mb-6">Net Party Balances</h3>
                <p className="text-xs text-muted-foreground mb-4">Positive (Green) = They owe you. Negative (Red) = You owe them.</p>
                <div className="h-64">
                  {loansMetrics.parties.length > 0 ? (
                    <Bar 
                      data={{
                        labels: loansMetrics.parties,
                        datasets: [{ label: 'Net Balance', data: loansMetrics.partyData, backgroundColor: loansMetrics.partyColors, borderRadius: 4 }]
                      }} 
                      options={{ maintainAspectRatio: false, indexAxis: 'y', scales: { x: { grid: { color: 'rgba(0,0,0,0.05)' } }, y: { grid: { display: false } } }, plugins: { legend: { display: false } } }} 
                    />
                  ) : <div className="h-full flex items-center justify-center text-muted-foreground">No pending loan balances</div>}
                </div>
              </div>

              <div className="space-y-6">
                 {loansMetrics.riskyParties.length > 0 && (
                   <div className="bg-destructive/10 p-4 rounded-2xl border border-destructive/20">
                     <h3 className="text-sm font-semibold text-destructive mb-2 flex items-center gap-2">
                       <TrendingDown size={16} /> High Risk Parties
                     </h3>
                     <p className="text-xs text-destructive/80 mb-2">Consider avoiding giving loans to these parties due to high losses or poor repayment history:</p>
                     <ul className="list-disc pl-5 text-sm text-destructive">
                       {loansMetrics.riskyParties.map(p => <li key={p}>{p}</li>)}
                     </ul>
                   </div>
                 )}

                 <div className="bg-card p-6 rounded-2xl border border-border">
                    <h3 className="text-sm font-semibold mb-4">Est. Recovery & Clearance Dates</h3>
                    {loansMetrics.openLoans.length > 0 ? (
                      <div className="space-y-3 max-h-60 overflow-y-auto pr-2">
                        {loansMetrics.openLoans.map(l => (
                          <div key={l.id} className="flex justify-between items-center text-sm border-b border-border pb-2">
                            <div>
                               <p className="font-medium">{l.party_name || 'Unknown'}</p>
                               <p className="text-xs text-muted-foreground">{l.direction === 'given' ? 'You gave' : 'You took'} {formatAmount(l.amount)}</p>
                            </div>
                            <div className="text-right">
                               <p className={`font-semibold ${l.estClearanceStr.includes('Overdue') ? 'text-destructive' : 'text-primary'}`}>{l.estClearanceStr}</p>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-sm text-muted-foreground">No open loans.</p>
                    )}
                 </div>
              </div>
            </div>
          </div>
        )}

        {/* --- FUEL TAB --- */}
        {activeTab === 'fuel' && (
          <div className="space-y-6">
             <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="bg-card p-6 rounded-2xl border border-blue-500/20">
                <div className="flex items-center justify-between mb-2 text-blue-500">
                  <span className="text-sm font-medium">Total Fuel Spent</span>
                  <Fuel size={16} />
                </div>
                <p className="text-2xl font-bold">{formatAmount(fuelMetrics.totalCost)}</p>
              </div>
              <div className="bg-card p-6 rounded-2xl border border-border">
                <div className="flex items-center justify-between mb-2 text-muted-foreground">
                  <span className="text-sm font-medium">Total Liters Consumed</span>
                  <TrendingUp size={16} />
                </div>
                <p className="text-2xl font-bold">{fuelMetrics.totalLiters.toFixed(2)} L</p>
              </div>
            </div>

            <div className="bg-card p-6 rounded-2xl border border-border mb-6">
              <div className="flex items-center gap-2">
                <Fuel className="text-primary" size={20} />
                <h3 className="text-lg font-semibold">Estimated Next Refill</h3>
              </div>
              <p className="text-2xl font-bold mt-2 text-primary">{fuelMetrics.estNextRefillDate}</p>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
               <div className="bg-card p-6 rounded-2xl border border-border">
                 <h3 className="text-lg font-semibold mb-6 flex items-center gap-2">
                   <TrendingUp size={18} className="text-primary" /> Fuel Cost & Price Trend
                 </h3>
                 <div className="h-64">
                   {fuelMetrics.months.length > 0 ? (
                     <Line 
                       data={{
                         labels: fuelMetrics.months,
                         datasets: [
                           { label: 'Total Cost', data: fuelMetrics.costData, borderColor: '#3b82f6', backgroundColor: '#3b82f6', tension: 0.3, yAxisID: 'y' },
                           { label: 'Avg Price/L', data: fuelMetrics.avgPriceData, borderColor: '#f59e0b', backgroundColor: '#f59e0b', borderDash: [5, 5], tension: 0.3, yAxisID: 'y1' }
                         ]
                       }} 
                       options={{ 
                         maintainAspectRatio: false, 
                         interaction: { mode: 'index', intersect: false },
                         scales: { 
                           x: { grid: { display: false } },
                           y: { type: 'linear', display: true, position: 'left', grid: { color: 'rgba(0,0,0,0.05)' } },
                           y1: { type: 'linear', display: true, position: 'right', grid: { drawOnChartArea: false } }
                         }, 
                         plugins: { legend: { position: 'top' } } 
                       }} 
                     />
                   ) : <div className="h-full flex items-center justify-center text-muted-foreground">No data available</div>}
                 </div>
               </div>

               <div className="bg-card p-6 rounded-2xl border border-border">
                 <h3 className="text-lg font-semibold mb-6 flex items-center gap-2">
                   <BarChart3 size={18} className="text-primary" /> Weekly Consumption (Liters)
                 </h3>
                 <div className="h-64">
                   {fuelMetrics.weeks.length > 0 ? (
                     <Bar 
                       data={{
                         labels: fuelMetrics.weeks,
                         datasets: [
                           { label: 'Liters', data: fuelMetrics.weeklyLitersData, backgroundColor: '#10b981', borderRadius: 4 }
                         ]
                       }} 
                       options={{ maintainAspectRatio: false, scales: { x: { grid: { display: false } } }, plugins: { legend: { display: false } } }} 
                     />
                   ) : <div className="h-full flex items-center justify-center text-muted-foreground">No data available</div>}
                 </div>
               </div>
            </div>
          </div>
        )}

      </div>
    </div>
  );
};

export default Reports;
