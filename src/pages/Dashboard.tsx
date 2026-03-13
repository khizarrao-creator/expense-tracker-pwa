import React, { useEffect, useState } from 'react';
import { getSummary, getExpensesByCategory } from '../db/queries';
import { Doughnut } from 'react-chartjs-2';
import { Chart as ChartJS, ArcElement, Tooltip, Legend } from 'chart.js';
import { ArrowDownIcon, ArrowUpIcon, Wallet } from 'lucide-react';

ChartJS.register(ArcElement, Tooltip, Legend);

const Dashboard: React.FC = () => {
  const [summary, setSummary] = useState({ income: 0, expense: 0, balance: 0 });
  const [chartData, setChartData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const now = new Date();
      const year = now.getFullYear().toString();
      const month = (now.getMonth() + 1).toString();

      const sum = await getSummary();
      setSummary({
        income: sum.income || 0,
        expense: sum.expense || 0,
        balance: (sum.income || 0) - (sum.expense || 0)
      });

      const categoriesData = await getExpensesByCategory(year, month);
      
      if (categoriesData && categoriesData.length > 0) {
        setChartData({
          labels: categoriesData.map((d: any) => d.category),
          datasets: [
            {
              data: categoriesData.map((d: any) => d.total),
              backgroundColor: [
                '#3b82f6', '#ef4444', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899', '#6b7280'
              ],
              borderWidth: 0,
              hoverOffset: 4
            }
          ]
        });
      }
    } catch (error) {
      console.error('Failed to load dashboard data', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center h-full">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Dashboard</h1>
      
      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-card p-6 rounded-2xl shadow-sm border border-border">
          <div className="flex items-center justify-between mb-4 text-muted-foreground">
            <span className="font-medium">Total Balance</span>
            <Wallet size={20} />
          </div>
          <p className={`text-3xl font-bold ${summary.balance < 0 ? 'text-destructive' : ''}`}>
            ${summary.balance.toFixed(2)}
          </p>
        </div>

        <div className="bg-card p-6 rounded-2xl shadow-sm border border-border">
          <div className="flex items-center justify-between mb-4 text-emerald-500">
            <span className="font-medium">Total Income</span>
            <div className="bg-emerald-500/10 p-1 rounded-full">
              <ArrowUpIcon size={16} />
            </div>
          </div>
          <p className="text-3xl font-bold">
            ${summary.income.toFixed(2)}
          </p>
        </div>

        <div className="bg-card p-6 rounded-2xl shadow-sm border border-border">
          <div className="flex items-center justify-between mb-4 text-destructive">
            <span className="font-medium">Total Expenses</span>
            <div className="bg-destructive/10 p-1 rounded-full">
              <ArrowDownIcon size={16} />
            </div>
          </div>
          <p className="text-3xl font-bold">
            ${summary.expense.toFixed(2)}
          </p>
        </div>
      </div>

      {/* Chart Section */}
      <div className="bg-card p-6 rounded-2xl shadow-sm border border-border mt-8">
        <h2 className="text-lg font-semibold mb-6">Current Month Expenses</h2>
        <div className="h-64 flex justify-center items-center">
          {chartData ? (
            <Doughnut 
              data={chartData} 
              options={{ maintainAspectRatio: false, cutout: '70%' }} 
            />
          ) : (
            <p className="text-muted-foreground text-sm">No expenses recorded this month.</p>
          )}
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
