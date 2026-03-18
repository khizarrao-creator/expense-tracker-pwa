import React, { useEffect, useState } from 'react';
import {
  getSummary,
  getExpensesByCategory,
  getNetWorth,
  getPaymentMethodStats,
  getMonthlyComparison,
  getBurnRate,
  getCategorySpikes,
  calculatePortfolioValue
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
import { ArrowDownIcon, ArrowUpIcon, Wallet, Zap, TrendingUp, TrendingDown, Banknote } from 'lucide-react';
import { useCurrency } from '../contexts/CurrencyContext';

ChartJS.register(ArcElement, Tooltip, Legend, CategoryScale, LinearScale, BarElement);

const Dashboard: React.FC = () => {
  const { formatAmount } = useCurrency();
  const [summary, setSummary] = useState({ income: 0, expense: 0, balance: 0 });
  const [netWorth, setNetWorth] = useState(0);
  const [categoryChart, setCategoryChart] = useState<any>(null);
  const [paymentChart, setPaymentChart] = useState<any>(null);
  const [cashFlowChart, setCashFlowChart] = useState<any>(null);
  const [burnRate, setBurnRate] = useState(0);
  const [insights, setInsights] = useState<any[]>([]);
  const [monthlyComp, setMonthlyComp] = useState<any>(null);
  const [portfolioValue, setPortfolioValue] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadData();

    const handleSyncComplete = () => {
      loadData();
    };

    window.addEventListener('app-sync-complete', handleSyncComplete);
    return () => {
      window.removeEventListener('app-sync-complete', handleSyncComplete);
    };
  }, []);

  const loadData = async () => {
    try {
      const now = new Date();
      const year = now.getFullYear().toString();
      const month = (now.getMonth() + 1).toString();

      const [sum, nw, cats, payments, comp, burn, spikes, pValue] = await Promise.all([
        getSummary(),
        getNetWorth(),
        getExpensesByCategory(year, month),
        getPaymentMethodStats(),
        getMonthlyComparison(),
        getBurnRate(),
        getCategorySpikes(),
        calculatePortfolioValue()
      ]);

      setSummary({
        income: sum.income || 0,
        expense: sum.expense || 0,
        balance: (sum.income || 0) - (sum.expense || 0)
      });
      setNetWorth(nw);
      setPortfolioValue(pValue);
      setMonthlyComp(comp);
      setBurnRate(burn);
      setInsights(spikes);

      if (cats && cats.length > 0) {
        setCategoryChart({
          labels: cats.map((d: any) => d.category),
          datasets: [{
            data: cats.map((d: any) => d.total),
            backgroundColor: ['#3b82f6', '#ef4444', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899', '#6b7280'],
            borderWidth: 0,
            hoverOffset: 4
          }]
        });
      }

      setCashFlowChart({
        labels: ['Previous Month', 'Current Month'],
        datasets: [
          {
            label: 'Income',
            data: [comp.prev_income, comp.current_income],
            backgroundColor: '#10b981',
            borderRadius: 8,
          },
          {
            label: 'Expense',
            data: [comp.prev_expense, comp.current_expense],
            backgroundColor: '#ef4444',
            borderRadius: 8,
          }
        ]
      });

      if (payments && payments.length > 0) {
        setPaymentChart({
          labels: payments.map((d: any) => d.payment_method),
          datasets: [{
            data: payments.map((d: any) => d.total),
            backgroundColor: ['#6366f1', '#8b5cf6', '#d946ef', '#f43f5e'],
            borderWidth: 0
          }]
        });
      }
    } catch (error) {
      console.error('Failed to load dashboard data', error);
    } finally {
      setLoading(false);
    }
  };

  const savingsRate = summary.income > 0 ? ((summary.income - summary.expense) / summary.income) * 100 : 0;

  if (loading) {
    return (
      <div className="flex justify-center items-center h-full">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Financial Overview</h1>
        <div className="bg-card px-4 py-2 rounded-xl border border-border flex items-center gap-2">
          <Zap size={16} className="text-primary animate-pulse" />
          <span className="text-sm font-medium">Daily Burn: {formatAmount(burnRate)}</span>
        </div>
      </div>

      {/* Primary Stats */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <div className="bg-primary text-primary-foreground p-6 rounded-2xl shadow-lg relative overflow-hidden group col-span-2 md:col-span-1">
          <div className="absolute -right-4 -bottom-4 bg-white/10 w-24 h-24 rounded-full blur-2xl group-hover:scale-150 transition-transform duration-500" />
          <div className="flex items-center justify-between mb-2 opacity-80">
            <span className="text-sm font-medium">Total Net Worth</span>
            <Wallet size={18} />
          </div>
          <p className="text-3xl font-black">{formatAmount(netWorth + portfolioValue)}</p>
        </div>

        <div className="bg-card p-6 rounded-2xl shadow-sm border border-border">
          <div className="flex items-center justify-between mb-2 text-emerald-500">
            <span className="text-sm font-medium">Monthly Income</span>
            <ArrowUpIcon size={18} />
          </div>
          <p className="text-xl font-bold">{formatAmount(summary.income)}</p>
        </div>

        <div className="bg-card p-6 rounded-2xl shadow-sm border border-border">
          <div className="flex items-center justify-between mb-2 text-destructive">
            <span className="text-sm font-medium">Monthly Expense</span>
            <ArrowDownIcon size={18} />
          </div>
          <p className="text-xl font-bold">{formatAmount(summary.expense)}</p>
        </div>

        <div className="bg-card p-6 rounded-2xl shadow-sm border border-border">
          <div className="flex items-center justify-between mb-2 text-amber-500">
            <span className="text-sm font-medium">Investments</span>
            <TrendingUp size={18} />
          </div>
          <p className="text-xl font-bold">{formatAmount(portfolioValue)}</p>
        </div>

        <div className="bg-card p-6 rounded-2xl shadow-sm border border-border">
          <div className="flex items-center justify-between mb-2 text-primary">
            <span className="text-sm font-medium">Savings Rate</span>
            <Banknote size={18} />
          </div>
          <p className="text-xl font-bold">{savingsRate.toFixed(1)}%</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Intelligence Brief */}
        <div className="lg:col-span-1 bg-card p-6 rounded-2xl shadow-sm border border-border h-full">
          <h2 className="text-lg font-semibold mb-6 flex items-center gap-2">
            <Zap size={20} className="text-primary" />
            Intelligence Brief
          </h2>
          <div className="space-y-4">
            {monthlyComp && (
              <div className="p-4 rounded-xl bg-muted/50 border border-border">
                <div className="flex items-start gap-3">
                  {monthlyComp.current_expense > monthlyComp.prev_expense ? (
                    <TrendingUp className="text-destructive mt-1 shrink-0" size={18} />
                  ) : (
                    <TrendingDown className="text-emerald-500 mt-1 shrink-0" size={18} />
                  )}
                  <div>
                    <p className="text-sm font-medium">
                      {monthlyComp.prev_expense === 0
                        ? "Great start! You've started tracking your finances."
                        : monthlyComp.current_expense > monthlyComp.prev_expense
                          ? `Spending is up by ${(((monthlyComp.current_expense - monthlyComp.prev_expense) / monthlyComp.prev_expense) * 100).toFixed(0)}%`
                          : `Good job! You've spent less than last month.`}
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">
                      {monthlyComp.prev_expense === 0 ? "Comparison will be available next month" : "Compared to previous month metrics"}
                    </p>
                  </div>
                </div>
              </div>
            )}

            {insights.map((insight, idx) => (
              <div key={idx} className="p-4 rounded-xl bg-orange-500/5 border border-orange-500/20">
                <p className="text-sm font-medium text-orange-600">
                  {insight.category} expense hiked!
                </p>
                <p className="text-xs text-orange-500/80 mt-1">
                  Increased by {insight.increase_pct.toFixed(0)}% from last month
                </p>
              </div>
            ))}

            {(insights.length === 0 || (monthlyComp && monthlyComp.prev_expense === 0)) && (
              <div className="flex flex-col items-center justify-center py-8 opacity-50">
                <p className="text-muted-foreground text-sm italic">Gathering data for more insights...</p>
              </div>
            )}
          </div>
        </div>

        {/* Cash Flow Analysis */}
        <div className="lg:col-span-2 bg-card p-6 rounded-2xl shadow-sm border border-border h-full">
          <h2 className="text-lg font-semibold mb-6">Cash Flow Analysis</h2>
          <div className="h-64">
            {cashFlowChart ? (
              <Bar
                data={cashFlowChart}
                options={{
                  maintainAspectRatio: false,
                  scales: {
                    x: { grid: { display: false } },
                    y: { beginAtZero: true, grid: { color: 'rgba(0,0,0,0.05)' } }
                  },
                  plugins: {
                    legend: { position: 'top', labels: { usePointStyle: true, padding: 15 } }
                  }
                }}
              />
            ) : (
              <div className="h-full flex items-center justify-center">
                <p className="text-muted-foreground text-sm">Loading cash flow data...</p>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-8">
        {/* Category Chart */}
        <div className="bg-card p-6 rounded-2xl shadow-sm border border-border">
          <h2 className="text-lg font-semibold mb-6 text-center">Expenses by Category</h2>
          <div className="h-64 flex justify-center items-center">
            {categoryChart ? (
              <Doughnut
                data={categoryChart}
                options={{ maintainAspectRatio: false, cutout: '70%', plugins: { legend: { position: 'bottom', labels: { usePointStyle: true, padding: 20 } } } }}
              />
            ) : (
              <p className="text-muted-foreground text-sm">No data this month.</p>
            )}
          </div>
        </div>

        {/* Payment Method Chart */}
        <div className="bg-card p-6 rounded-2xl shadow-sm border border-border">
          <h2 className="text-lg font-semibold mb-6 text-center">Payment Methods</h2>
          <div className="h-64 flex justify-center items-center">
            {paymentChart ? (
              <Pie
                data={paymentChart}
                options={{ maintainAspectRatio: false, plugins: { legend: { position: 'bottom', labels: { usePointStyle: true, padding: 20 } } } }}
              />
            ) : (
              <p className="text-muted-foreground text-sm">No data recorded.</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;

