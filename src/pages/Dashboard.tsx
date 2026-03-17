import React, { useEffect, useState } from 'react';
import { getSummary, getExpensesByCategory, getNetWorth, getPaymentMethodStats } from '../db/queries';
import { Doughnut, Pie } from 'react-chartjs-2';
import { Chart as ChartJS, ArcElement, Tooltip, Legend } from 'chart.js';
import { ArrowDownIcon, ArrowUpIcon, Wallet, PiggyBank } from 'lucide-react';
import { useCurrency } from '../contexts/CurrencyContext';

ChartJS.register(ArcElement, Tooltip, Legend);

const Dashboard: React.FC = () => {
  const { formatAmount } = useCurrency();
  const [summary, setSummary] = useState({ income: 0, expense: 0, balance: 0 });
  const [netWorth, setNetWorth] = useState(0);
  const [categoryChart, setCategoryChart] = useState<any>(null);
  const [paymentChart, setPaymentChart] = useState<any>(null);
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

      const [sum, nw, cats, payments] = await Promise.all([
        getSummary(),
        getNetWorth(),
        getExpensesByCategory(year, month),
        getPaymentMethodStats()
      ]);

      setSummary({
        income: sum.income || 0,
        expense: sum.expense || 0,
        balance: (sum.income || 0) - (sum.expense || 0)
      });
      setNetWorth(nw);

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
      <h1 className="text-2xl font-bold">Financial Overview</h1>

      {/* Primary Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-primary text-primary-foreground p-6 rounded-2xl shadow-lg">
          <div className="flex items-center justify-between mb-2 opacity-80">
            <span className="text-sm font-medium">Net Worth</span>
            <Wallet size={18} />
          </div>
          <p className="text-3xl font-black">{formatAmount(netWorth)}</p>
        </div>

        <div className="bg-card p-6 rounded-2xl shadow-sm border border-border">
          <div className="flex items-center justify-between mb-2 text-emerald-500">
            <span className="text-sm font-medium">Monthly Income</span>
            <ArrowUpIcon size={18} />
          </div>
          <p className="text-2xl font-bold">{formatAmount(summary.income)}</p>
        </div>

        <div className="bg-card p-6 rounded-2xl shadow-sm border border-border">
          <div className="flex items-center justify-between mb-2 text-destructive">
            <span className="text-sm font-medium">Monthly Expense</span>
            <ArrowDownIcon size={18} />
          </div>
          <p className="text-2xl font-bold">{formatAmount(summary.expense)}</p>
        </div>

        <div className="bg-card p-6 rounded-2xl shadow-sm border border-border">
          <div className="flex items-center justify-between mb-2 text-primary">
            <span className="text-sm font-medium">Savings Rate</span>
            <PiggyBank size={18} />
          </div>
          <p className="text-2xl font-bold">{savingsRate.toFixed(1)}%</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-8">
        {/* Category Chart */}
        <div className="bg-card p-6 rounded-2xl shadow-sm border border-border">
          <h2 className="text-lg font-semibold mb-6">Expenses by Category</h2>
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

