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

type TabType = 'overview' | 'forecasting' | 'loans' | 'fuel';

// --- Forecasting Mathematical Models ---
const forecastLinearRegression = (history: number[], horizon: number) => {
  const n = history.length;
  if (n === 0) {
    return {
      forecast: Array(horizon).fill(0),
      growthRate: 0,
      r2: 0,
      slope: 0
    };
  }
  if (n === 1) {
    return {
      forecast: Array(horizon).fill(history[0]),
      growthRate: 0,
      r2: 1,
      slope: 0
    };
  }

  let sumX = 0;
  let sumY = 0;
  let sumXY = 0;
  let sumXX = 0;
  for (let i = 0; i < n; i++) {
    sumX += i;
    sumY += history[i];
    sumXY += i * history[i];
    sumXX += i * i;
  }

  const slope = (n * sumXY - sumX * sumY) / (n * sumXX - sumX * sumX);
  const intercept = (sumY - slope * sumX) / n;

  const avgY = sumY / n;
  let ssTotal = 0;
  let ssRes = 0;
  for (let i = 0; i < n; i++) {
    const predY = slope * i + intercept;
    ssTotal += Math.pow(history[i] - avgY, 2);
    ssRes += Math.pow(history[i] - predY, 2);
  }
  const r2 = ssTotal === 0 ? 1 : 1 - (ssRes / ssTotal);

  const forecast: number[] = [];
  for (let i = n; i < n + horizon; i++) {
    const val = slope * i + intercept;
    forecast.push(Math.max(0, val));
  }

  const growthRate = avgY > 0 ? (slope / avgY) * 100 : 0;

  return {
    forecast,
    growthRate,
    r2,
    slope
  };
};

const forecastWeightedMovingAverage = (history: number[], horizon: number) => {
  const n = history.length;
  if (n === 0) return Array(horizon).fill(0);
  if (n === 1) return Array(horizon).fill(history[0]);

  const forecast: number[] = [];
  const tempHistory = [...history];

  for (let h = 0; h < horizon; h++) {
    const len = tempHistory.length;
    let nextVal = 0;
    if (len >= 3) {
      nextVal = (tempHistory[len - 1] * 3 + tempHistory[len - 2] * 2 + tempHistory[len - 3] * 1) / 6;
    } else if (len === 2) {
      nextVal = (tempHistory[len - 1] * 2 + tempHistory[len - 2] * 1) / 3;
    } else {
      nextVal = tempHistory[0];
    }

    forecast.push(Math.max(0, nextVal));
    tempHistory.push(nextVal);
  }

  return forecast;
};

const getFutureMonthLabels = (lastMonthStr: string, horizon: number) => {
  if (!lastMonthStr) {
    const now = new Date();
    lastMonthStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  }

  const [yearStr, monthStr] = lastMonthStr.split('-');
  let year = parseInt(yearStr);
  let month = parseInt(monthStr);

  const labels: string[] = [];
  for (let i = 0; i < horizon; i++) {
    month++;
    if (month > 12) {
      month = 1;
      year++;
    }
    const dateObj = new Date(year, month - 1, 1);
    labels.push(dateObj.toLocaleDateString(undefined, { year: '2-digit', month: 'short' }));
  }
  return labels;
};

const Reports: React.FC = () => {
  const { formatAmount, currency } = useCurrency();
  const [activeTab, setActiveTab] = useState<TabType>('overview');
  const [loading, setLoading] = useState(true);

  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loans, setLoans] = useState<Loan[]>([]);
  const [fuelLogs, setFuelLogs] = useState<FuelLog[]>([]);

  // Fuel analytics states
  const [selectedFuelType, setSelectedFuelType] = useState<string>('all');
  const [chartMetric, setChartMetric] = useState<'cost' | 'liters' | 'price'>('cost');
  const [chartGrouping, setChartGrouping] = useState<'monthly' | 'per_refill'>('monthly');

  // Overview analytics states
  const [overviewPeriod, setOverviewPeriod] = useState<'30days' | '6months' | 'thisyear' | 'all'>('all');
  const [cashFlowChartStyle, setCashFlowChartStyle] = useState<'bar' | 'line'>('bar');

  // Forecasting analytics states
  const [forecastMetric, setForecastMetric] = useState<'income' | 'expense' | 'fuel_cost' | 'fuel_liters'>('expense');
  const [forecastHorizon, setForecastHorizon] = useState<3 | 6 | 12>(6);
  const [forecastModel, setForecastModel] = useState<'linear' | 'wma'>('linear');

  // Loans analytics states
  const [loansChartFilter, setLoansChartFilter] = useState<'all' | 'active' | 'given' | 'taken'>('all');

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
    // Filter transactions by selected period
    const now = new Date();
    let cutOffDateStr = '';

    if (overviewPeriod === '30days') {
      const cutOff = new Date();
      cutOff.setDate(now.getDate() - 30);
      cutOffDateStr = cutOff.toISOString().split('T')[0];
    } else if (overviewPeriod === '6months') {
      const cutOff = new Date();
      cutOff.setMonth(now.getMonth() - 6);
      cutOffDateStr = cutOff.toISOString().split('T')[0];
    } else if (overviewPeriod === 'thisyear') {
      cutOffDateStr = `${now.getFullYear()}-01-01`;
    }

    const filteredTransactions = cutOffDateStr
      ? transactions.filter(t => t.date >= cutOffDateStr)
      : transactions;

    let totalIncome = 0;
    let totalExpense = 0;
    const expenseByCategory: Record<string, number> = {};
    const monthlyData: Record<string, { income: number; expense: number }> = {};

    for (const t of filteredTransactions) {
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

    // Advanced Metrics
    const netSavings = totalIncome - totalExpense;
    const savingsRate = totalIncome > 0 ? (netSavings / totalIncome) * 100 : 0;

    // Average Monthly Burn: total expenses / number of months with expenses in the period
    const activeMonthsCount = Math.max(1, months.length);
    const avgMonthlyBurn = totalExpense / activeMonthsCount;

    const categories = Object.keys(expenseByCategory).sort((a, b) => expenseByCategory[b] - expenseByCategory[a]);
    const topCategories = categories.slice(0, 6);
    const otherExpense = categories.slice(6).reduce((sum, c) => sum + expenseByCategory[c], 0);

    if (otherExpense > 0) topCategories.push('Other');
    const categoryData = topCategories.map(c => c === 'Other' ? otherExpense : expenseByCategory[c]);

    return {
      totalIncome,
      totalExpense,
      months,
      monthlyIncome,
      monthlyExpense,
      topCategories,
      categoryData,
      netSavings,
      savingsRate,
      avgMonthlyBurn
    };
  }, [transactions, overviewPeriod]);

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

    // Loans performance ratios
    const netGivenTarget = totalGiven - givenLoss;
    const recoveryRate = netGivenTarget > 0 ? (givenRepaid / netGivenTarget) * 100 : 0;
    const repaymentRate = totalTaken > 0 ? (takenRepaid / totalTaken) * 100 : 0;

    // Total outstanding Owed To You vs You Owe
    let outstandingGiven = 0;
    let outstandingTaken = 0;
    Object.keys(partyBalances).forEach(party => {
      const balance = partyBalances[party];
      if (balance > 0) outstandingGiven += balance;
      else if (balance < 0) outstandingTaken += Math.abs(balance);
    });

    const netOwedPosition = outstandingGiven - outstandingTaken;

    // Filter and Sort Party Balances for the chart
    let filteredParties = Object.keys(partyBalances);

    if (loansChartFilter === 'active') {
      filteredParties = filteredParties.filter(p => partyBalances[p] !== 0);
    } else if (loansChartFilter === 'given') {
      filteredParties = filteredParties.filter(p => partyBalances[p] > 0);
    } else if (loansChartFilter === 'taken') {
      filteredParties = filteredParties.filter(p => partyBalances[p] < 0);
    }

    const sortedParties = filteredParties
      .sort((a, b) => Math.abs(partyBalances[b]) - Math.abs(partyBalances[a]))
      .slice(0, 8);

    const partyData = sortedParties.map(p => partyBalances[p]);
    const partyColors = partyData.map(val => val > 0 ? '#10b981' : '#ef4444');

    const riskyParties = Object.keys(partyRisk).filter(
      p => partyRisk[p].loss > 0 || (partyRisk[p].total > 0 && partyRisk[p].loss / partyRisk[p].total > 0.3)
    );

    return {
      totalGiven,
      totalTaken,
      givenRepaid,
      takenRepaid,
      givenLoss,
      parties: sortedParties,
      partyData,
      partyColors,
      riskyParties,
      openLoans,
      recoveryRate,
      repaymentRate,
      outstandingGiven,
      outstandingTaken,
      netOwedPosition
    };
  }, [loans, loansChartFilter]);

  // --- Forecasting Projections Data ---
  const forecastingMetrics = useMemo(() => {
    // 1. Group transactions (all time) by month
    const monthlyData: Record<string, { income: number; expense: number }> = {};
    for (const t of transactions) {
      const month = t.date.substring(0, 7); // YYYY-MM
      if (!monthlyData[month]) monthlyData[month] = { income: 0, expense: 0 };
      if (t.type === 'income') monthlyData[month].income += t.amount;
      if (t.type === 'expense') monthlyData[month].expense += t.amount;
    }

    // Group fuel logs by month
    const monthlyFuelData: Record<string, { cost: number; liters: number }> = {};
    for (const f of fuelLogs) {
      const month = f.date.substring(0, 7);
      if (!monthlyFuelData[month]) monthlyFuelData[month] = { cost: 0, liters: 0 };
      monthlyFuelData[month].cost += f.total_cost;
      monthlyFuelData[month].liters += f.liters;
    }

    const allMonths = Array.from(new Set([
      ...Object.keys(monthlyData),
      ...Object.keys(monthlyFuelData)
    ])).sort(); // chronological list of all months

    // Build metric histories
    const history: number[] = [];
    const labels: string[] = [];

    allMonths.forEach(m => {
      const [year, month] = m.split('-');
      const dateObj = new Date(parseInt(year), parseInt(month) - 1, 1);
      const label = dateObj.toLocaleDateString(undefined, { year: '2-digit', month: 'short' });

      labels.push(label);

      if (forecastMetric === 'income') {
        history.push(monthlyData[m]?.income || 0);
      } else if (forecastMetric === 'expense') {
        history.push(monthlyData[m]?.expense || 0);
      } else if (forecastMetric === 'fuel_cost') {
        history.push(monthlyFuelData[m]?.cost || 0);
      } else if (forecastMetric === 'fuel_liters') {
        history.push(monthlyFuelData[m]?.liters || 0);
      }
    });

    const hasEnoughHistory = history.filter(val => val > 0).length >= 2;

    if (!hasEnoughHistory) {
      return {
        hasEnoughHistory: false,
        combinedLabels: [],
        historicalDataset: [],
        forecastDataset: [],
        stats: {
          avgHistory: 0,
          nextMonthProjected: 0,
          totalProjectedHorizon: 0,
          growthRate: 0,
          r2: 0
        },
        insight: ''
      };
    }

    const linearResult = forecastLinearRegression(history, forecastHorizon);

    let forecastValues: number[] = [];
    if (forecastModel === 'linear') {
      forecastValues = linearResult.forecast;
    } else {
      forecastValues = forecastWeightedMovingAverage(history, forecastHorizon);
    }

    const lastMonthRaw = allMonths[allMonths.length - 1];
    const futureLabels = getFutureMonthLabels(lastMonthRaw, forecastHorizon);

    const combinedLabels = [...labels, ...futureLabels];
    const historicalDataset = [...history, ...Array(forecastHorizon).fill(null)];
    const forecastDataset = [
      ...Array(history.length - 1).fill(null),
      history[history.length - 1],
      ...forecastValues
    ];

    const avgHistory = history.reduce((sum, v) => sum + v, 0) / history.length;
    const nextMonthProjected = forecastValues[0] || 0;
    const totalProjectedHorizon = forecastValues.reduce((sum, v) => sum + v, 0);

    let insight = '';
    const growthTrend = linearResult.slope;

    if (forecastMetric === 'expense') {
      if (growthTrend > 1000) {
        insight = `⚠️ Alert: Your monthly spending is trending upwards by ${formatAmount(growthTrend)} per month. If this rate continues, your projected monthly expenses will rise to ${formatAmount(forecastValues[forecastValues.length - 1])} by the end of the projection. Consider reviewing your top categories to enforce strict budgets.`;
      } else if (growthTrend < -1000) {
        insight = `🎉 Great job! Your monthly spending is on a downward trend, decreasing by ${formatAmount(Math.abs(growthTrend))} per month. Keep this up to grow your net savings rate!`;
      } else {
        insight = `📊 Stable: Your monthly spending is relatively flat. Your projected next-month spend is ${formatAmount(nextMonthProjected)}, which is close to your past average of ${formatAmount(avgHistory)}.`;
      }
    } else if (forecastMetric === 'income') {
      if (growthTrend > 1000) {
        insight = `🚀 Positive Outlook: Your income is projected to trend upwards by ${formatAmount(growthTrend)} per month. This increases your capacity to allocate funds to your active Savings Goals.`;
      } else {
        insight = `📊 Income Forecast: Your monthly income is projected to stay steady around ${formatAmount(nextMonthProjected)}. Ensure your fixed expenses remain well below this average.`;
      }
    } else {
      const formattedDiff = forecastMetric === 'fuel_cost' ? formatAmount(Math.abs(growthTrend)) : `${Math.abs(growthTrend).toFixed(2)} L`;

      if (growthTrend > 0.5) {
        insight = `⛽ Fuel Projections: Your fuel consumption is trending upwards by ${formattedDiff} per month. Consider batching trips or routing adjustments to reduce consumption.`;
      } else {
        insight = `📊 Fuel Projections: Your monthly fuel consumption is projected to hover around ${forecastMetric === 'fuel_cost' ? formatAmount(nextMonthProjected) : `${nextMonthProjected.toFixed(1)} Liters`}.`;
      }
    }

    return {
      hasEnoughHistory: true,
      combinedLabels,
      historicalDataset,
      forecastDataset,
      stats: {
        avgHistory,
        nextMonthProjected,
        totalProjectedHorizon,
        growthRate: linearResult.growthRate,
        r2: linearResult.r2
      },
      insight
    };
  }, [transactions, fuelLogs, forecastMetric, forecastHorizon, forecastModel, formatAmount, currency]);

  // --- Fuel Data ---
  // Dynamically extract unique fuel types logged by the user
  const uniqueFuelTypes = useMemo(() => {
    const types = new Set<string>();
    fuelLogs.forEach(log => {
      if (log.fuel_type) types.add(log.fuel_type);
    });
    return ['all', ...Array.from(types).sort()];
  }, [fuelLogs]);

  // Precise Liter-per-day Next Refill Prediction
  const nextRefillEstimate = useMemo(() => {
    if (fuelLogs.length === 0) {
      return { text: 'N/A', subtext: 'No fuel logs logged yet', fuelType: '', statusClass: 'text-muted-foreground' };
    }

    // Determine the fuel type to predict. If 'all', use the most recently refueled type.
    let targetFuelType = selectedFuelType;
    if (targetFuelType === 'all') {
      const sortedAll = [...fuelLogs].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
      targetFuelType = sortedAll[sortedAll.length - 1].fuel_type;
    }

    const typeLogs = fuelLogs.filter(log => log.fuel_type === targetFuelType);
    const sortedTypeLogs = [...typeLogs].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

    // Combine logs on the same date (to handle multiple partial fills on same day)
    const grouped: { date: string; liters: number; total_cost: number }[] = [];
    for (const log of sortedTypeLogs) {
      const existing = grouped.find(g => g.date === log.date);
      if (existing) {
        existing.liters += log.liters;
        existing.total_cost += log.total_cost;
      } else {
        grouped.push({ date: log.date, liters: log.liters, total_cost: log.total_cost });
      }
    }

    if (grouped.length < 2) {
      return {
        text: 'N/A',
        subtext: `Need at least 2 refills of ${targetFuelType} on different dates to estimate`,
        fuelType: targetFuelType,
        statusClass: 'text-muted-foreground'
      };
    }

    // Calculate rates (Liters per day) and intervals (days)
    const rates: number[] = [];
    const intervals: number[] = [];

    for (let i = 1; i < grouped.length; i++) {
      const prev = grouped[i - 1];
      const curr = grouped[i];
      const diffDays = (new Date(curr.date).getTime() - new Date(prev.date).getTime()) / (1000 * 3600 * 24);

      if (diffDays > 0) {
        intervals.push(diffDays);
        rates.push(prev.liters / diffDays); // consumption rate of previous purchase
      }
    }

    if (rates.length === 0) {
      return {
        text: 'N/A',
        subtext: `Need refills on different dates for ${targetFuelType} to estimate`,
        fuelType: targetFuelType,
        statusClass: 'text-muted-foreground'
      };
    }

    // Calculate weighted average of rates & intervals (giving more weight to recent refills)
    const recentRates = rates.slice(-5);
    const recentIntervals = intervals.slice(-5);
    let weightedRateSum = 0;
    let weightedIntervalSum = 0;
    let sumOfWeights = 0;

    for (let i = 0; i < recentRates.length; i++) {
      const weight = i + 1;
      weightedRateSum += recentRates[i] * weight;
      weightedIntervalSum += recentIntervals[i] * weight;
      sumOfWeights += weight;
    }

    const avgRate = weightedRateSum / sumOfWeights; // L/day
    const avgDays = weightedIntervalSum / sumOfWeights; // days fallback

    const lastRefill = grouped[grouped.length - 1];
    const lastLiters = lastRefill.liters;

    // Predicted days is last refill liters divided by consumption rate (how long the last liters will last)
    let predictedDays = avgRate > 0 ? (lastLiters / avgRate) : avgDays;

    // Cap predicted days to reasonable boundaries (1 to 90 days)
    if (predictedDays < 1) predictedDays = 1;
    if (predictedDays > 90) predictedDays = (avgDays > 0 && avgDays <= 90) ? avgDays : 30;

    const nextDate = new Date(new Date(lastRefill.date).getTime() + predictedDays * 24 * 3600 * 1000);

    // Calculate days from now
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const nextDateMidnight = new Date(nextDate);
    nextDateMidnight.setHours(0, 0, 0, 0);

    const diffTime = nextDateMidnight.getTime() - today.getTime();
    const daysFromNow = Math.ceil(diffTime / (1000 * 3600 * 24));

    let text = '';
    let statusClass = 'text-primary';

    if (daysFromNow < 0) {
      const absDays = Math.abs(daysFromNow);
      text = `Overdue by ${absDays} day${absDays > 1 ? 's' : ''}`;
      statusClass = 'text-rose-500 font-bold';
    } else if (daysFromNow === 0) {
      text = 'Due today';
      statusClass = 'text-amber-500 font-bold';
    } else if (daysFromNow === 1) {
      text = `Due tomorrow (${nextDate.toLocaleDateString()})`;
      statusClass = 'text-primary font-bold';
    } else {
      text = `In ${daysFromNow} days (${nextDate.toLocaleDateString()})`;
      statusClass = 'text-primary font-bold';
    }

    return {
      text,
      subtext: `Based on your recent rate of ${avgRate.toFixed(2)} L/day (last refill: ${lastLiters.toFixed(1)} L)`,
      fuelType: targetFuelType,
      statusClass
    };
  }, [fuelLogs, selectedFuelType]);

  const fuelMetrics = useMemo(() => {
    // Filter by fuel type if selected
    const filteredLogs = selectedFuelType === 'all'
      ? fuelLogs
      : fuelLogs.filter(log => log.fuel_type === selectedFuelType);

    let totalCost = 0;
    let totalLiters = 0;
    const monthlyData: Record<string, { cost: number; liters: number; count: number }> = {};
    const weeklyData: Record<string, { cost: number; liters: number }> = {};

    // Sort chronologically
    const sortedLogs = [...filteredLogs].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

    for (const f of sortedLogs) {
      totalCost += f.total_cost;
      totalLiters += f.liters;

      const date = new Date(f.date);
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

    const weeks = Object.keys(weeklyData).sort().slice(-8); // last 8 weeks
    const weeklyLitersData = weeks.map(w => weeklyData[w].liters);

    // --- Interactive Chart Data and Stats Preparation ---
    const perRefillLabels = sortedLogs.map(log => {
      const d = new Date(log.date);
      return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
    });
    const perRefillCosts = sortedLogs.map(log => log.total_cost);
    const perRefillLiters = sortedLogs.map(log => log.liters);
    const perRefillPrices = sortedLogs.map(log => log.price_per_liter);

    const monthlyLabelsFormatted = months.map(m => {
      const [year, month] = m.split('-');
      const dateObj = new Date(parseInt(year), parseInt(month) - 1, 1);
      return dateObj.toLocaleDateString(undefined, { year: '2-digit', month: 'short' });
    });

    let chartLabels = chartGrouping === 'monthly' ? monthlyLabelsFormatted : perRefillLabels;
    let chartValues: number[] = [];
    let chartLabel = '';
    let chartColor = '#3b82f6';
    let chartType: 'line' | 'bar' = 'bar';

    if (chartMetric === 'cost') {
      chartValues = chartGrouping === 'monthly' ? costData : perRefillCosts;
      chartLabel = 'Fuel Cost';
      chartColor = '#3b82f6';
      chartType = 'bar';
    } else if (chartMetric === 'liters') {
      chartValues = chartGrouping === 'monthly' ? litersData : perRefillLiters;
      chartLabel = 'Liters Consumed';
      chartColor = '#10b981';
      chartType = 'bar';
    } else if (chartMetric === 'price') {
      chartValues = chartGrouping === 'monthly' ? avgPriceData : perRefillPrices;
      chartLabel = 'Avg Price/L';
      chartColor = '#f59e0b';
      chartType = 'line';
    }

    // Statistics Calculations
    let stats = {
      avg: 0,
      max: 0,
      min: 0,
      latest: 0,
      changeText: '',
      changeTrend: 'neutral' as 'up' | 'down' | 'neutral'
    };

    if (sortedLogs.length > 0) {
      if (chartMetric === 'cost') {
        const total = sortedLogs.reduce((sum, l) => sum + l.total_cost, 0);
        stats.avg = total / (chartGrouping === 'monthly' ? Math.max(1, months.length) : sortedLogs.length);
        stats.max = Math.max(...(chartGrouping === 'monthly' ? costData : perRefillCosts));
        stats.min = Math.min(...(chartGrouping === 'monthly' ? costData : perRefillCosts));
        stats.latest = perRefillCosts[perRefillCosts.length - 1];

        if (chartGrouping === 'monthly' && costData.length >= 2) {
          const last = costData[costData.length - 1];
          const prev = costData[costData.length - 2];
          if (prev > 0) {
            const pct = ((last - prev) / prev) * 100;
            stats.changeText = `${pct > 0 ? '+' : ''}${pct.toFixed(1)}% vs last month`;
            stats.changeTrend = pct > 0 ? 'up' : 'down';
          }
        }
      } else if (chartMetric === 'liters') {
        const total = sortedLogs.reduce((sum, l) => sum + l.liters, 0);
        stats.avg = total / (chartGrouping === 'monthly' ? Math.max(1, months.length) : sortedLogs.length);
        stats.max = Math.max(...(chartGrouping === 'monthly' ? litersData : perRefillLiters));
        stats.min = Math.min(...(chartGrouping === 'monthly' ? litersData : perRefillLiters));
        stats.latest = perRefillLiters[perRefillLiters.length - 1];

        if (chartGrouping === 'monthly' && litersData.length >= 2) {
          const last = litersData[litersData.length - 1];
          const prev = litersData[litersData.length - 2];
          if (prev > 0) {
            const pct = ((last - prev) / prev) * 100;
            stats.changeText = `${pct > 0 ? '+' : ''}${pct.toFixed(1)}% vs last month`;
            stats.changeTrend = pct > 0 ? 'up' : 'down';
          }
        }
      } else if (chartMetric === 'price') {
        stats.avg = sortedLogs.reduce((sum, l) => sum + l.price_per_liter, 0) / sortedLogs.length;
        stats.max = Math.max(...perRefillPrices);
        stats.min = Math.min(...perRefillPrices);
        stats.latest = perRefillPrices[perRefillPrices.length - 1];

        if (perRefillPrices.length >= 2) {
          const last = perRefillPrices[perRefillPrices.length - 1];
          const prev = perRefillPrices[perRefillPrices.length - 2];
          const diff = last - prev;
          const pct = prev > 0 ? (diff / prev) * 100 : 0;
          stats.changeText = diff === 0 ? 'No change' : `${diff > 0 ? '+' : ''}${diff.toFixed(2)} (${pct > 0 ? '+' : ''}${pct.toFixed(1)}%) vs last refill`;
          stats.changeTrend = diff > 0 ? 'up' : diff < 0 ? 'down' : 'neutral';
        }
      }
    }

    return {
      totalCost,
      totalLiters,
      months,
      costData,
      litersData,
      avgPriceData,
      weeks,
      weeklyLitersData,
      // chart values
      chartLabels,
      chartValues,
      chartLabel,
      chartColor,
      chartType,
      stats,
      hasData: sortedLogs.length > 0
    };
  }, [fuelLogs, selectedFuelType, chartMetric, chartGrouping]);

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
      <div className="flex bg-muted p-1 rounded-2xl w-full max-w-lg overflow-hidden">
        <button
          onClick={() => setActiveTab('overview')}
          className={`flex-1 py-2 text-sm font-semibold rounded-xl flex items-center justify-center gap-2 transition-all duration-300 ${activeTab === 'overview' ? 'bg-primary text-primary-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
        >
          <BarChart3 size={16} /> Overview
        </button>
        <button
          onClick={() => setActiveTab('forecasting')}
          className={`flex-1 py-2 text-sm font-semibold rounded-xl flex items-center justify-center gap-2 transition-all duration-300 ${activeTab === 'forecasting' ? 'bg-primary text-primary-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
        >
          <TrendingUp size={16} /> Forecasting
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
            {/* Overview Period Filters */}
            <div className="flex flex-wrap items-center gap-2 mb-4 bg-muted/40 p-2 rounded-2xl border border-border max-w-max animate-in fade-in duration-300">
              <span className="text-xs text-muted-foreground px-2 font-medium">Period:</span>
              <button
                onClick={() => setOverviewPeriod('all')}
                className={`px-3 py-1 text-xs font-semibold rounded-xl transition-all duration-300 ${overviewPeriod === 'all' ? 'bg-primary text-primary-foreground shadow-sm shadow-primary/10' : 'text-muted-foreground hover:text-foreground'}`}
              >
                All Time
              </button>
              <button
                onClick={() => setOverviewPeriod('thisyear')}
                className={`px-3 py-1 text-xs font-semibold rounded-xl transition-all duration-300 ${overviewPeriod === 'thisyear' ? 'bg-primary text-primary-foreground shadow-sm shadow-primary/10' : 'text-muted-foreground hover:text-foreground'}`}
              >
                This Year
              </button>
              <button
                onClick={() => setOverviewPeriod('6months')}
                className={`px-3 py-1 text-xs font-semibold rounded-xl transition-all duration-300 ${overviewPeriod === '6months' ? 'bg-primary text-primary-foreground shadow-sm shadow-primary/10' : 'text-muted-foreground hover:text-foreground'}`}
              >
                6 Months
              </button>
              <button
                onClick={() => setOverviewPeriod('30days')}
                className={`px-3 py-1 text-xs font-semibold rounded-xl transition-all duration-300 ${overviewPeriod === '30days' ? 'bg-primary text-primary-foreground shadow-sm shadow-primary/10' : 'text-muted-foreground hover:text-foreground'}`}
              >
                30 Days
              </button>
            </div>

            {/* Financial Performance Cards Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {/* Total Income */}
              <div className="bg-card p-6 rounded-2xl border border-border shadow-sm">
                <div className="flex items-center justify-between mb-2 text-emerald-500">
                  <span className="text-xs font-semibold uppercase tracking-wider">Total Income</span>
                  <TrendingUp size={16} />
                </div>
                <p className="text-2xl font-bold">{formatAmount(overviewMetrics.totalIncome)}</p>
                <p className="text-xs text-muted-foreground mt-1">Earnings in selected period</p>
              </div>

              {/* Total Expenses */}
              <div className="bg-card p-6 rounded-2xl border border-border shadow-sm">
                <div className="flex items-center justify-between mb-2 text-destructive">
                  <span className="text-xs font-semibold uppercase tracking-wider">Total Expenses</span>
                  <TrendingDown size={16} />
                </div>
                <p className="text-2xl font-bold">{formatAmount(overviewMetrics.totalExpense)}</p>
                <p className="text-xs text-muted-foreground mt-1">
                  Avg. Monthly Spend: <span className="font-semibold text-foreground">{formatAmount(overviewMetrics.avgMonthlyBurn)}</span>
                </p>
              </div>

              {/* Net Savings */}
              <div className="bg-card p-6 rounded-2xl border border-border shadow-sm">
                <div className="flex items-center justify-between mb-2 text-primary">
                  <span className="text-xs font-semibold uppercase tracking-wider">Net Savings</span>
                  <Wallet size={16} />
                </div>
                <p className={`text-2xl font-bold ${overviewMetrics.netSavings >= 0 ? 'text-emerald-500' : 'text-rose-500'}`}>
                  {overviewMetrics.netSavings >= 0 ? '+' : ''}{formatAmount(overviewMetrics.netSavings)}
                </p>
                <p className="text-xs text-muted-foreground mt-1">Income minus Expenses</p>
              </div>

              {/* Savings Rate */}
              <div className="bg-card p-6 rounded-2xl border border-border shadow-sm">
                <div className="flex items-center justify-between mb-2 text-purple-500">
                  <span className="text-xs font-semibold uppercase tracking-wider">Savings Rate</span>
                  <BarChart3 size={16} />
                </div>
                <p className="text-2xl font-bold text-purple-500">
                  {overviewMetrics.savingsRate.toFixed(1)}%
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  {overviewMetrics.savingsRate >= 20 ? ' On track (> 20%)' : '⚠️ Target: > 20%'}
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Income vs Expense Over Time */}
              <div className="bg-card p-6 rounded-2xl border border-border">
                <div className="flex items-center justify-between mb-6">
                  <h3 className="text-lg font-semibold flex items-center gap-2">
                    <BarChart3 size={18} className="text-primary" /> Cash Flow Over Time
                  </h3>
                  {/* Style Toggle */}
                  <div className="flex bg-muted p-1 rounded-xl text-xs overflow-hidden">
                    <button
                      onClick={() => setCashFlowChartStyle('bar')}
                      className={`px-3 py-1.5 font-semibold rounded-lg transition-all ${cashFlowChartStyle === 'bar' ? 'bg-primary text-primary-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
                    >
                      Compare
                    </button>
                    <button
                      onClick={() => setCashFlowChartStyle('line')}
                      className={`px-3 py-1.5 font-semibold rounded-lg transition-all ${cashFlowChartStyle === 'line' ? 'bg-primary text-primary-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
                    >
                      Net Trend
                    </button>
                  </div>
                </div>

                <div className="h-64">
                  {overviewMetrics.months.length > 0 ? (
                    cashFlowChartStyle === 'bar' ? (
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
                    ) : (
                      <Line
                        data={{
                          labels: overviewMetrics.months,
                          datasets: [
                            {
                              label: 'Net Cash Flow',
                              data: overviewMetrics.months.map((_, idx) => overviewMetrics.monthlyIncome[idx] - overviewMetrics.monthlyExpense[idx]),
                              borderColor: '#8b5cf6',
                              backgroundColor: 'rgba(139, 92, 246, 0.1)',
                              fill: true,
                              tension: 0.3,
                              pointBackgroundColor: '#8b5cf6'
                            }
                          ]
                        }}
                        options={{
                          maintainAspectRatio: false,
                          scales: {
                            x: { grid: { display: false } },
                            y: { grid: { color: 'rgba(0,0,0,0.05)' } }
                          },
                          plugins: { legend: { display: false } }
                        }}
                      />
                    )
                  ) : <div className="h-full flex items-center justify-center text-muted-foreground">No data available</div>}
                </div>
              </div>

              {/* Expense Breakdown Doughnut */}
              <div className="bg-card p-6 rounded-2xl border border-border">
                <h3 className="text-lg font-semibold mb-6 flex items-center gap-2">
                  <PieChartIcon size={18} className="text-primary" /> Expense Breakdown
                </h3>
                <div className="relative h-64 flex items-center justify-center">
                  {overviewMetrics.topCategories.length > 0 ? (
                    <>
                      <Doughnut
                        data={{
                          labels: overviewMetrics.topCategories,
                          datasets: [{ data: overviewMetrics.categoryData, backgroundColor: ['#3b82f6', '#ef4444', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899', '#6b7280'], borderWidth: 0, hoverOffset: 8 }]
                        }}
                        options={{ maintainAspectRatio: false, cutout: '70%', plugins: { legend: { display: false } } }}
                      />
                      <div className="absolute flex flex-col items-center justify-center pointer-events-none text-center">
                        <span className="text-xs text-muted-foreground uppercase tracking-wider font-semibold">Total Spent</span>
                        <span className="text-lg font-bold mt-0.5 text-foreground">{formatAmount(overviewMetrics.totalExpense)}</span>
                        {overviewMetrics.totalIncome > 0 && (
                          <span className="text-[10px] text-muted-foreground mt-0.5">
                            {((overviewMetrics.totalExpense / overviewMetrics.totalIncome) * 100).toFixed(0)}% of income
                          </span>
                        )}
                      </div>
                    </>
                  ) : <div className="h-full flex items-center justify-center text-muted-foreground">No data available</div>}
                </div>

                {/* Custom Category Legend List below chart */}
                {overviewMetrics.topCategories.length > 0 && (
                  <div className="mt-4 grid grid-cols-2 gap-2 text-xs border-t border-border pt-4">
                    {overviewMetrics.topCategories.map((cat, idx) => {
                      const color = ['#3b82f6', '#ef4444', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899', '#6b7280'][idx] || '#6b7280';
                      const value = overviewMetrics.categoryData[idx];
                      const percent = overviewMetrics.totalExpense > 0 ? ((value / overviewMetrics.totalExpense) * 100).toFixed(1) : '0';
                      return (
                        <div key={cat} className="flex items-center gap-2">
                          <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: color }}></span>
                          <span className="truncate text-muted-foreground font-medium flex-1">{cat}</span>
                          <span className="font-semibold text-foreground">{percent}%</span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* --- FORECASTING TAB --- */}
        {activeTab === 'forecasting' && (
          <div className="space-y-6 animate-in fade-in duration-300">
            {/* Controls */}
            <div className="bg-card border border-border p-5 rounded-3xl grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label className="block text-xs font-semibold text-muted-foreground mb-1.5 uppercase tracking-wider">Forecast Metric</label>
                <select
                  value={forecastMetric}
                  onChange={(e) => setForecastMetric(e.target.value as any)}
                  className="w-full bg-muted border-none rounded-xl p-3 text-xs outline-none cursor-pointer font-bold"
                >
                  <option value="expense">📉 Monthly Expenses</option>
                  <option value="income">📈 Monthly Income</option>
                  <option value="fuel_cost">⛽ Fuel Cost</option>
                  <option value="fuel_liters">🚗 Fuel Volume (Liters)</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-muted-foreground mb-1.5 uppercase tracking-wider">Forecast Horizon</label>
                <select
                  value={forecastHorizon}
                  onChange={(e) => setForecastHorizon(Number(e.target.value) as any)}
                  className="w-full bg-muted border-none rounded-xl p-3 text-xs outline-none cursor-pointer font-bold"
                >
                  <option value={3}>3 Months Ahead</option>
                  <option value={6}>6 Months Ahead</option>
                  <option value={12}>12 Months Ahead</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-muted-foreground mb-1.5 uppercase tracking-wider">Prediction Model</label>
                <select
                  value={forecastModel}
                  onChange={(e) => setForecastModel(e.target.value as any)}
                  className="w-full bg-muted border-none rounded-xl p-3 text-xs outline-none cursor-pointer font-bold"
                >
                  <option value="linear">Linear Regression (Trend Projections)</option>
                  <option value="wma">Weighted Moving Average (Recent Behavior)</option>
                </select>
              </div>
            </div>

            {!forecastingMetrics.hasEnoughHistory ? (
              <div className="py-16 text-center border border-dashed border-border rounded-3xl bg-card">
                <div className="bg-muted p-4 rounded-2xl mb-4 inline-block">
                  <TrendingUp size={32} className="text-muted-foreground" />
                </div>
                <p className="text-muted-foreground text-sm font-semibold max-w-sm mx-auto">
                  Forecasting requires at least 2 months of historical data with transactions to compute trends. Please add more records first!
                </p>
              </div>
            ) : (
              <>
                {/* Stats */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                  {/* Historical Average */}
                  <div className="bg-card p-6 rounded-2xl border border-border shadow-sm">
                    <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider block mb-1">Past Avg. Monthly</span>
                    <p className="text-2xl font-bold">
                      {forecastMetric.includes('liters')
                        ? `${forecastingMetrics.stats.avgHistory.toFixed(1)} L`
                        : formatAmount(forecastingMetrics.stats.avgHistory)
                      }
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">Based on historical months</p>
                  </div>

                  {/* Projected Next Month */}
                  <div className="bg-card p-6 rounded-2xl border border-border shadow-sm">
                    <span className="text-xs font-semibold text-primary uppercase tracking-wider block mb-1">Projected Next Month</span>
                    <p className="text-2xl font-bold text-primary">
                      {forecastMetric.includes('liters')
                        ? `${forecastingMetrics.stats.nextMonthProjected.toFixed(1)} L`
                        : formatAmount(forecastingMetrics.stats.nextMonthProjected)
                      }
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">Estimated for next month</p>
                  </div>

                  {/* Growth Rate Trend */}
                  <div className="bg-card p-6 rounded-2xl border border-border shadow-sm">
                    <span className="text-xs font-semibold text-purple-500 uppercase tracking-wider block mb-1">Growth Trend</span>
                    <p className={`text-2xl font-bold ${forecastingMetrics.stats.growthRate >= 0 ? 'text-rose-500' : 'text-emerald-500'}`}>
                      {forecastingMetrics.stats.growthRate >= 0 ? '+' : ''}
                      {forecastingMetrics.stats.growthRate.toFixed(1)}%
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">Monthly trend rate</p>
                  </div>

                  {/* Confidence */}
                  <div className="bg-card p-6 rounded-2xl border border-border shadow-sm">
                    <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider block mb-1">Model Confidence</span>
                    <div className="mt-1">
                      {forecastingMetrics.stats.r2 > 0.7 ? (
                        <span className="inline-block bg-emerald-500/10 text-emerald-500 border border-emerald-500/20 px-2.5 py-1 rounded-lg text-xs font-bold uppercase tracking-wider">
                          High (R² = {forecastingMetrics.stats.r2.toFixed(2)})
                        </span>
                      ) : forecastingMetrics.stats.r2 > 0.3 ? (
                        <span className="inline-block bg-amber-500/10 text-amber-500 border border-amber-500/20 px-2.5 py-1 rounded-lg text-xs font-bold uppercase tracking-wider">
                          Medium (R² = {forecastingMetrics.stats.r2.toFixed(2)})
                        </span>
                      ) : (
                        <span className="inline-block bg-rose-500/10 text-rose-500 border border-rose-500/20 px-2.5 py-1 rounded-lg text-xs font-bold uppercase tracking-wider">
                          Low (High Volatility)
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground mt-2">Based on historical variance</p>
                  </div>
                </div>

                {/* Insight Banner */}
                <div className="bg-primary/5 border border-primary/10 p-5 rounded-3xl">
                  <p className="text-sm font-medium text-foreground leading-relaxed">
                    {forecastingMetrics.insight}
                  </p>
                </div>

                {/* Forecasting Chart */}
                <div className="bg-card p-6 rounded-3xl border border-border">
                  <h3 className="text-lg font-semibold mb-6 flex items-center gap-2">
                    <TrendingUp size={18} className="text-primary" /> Predictive Trendline Projections
                  </h3>
                  <div className="h-80 relative">
                    <Line
                      data={{
                        labels: forecastingMetrics.combinedLabels,
                        datasets: [
                          {
                            label: 'Historical Data',
                            data: forecastingMetrics.historicalDataset,
                            borderColor: forecastMetric === 'income' ? '#10b981' : forecastMetric === 'expense' ? '#ef4444' : '#8b5cf6',
                            backgroundColor: 'transparent',
                            borderWidth: 3,
                            pointBackgroundColor: forecastMetric === 'income' ? '#10b981' : forecastMetric === 'expense' ? '#ef4444' : '#8b5cf6',
                            tension: 0.2
                          },
                          {
                            label: 'Forecast Projection',
                            data: forecastingMetrics.forecastDataset,
                            borderColor: '#3b82f6',
                            backgroundColor: 'transparent',
                            borderWidth: 2,
                            borderDash: [6, 6],
                            pointBackgroundColor: '#3b82f6',
                            tension: 0.2,
                            spanGaps: true
                          }
                        ]
                      }}
                      options={{
                        maintainAspectRatio: false,
                        interaction: { mode: 'index', intersect: false },
                        scales: {
                          x: { grid: { display: false } },
                          y: {
                            grid: { color: 'rgba(0,0,0,0.05)' },
                            ticks: {
                              callback: (val) => forecastMetric.includes('liters') ? `${val} L` : formatAmount(Number(val))
                            }
                          }
                        },
                        plugins: {
                          tooltip: {
                            callbacks: {
                              label: (context) => {
                                const val = context.raw as number;
                                const isForecast = context.datasetIndex === 1;
                                const formatted = forecastMetric.includes('liters') ? `${val.toFixed(1)} L` : formatAmount(val);
                                return `${isForecast ? '🔮 Forecast' : '📊 Actual'}: ${formatted}`;
                              }
                            }
                          }
                        }
                      }}
                    />
                  </div>
                </div>
              </>
            )}
          </div>
        )}

        {/* --- LOANS TAB --- */}
        {activeTab === 'loans' && (
          <div className="space-y-6 animate-in fade-in duration-300">
            {/* Loan Dashboard Metrics Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {/* Given Out */}
              <div className="bg-card p-6 rounded-2xl border border-emerald-500/20 relative overflow-hidden group shadow-sm">
                <div className="absolute top-0 right-0 p-4 opacity-10">
                  <Handshake size={48} />
                </div>
                <span className="text-xs font-semibold text-emerald-500 uppercase tracking-wider block mb-2">Total Given Out</span>
                <p className="text-2xl font-bold">{formatAmount(loansMetrics.totalGiven)}</p>
                <div className="mt-4 pt-4 border-t border-border flex justify-between text-xs text-muted-foreground">
                  <span>Repaid: <span className="text-foreground font-semibold">{formatAmount(loansMetrics.givenRepaid)}</span></span>
                  {loansMetrics.givenLoss > 0 && <span className="text-destructive font-semibold">Loss: {formatAmount(loansMetrics.givenLoss)}</span>}
                </div>
              </div>

              {/* Taken (Borrowed) */}
              <div className="bg-card p-6 rounded-2xl border border-rose-500/20 relative overflow-hidden group shadow-sm">
                <div className="absolute top-0 right-0 p-4 opacity-10 text-rose-500">
                  <Wallet size={48} />
                </div>
                <span className="text-xs font-semibold text-rose-500 uppercase tracking-wider block mb-2">Total Taken (Borrowed)</span>
                <p className="text-2xl font-bold">{formatAmount(loansMetrics.totalTaken)}</p>
                <div className="mt-4 pt-4 border-t border-border flex justify-between text-xs text-muted-foreground">
                  <span>Repaid: <span className="text-foreground font-semibold">{formatAmount(loansMetrics.takenRepaid)}</span></span>
                </div>
              </div>

              {/* Net Owed Position */}
              <div className="bg-card p-6 rounded-2xl border border-border relative overflow-hidden shadow-sm">
                <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider block mb-2">Net Owed Position</span>
                <p className={`text-2xl font-bold ${loansMetrics.netOwedPosition >= 0 ? 'text-emerald-500' : 'text-rose-500'}`}>
                  {loansMetrics.netOwedPosition >= 0 ? '+' : ''}{formatAmount(loansMetrics.netOwedPosition)}
                </p>
                <div className="mt-4 pt-4 border-t border-border flex justify-between text-xs text-muted-foreground">
                  <span>Owed to You: <span className="text-emerald-500 font-semibold">{formatAmount(loansMetrics.outstandingGiven)}</span></span>
                  <span>You Owe: <span className="text-rose-500 font-semibold">{formatAmount(loansMetrics.outstandingTaken)}</span></span>
                </div>
              </div>

              {/* Performance Ratios */}
              <div className="bg-card p-6 rounded-2xl border border-border relative overflow-hidden shadow-sm">
                <span className="text-xs font-semibold text-purple-500 uppercase tracking-wider block mb-2">Repayment Status</span>
                <div className="space-y-1 mt-1">
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Recovery Rate:</span>
                    <span className="font-bold text-emerald-500">{loansMetrics.recoveryRate.toFixed(1)}%</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Repaid Debt:</span>
                    <span className="font-bold text-rose-500">{loansMetrics.repaymentRate.toFixed(1)}%</span>
                  </div>
                </div>
                <div className="mt-3 pt-3 border-t border-border text-[10px] text-muted-foreground text-center">
                  Overview of repayment performance
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Net Party Balances Chart */}
              <div className="bg-card p-6 rounded-2xl border border-border">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
                  <div>
                    <h3 className="text-lg font-semibold">Net Party Balances</h3>
                    <p className="text-xs text-muted-foreground mt-0.5">Green = They owe you. Red = You owe them.</p>
                  </div>

                  {/* Dynamic Filters */}
                  <div className="flex bg-muted p-1 rounded-xl text-xs overflow-hidden self-start">
                    <button
                      onClick={() => setLoansChartFilter('all')}
                      className={`px-3 py-1.5 font-semibold rounded-lg transition-all ${loansChartFilter === 'all' ? 'bg-primary text-primary-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
                    >
                      All
                    </button>
                    <button
                      onClick={() => setLoansChartFilter('given')}
                      className={`px-3 py-1.5 font-semibold rounded-lg transition-all ${loansChartFilter === 'given' ? 'bg-primary text-primary-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
                    >
                      Owed To You
                    </button>
                    <button
                      onClick={() => setLoansChartFilter('taken')}
                      className={`px-3 py-1.5 font-semibold rounded-lg transition-all ${loansChartFilter === 'taken' ? 'bg-primary text-primary-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
                    >
                      You Owe
                    </button>
                  </div>
                </div>

                <div className="h-64">
                  {loansMetrics.parties.length > 0 ? (
                    <Bar
                      data={{
                        labels: loansMetrics.parties,
                        datasets: [{ label: 'Net Balance', data: loansMetrics.partyData, backgroundColor: loansMetrics.partyColors, borderRadius: 4 }]
                      }}
                      options={{
                        maintainAspectRatio: false,
                        indexAxis: 'y',
                        scales: {
                          x: { grid: { color: 'rgba(0,0,0,0.05)' } },
                          y: { grid: { display: false } }
                        },
                        plugins: { legend: { display: false } }
                      }}
                    />
                  ) : <div className="h-full flex items-center justify-center text-muted-foreground">No pending loan balances found with active filter</div>}
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
            {/* Fuel Type Filters */}
            <div className="flex flex-wrap items-center gap-2 mb-4 bg-muted/40 p-2 rounded-2xl border border-border max-w-max">
              <span className="text-xs text-muted-foreground px-2 font-medium">Filter:</span>
              {uniqueFuelTypes.map(type => (
                <button
                  key={type}
                  onClick={() => setSelectedFuelType(type)}
                  className={`px-3 py-1 text-xs font-semibold rounded-xl transition-all duration-300 ${selectedFuelType === type
                    ? 'bg-primary text-primary-foreground shadow-sm shadow-primary/10'
                    : 'text-muted-foreground hover:text-foreground'
                    }`}
                >
                  {type === 'all' ? 'All Fuel Types' : type}
                </button>
              ))}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="bg-card p-6 rounded-2xl border border-blue-500/20">
                <div className="flex items-center justify-between mb-2 text-blue-500">
                  <span className="text-sm font-medium">Total Fuel Spent {selectedFuelType !== 'all' && `(${selectedFuelType})`}</span>
                  <Fuel size={16} />
                </div>
                <p className="text-2xl font-bold">{formatAmount(fuelMetrics.totalCost)}</p>
              </div>
              <div className="bg-card p-6 rounded-2xl border border-border">
                <div className="flex items-center justify-between mb-2 text-muted-foreground">
                  <span className="text-sm font-medium">Total Liters Consumed {selectedFuelType !== 'all' && `(${selectedFuelType})`}</span>
                  <TrendingUp size={16} />
                </div>
                <p className="text-2xl font-bold">{fuelMetrics.totalLiters.toFixed(2)} L</p>
              </div>
            </div>

            {/* Estimated Next Refill Card */}
            <div className="bg-card p-6 rounded-2xl border border-border flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <Fuel className="text-primary" size={20} />
                  <h3 className="text-lg font-semibold">Estimated Next Refill {nextRefillEstimate.fuelType && `(${nextRefillEstimate.fuelType})`}</h3>
                </div>
                <p className="text-xs text-muted-foreground">{nextRefillEstimate.subtext}</p>
              </div>
              <p className={`text-2xl font-bold ${nextRefillEstimate.statusClass}`}>{nextRefillEstimate.text}</p>
            </div>

            {/* Chart and Stats Section */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Main Fuel Chart Card */}
              <div className="bg-card p-6 rounded-2xl border border-border lg:col-span-2 flex flex-col justify-between">
                <div>
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
                    <h3 className="text-lg font-semibold flex items-center gap-2">
                      <TrendingUp size={18} className="text-primary" /> Fuel Cost & Price Trend
                    </h3>

                    {/* Controls */}
                    <div className="flex flex-wrap items-center gap-2">
                      {/* Metric Tabs */}
                      <div className="flex bg-muted p-1 rounded-xl text-xs overflow-hidden">
                        <button
                          onClick={() => setChartMetric('cost')}
                          className={`px-3 py-1.5 font-semibold rounded-lg transition-all ${chartMetric === 'cost' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'}`}
                        >
                          Spend
                        </button>
                        <button
                          onClick={() => setChartMetric('price')}
                          className={`px-3 py-1.5 font-semibold rounded-lg transition-all ${chartMetric === 'price' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'}`}
                        >
                          Price/L
                        </button>
                        <button
                          onClick={() => setChartMetric('liters')}
                          className={`px-3 py-1.5 font-semibold rounded-lg transition-all ${chartMetric === 'liters' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'}`}
                        >
                          Volume
                        </button>
                      </div>

                      {/* Grouping Toggle */}
                      <div className="flex bg-muted p-1 rounded-xl text-xs overflow-hidden">
                        <button
                          onClick={() => setChartGrouping('monthly')}
                          className={`px-3 py-1.5 font-semibold rounded-lg transition-all ${chartGrouping === 'monthly' ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
                        >
                          Monthly
                        </button>
                        <button
                          onClick={() => setChartGrouping('per_refill')}
                          className={`px-3 py-1.5 font-semibold rounded-lg transition-all ${chartGrouping === 'per_refill' ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
                        >
                          Per Refill
                        </button>
                      </div>
                    </div>
                  </div>

                  <div className="h-64 relative">
                    {fuelMetrics.hasData ? (
                      fuelMetrics.chartType === 'line' ? (
                        <Line
                          data={{
                            labels: fuelMetrics.chartLabels,
                            datasets: [
                              {
                                label: fuelMetrics.chartLabel,
                                data: fuelMetrics.chartValues,
                                borderColor: fuelMetrics.chartColor,
                                backgroundColor: `${fuelMetrics.chartColor}20`,
                                fill: true,
                                tension: 0.3,
                                pointBackgroundColor: fuelMetrics.chartColor
                              }
                            ]
                          }}
                          options={{
                            maintainAspectRatio: false,
                            interaction: { mode: 'index', intersect: false },
                            scales: {
                              x: { grid: { display: false } },
                              y: {
                                type: 'linear',
                                display: true,
                                grid: { color: 'rgba(0,0,0,0.05)' },
                                ticks: {
                                  callback: (val) => chartMetric === 'cost' ? formatAmount(Number(val)) : chartMetric === 'price' ? `${formatAmount(Number(val))}/L` : `${val} L`
                                }
                              }
                            },
                            plugins: {
                              legend: { display: false },
                              tooltip: {
                                callbacks: {
                                  label: (context) => {
                                    const val = context.raw as number;
                                    if (chartMetric === 'cost') return `Spent: ${formatAmount(val)}`;
                                    if (chartMetric === 'price') return `Price/L: ${formatAmount(val)}/L`;
                                    return `Volume: ${val.toFixed(2)} L`;
                                  }
                                }
                              }
                            }
                          }}
                        />
                      ) : (
                        <Bar
                          data={{
                            labels: fuelMetrics.chartLabels,
                            datasets: [
                              {
                                label: fuelMetrics.chartLabel,
                                data: fuelMetrics.chartValues,
                                backgroundColor: fuelMetrics.chartColor,
                                borderRadius: 6
                              }
                            ]
                          }}
                          options={{
                            maintainAspectRatio: false,
                            scales: {
                              x: { grid: { display: false } },
                              y: {
                                type: 'linear',
                                display: true,
                                grid: { color: 'rgba(0,0,0,0.05)' },
                                ticks: {
                                  callback: (val) => chartMetric === 'cost' ? formatAmount(Number(val)) : `${val} L`
                                }
                              }
                            },
                            plugins: {
                              legend: { display: false },
                              tooltip: {
                                callbacks: {
                                  label: (context) => {
                                    const val = context.raw as number;
                                    if (chartMetric === 'cost') return `Spent: ${formatAmount(val)}`;
                                    return `Volume: ${val.toFixed(2)} L`;
                                  }
                                }
                              }
                            }
                          }}
                        />
                      )
                    ) : <div className="h-full flex items-center justify-center text-muted-foreground">No data available for selected filters</div>}
                  </div>
                </div>
              </div>

              {/* Stats & Insights Card */}
              <div className="bg-card p-6 rounded-2xl border border-border flex flex-col justify-between">
                <div>
                  <h3 className="text-lg font-semibold mb-6 flex items-center gap-2">
                    <TrendingUp size={18} className="text-primary" /> Key Statistics
                  </h3>

                  {fuelMetrics.hasData ? (
                    <div className="space-y-6">
                      {/* Average metric */}
                      <div>
                        <span className="text-xs text-muted-foreground uppercase tracking-wider font-semibold">
                          Average {chartMetric === 'cost' ? (chartGrouping === 'monthly' ? 'Monthly Spend' : 'Refill Cost') : chartMetric === 'price' ? 'Price/Liter' : (chartGrouping === 'monthly' ? 'Monthly Volume' : 'Refill Volume')}
                        </span>
                        <p className="text-2xl font-bold mt-1 text-foreground">
                          {chartMetric === 'cost' ? formatAmount(fuelMetrics.stats.avg) : chartMetric === 'price' ? `${formatAmount(fuelMetrics.stats.avg)}/L` : `${fuelMetrics.stats.avg.toFixed(1)} L`}
                        </p>
                      </div>

                      {/* High / Low metric */}
                      <div className="grid grid-cols-2 gap-4 pt-4 border-t border-border">
                        <div>
                          <span className="text-xs text-muted-foreground font-medium block">
                            {chartMetric === 'price' ? 'Lowest Price' : 'Min Transaction'}
                          </span>
                          <span className="font-semibold text-sm">
                            {chartMetric === 'cost' ? formatAmount(fuelMetrics.stats.min) : chartMetric === 'price' ? `${formatAmount(fuelMetrics.stats.min)}/L` : `${fuelMetrics.stats.min.toFixed(1)} L`}
                          </span>
                        </div>
                        <div>
                          <span className="text-xs text-muted-foreground font-medium block">
                            {chartMetric === 'price' ? 'Highest Price' : 'Max Transaction'}
                          </span>
                          <span className="font-semibold text-sm">
                            {chartMetric === 'cost' ? formatAmount(fuelMetrics.stats.max) : chartMetric === 'price' ? `${formatAmount(fuelMetrics.stats.max)}/L` : `${fuelMetrics.stats.max.toFixed(1)} L`}
                          </span>
                        </div>
                      </div>

                      {/* Trend / Latest and MoM change */}
                      {fuelMetrics.stats.changeText && (
                        <div className="pt-4 border-t border-border flex items-center justify-between">
                          <div>
                            <span className="text-xs text-muted-foreground font-medium block">Trend Change</span>
                            <span className="text-sm font-semibold text-foreground">{fuelMetrics.stats.changeText}</span>
                          </div>
                          <div className={`p-2 rounded-xl ${fuelMetrics.stats.changeTrend === 'up'
                            ? (chartMetric === 'price' ? 'bg-rose-500/10 text-rose-500' : 'bg-blue-500/10 text-blue-500')
                            : fuelMetrics.stats.changeTrend === 'down'
                              ? 'bg-emerald-500/10 text-emerald-500'
                              : 'bg-muted text-muted-foreground'
                            }`}>
                            {fuelMetrics.stats.changeTrend === 'up' ? <TrendingUp size={18} /> : fuelMetrics.stats.changeTrend === 'down' ? <TrendingDown size={18} /> : <Fuel size={18} />}
                          </div>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="text-muted-foreground text-sm text-center py-10">Select fuel types to see insights.</div>
                  )}
                </div>

                {/* Fuel Economy Tip */}
                {fuelMetrics.hasData && (
                  <div className="mt-6 p-4 rounded-xl bg-primary/5 border border-primary/10 text-xs text-primary/80">
                    <strong>Tip:</strong> Keep tires inflated and avoid quick accelerations to reduce fuel consumption rate.
                  </div>
                )}
              </div>
            </div>

            {/* Weekly Consumption Card */}
            <div className="bg-card p-6 rounded-2xl border border-border">
              <h3 className="text-lg font-semibold mb-6 flex items-center gap-2">
                <BarChart3 size={18} className="text-primary" /> Weekly Consumption (Liters) {selectedFuelType !== 'all' && `(${selectedFuelType})`}
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
        )}

      </div>
    </div>
  );
};

export default Reports;
