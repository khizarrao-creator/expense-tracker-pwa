import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  ArrowLeft, 
  Plus, 
  Trash2, 
  Calendar, 
  CreditCard, 
  Tag, 
  AlertTriangle, 
  Search, 
  Filter, 
  Play, 
  Pause, 
  TrendingUp,
  Sparkles,
  PieChart
} from 'lucide-react';
import { getConfig, setConfig } from '../db/queries';
import { useCurrency } from '../contexts/CurrencyContext';
import { v4 as uuidv4 } from 'uuid';

interface Subscription {
  id: string;
  name: string;
  cost: number;
  billingCycle: 'monthly' | 'yearly';
  startDate: string;
  category: 'Entertainment' | 'Utilities' | 'Health' | 'Work' | 'Other';
  paymentMethod: string;
  active: boolean;
}

const CATEGORIES = ['Entertainment', 'Utilities', 'Health', 'Work', 'Other'] as const;
const PAYMENT_METHODS = ['Credit Card', 'Debit Card', 'Bank Transfer', 'PayPal', 'Cash', 'Other'];

// Helper to calculate next renewal date and days remaining
const getNextRenewalInfo = (startDateStr: string, cycle: 'monthly' | 'yearly') => {
  const start = new Date(startDateStr);
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  let renewal = new Date(start);
  renewal.setHours(0, 0, 0, 0);

  // If start date is in the future, that is the first renewal
  if (renewal >= today) {
    const diffTime = renewal.getTime() - today.getTime();
    const daysRemaining = Math.ceil(diffTime / (1000 * 3600 * 24));
    return { nextDate: renewal, daysRemaining };
  }

  // Increment until renewal date is today or in the future
  if (cycle === 'monthly') {
    while (renewal < today) {
      renewal.setMonth(renewal.getMonth() + 1);
    }
  } else {
    while (renewal < today) {
      renewal.setFullYear(renewal.getFullYear() + 1);
    }
  }

  const diffTime = renewal.getTime() - today.getTime();
  const daysRemaining = Math.ceil(diffTime / (1000 * 3600 * 24));

  return {
    nextDate: renewal,
    daysRemaining
  };
};

const Subscriptions: React.FC = () => {
  const navigate = useNavigate();
  const { formatAmount } = useCurrency();

  const [subscriptions, setSubscriptions] = useState<Subscription[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);

  // Filter states
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'paused'>('all');

  // Form states
  const [name, setName] = useState('');
  const [cost, setCost] = useState('');
  const [billingCycle, setBillingCycle] = useState<'monthly' | 'yearly'>('monthly');
  const [startDate, setStartDate] = useState(new Date().toISOString().split('T')[0]);
  const [category, setCategory] = useState<Subscription['category']>('Entertainment');
  const [paymentMethod, setPaymentMethod] = useState('Credit Card');

  // Load subscriptions from SQLite config table
  useEffect(() => {
    const fetchSubscriptions = async () => {
      setLoading(true);
      try {
        const data = await getConfig('subscriptions');
        if (data) {
          setSubscriptions(JSON.parse(data));
        } else {
          setSubscriptions([]);
        }
      } catch (error) {
        console.error('Failed to load subscriptions:', error);
      } finally {
        setLoading(false);
      }
    };
    fetchSubscriptions();
  }, []);

  // Save subscriptions to SQLite config table
  const saveSubscriptionsList = async (updatedList: Subscription[]) => {
    try {
      await setConfig('subscriptions', JSON.stringify(updatedList));
      setSubscriptions(updatedList);
    } catch (error) {
      console.error('Failed to save subscriptions:', error);
    }
  };

  const handleAddSubscription = async (e: React.FormEvent) => {
    e.preventDefault();
    const parsedCost = parseFloat(cost);
    if (!name.trim() || isNaN(parsedCost) || parsedCost <= 0) return;

    const newSub: Subscription = {
      id: uuidv4(),
      name: name.trim(),
      cost: parsedCost,
      billingCycle,
      startDate,
      category,
      paymentMethod,
      active: true
    };

    const updated = [...subscriptions, newSub];
    await saveSubscriptionsList(updated);

    // Reset Form
    setName('');
    setCost('');
    setBillingCycle('monthly');
    setStartDate(new Date().toISOString().split('T')[0]);
    setCategory('Entertainment');
    setPaymentMethod('Credit Card');
    setShowAddModal(false);
  };

  const handleDeleteSubscription = async (id: string) => {
    if (!window.confirm('Are you sure you want to delete this subscription?')) return;
    const updated = subscriptions.filter(sub => sub.id !== id);
    await saveSubscriptionsList(updated);
  };

  const toggleSubscriptionStatus = async (id: string) => {
    const updated = subscriptions.map(sub => 
      sub.id === id ? { ...sub, active: !sub.active } : sub
    );
    await saveSubscriptionsList(updated);
  };

  // --- Statistics Calculations ---
  const stats = useMemo(() => {
    let activeCount = 0;
    let monthlySpend = 0;
    let annualSpend = 0;
    const categorySpend: Record<Subscription['category'], number> = {
      Entertainment: 0,
      Utilities: 0,
      Health: 0,
      Work: 0,
      Other: 0
    };

    subscriptions.forEach(sub => {
      if (!sub.active) return;
      activeCount++;

      const subMonthly = sub.billingCycle === 'monthly' ? sub.cost : sub.cost / 12;
      monthlySpend += subMonthly;
      annualSpend += subMonthly * 12;

      categorySpend[sub.category] = (categorySpend[sub.category] || 0) + subMonthly;
    });

    return {
      activeCount,
      monthlySpend,
      annualSpend,
      categorySpend
    };
  }, [subscriptions]);

  // --- Filter and Sort List ---
  const filteredSubscriptions = useMemo(() => {
    return subscriptions
      .filter(sub => {
        const matchesSearch = sub.name.toLowerCase().includes(searchTerm.toLowerCase());
        const matchesCategory = selectedCategory === 'all' || sub.category === selectedCategory;
        const matchesStatus = 
          statusFilter === 'all' || 
          (statusFilter === 'active' && sub.active) || 
          (statusFilter === 'paused' && !sub.active);

        return matchesSearch && matchesCategory && matchesStatus;
      })
      .map(sub => {
        const renewalInfo = getNextRenewalInfo(sub.startDate, sub.billingCycle);
        return {
          ...sub,
          ...renewalInfo
        };
      })
      // Sort: active first, then soonest renewal date first
      .sort((a, b) => {
        if (a.active !== b.active) return a.active ? -1 : 1;
        return a.daysRemaining - b.daysRemaining;
      });
  }, [subscriptions, searchTerm, selectedCategory, statusFilter]);

  // Category Theme Styles
  const getCategoryStyles = (cat: Subscription['category']) => {
    switch (cat) {
      case 'Entertainment':
        return { color: 'text-indigo-500', bgColor: 'bg-indigo-500/10', dotColor: 'bg-indigo-500' };
      case 'Utilities':
        return { color: 'text-cyan-500', bgColor: 'bg-cyan-500/10', dotColor: 'bg-cyan-500' };
      case 'Health':
        return { color: 'text-rose-500', bgColor: 'bg-rose-500/10', dotColor: 'bg-rose-500' };
      case 'Work':
        return { color: 'text-amber-500', bgColor: 'bg-amber-500/10', dotColor: 'bg-amber-500' };
      default:
        return { color: 'text-slate-500', bgColor: 'bg-slate-500/10', dotColor: 'bg-slate-500' };
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
    <div className="space-y-6 pb-20">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate('/more')}
            className="p-2 hover:bg-accent rounded-full transition-colors"
          >
            <ArrowLeft size={24} />
          </button>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Subscription Manager</h1>
            <p className="text-muted-foreground">Monitor and optimize your recurring subscriptions.</p>
          </div>
        </div>
        <button
          onClick={() => setShowAddModal(true)}
          className="flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2.5 rounded-xl font-semibold hover:opacity-90 transition-all shadow-lg shadow-primary/20"
        >
          <Plus size={20} />
          <span>Add Subscription</span>
        </button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Monthly spend */}
        <div className="bg-card p-6 rounded-2xl border border-border shadow-sm relative overflow-hidden">
          <div className="absolute top-0 right-0 p-4 opacity-10 text-primary">
            <CreditCard size={64} />
          </div>
          <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider block">Monthly Expenses</span>
          <p className="text-2xl font-bold mt-2 text-foreground">{formatAmount(stats.monthlySpend)}</p>
          <p className="text-xs text-muted-foreground mt-1">Based on active subscriptions</p>
        </div>

        {/* Annual Spend */}
        <div className="bg-card p-6 rounded-2xl border border-border shadow-sm relative overflow-hidden">
          <div className="absolute top-0 right-0 p-4 opacity-10 text-amber-500">
            <TrendingUp size={64} />
          </div>
          <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider block">Annual Expenses</span>
          <p className="text-2xl font-bold mt-2 text-amber-500">{formatAmount(stats.annualSpend)}</p>
          <p className="text-xs text-muted-foreground mt-1">Projected yearly costs</p>
        </div>

        {/* Active subscriptions */}
        <div className="bg-card p-6 rounded-2xl border border-border shadow-sm relative overflow-hidden">
          <div className="absolute top-0 right-0 p-4 opacity-10 text-emerald-500">
            <Sparkles size={64} />
          </div>
          <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider block">Active Services</span>
          <p className="text-2xl font-bold mt-2 text-emerald-500">{stats.activeCount} Service{stats.activeCount !== 1 ? 's' : ''}</p>
          <p className="text-xs text-muted-foreground mt-1">
            {subscriptions.length - stats.activeCount} paused services
          </p>
        </div>
      </div>

      {/* Analytics Category Breakdown */}
      {stats.activeCount > 0 && (
        <div className="bg-card p-6 rounded-2xl border border-border shadow-sm">
          <h3 className="text-sm font-semibold mb-4 uppercase tracking-wider text-muted-foreground flex items-center gap-2">
            <PieChart size={16} className="text-primary" /> Cost Distribution by Category
          </h3>
          <div className="space-y-4">
            {CATEGORIES.map(cat => {
              const val = stats.categorySpend[cat];
              const pct = stats.monthlySpend > 0 ? (val / stats.monthlySpend) * 100 : 0;
              if (val === 0) return null;
              
              const styles = getCategoryStyles(cat);
              return (
                <div key={cat} className="space-y-1.5">
                  <div className="flex justify-between text-xs font-medium">
                    <span className="flex items-center gap-2">
                      <span className={`w-2.5 h-2.5 rounded-full ${styles.dotColor}`} />
                      {cat}
                    </span>
                    <span>{formatAmount(val)}/mo ({pct.toFixed(0)}%)</span>
                  </div>
                  <div className="w-full bg-muted h-2.5 rounded-full overflow-hidden">
                    <div 
                      className={`h-full ${styles.dotColor} rounded-full`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Filters Bar */}
      <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center justify-between">
        {/* Search */}
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={18} />
          <input
            type="text"
            placeholder="Search subscriptions by name..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full bg-card border border-border rounded-xl py-2.5 pl-10 pr-4 outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary text-sm transition-all"
          />
        </div>

        {/* Filter Badges */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Status Tabs */}
          <div className="flex bg-muted p-1 rounded-xl text-xs overflow-hidden">
            <button
              onClick={() => setStatusFilter('all')}
              className={`px-3 py-1.5 font-semibold rounded-lg transition-all ${statusFilter === 'all' ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
            >
              All
            </button>
            <button
              onClick={() => setStatusFilter('active')}
              className={`px-3 py-1.5 font-semibold rounded-lg transition-all ${statusFilter === 'active' ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
            >
              Active
            </button>
            <button
              onClick={() => setStatusFilter('paused')}
              className={`px-3 py-1.5 font-semibold rounded-lg transition-all ${statusFilter === 'paused' ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
            >
              Paused
            </button>
          </div>

          {/* Category Filter */}
          <div className="relative flex items-center bg-card border border-border rounded-xl px-3 py-1.5 text-xs font-semibold">
            <Filter size={14} className="text-muted-foreground mr-1.5" />
            <select
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
              className="bg-transparent border-none outline-none pr-4 cursor-pointer text-muted-foreground hover:text-foreground transition-colors"
            >
              <option value="all">All Categories</option>
              {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
        </div>
      </div>

      {/* Subscriptions Cards List */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {filteredSubscriptions.length === 0 ? (
          <div className="bg-card rounded-2xl border border-border p-12 text-center md:col-span-2">
            <div className="inline-flex p-4 rounded-full bg-muted mb-4 text-muted-foreground">
              <CreditCard size={32} />
            </div>
            <h3 className="text-lg font-semibold">No subscriptions found</h3>
            <p className="text-muted-foreground max-w-sm mx-auto mt-1">
              Add subscription records, check their status, or adjust your filter choices.
            </p>
          </div>
        ) : (
          filteredSubscriptions.map(sub => {
            const styles = getCategoryStyles(sub.category);
            const isCritical = sub.active && sub.daysRemaining <= 7;
            const isDueToday = sub.active && sub.daysRemaining === 0;

            return (
              <div 
                key={sub.id} 
                className={`bg-card border border-border p-5 rounded-2xl flex flex-col justify-between gap-4 shadow-sm hover:border-primary/40 hover:shadow-md transition-all ${
                  !sub.active ? 'opacity-65 grayscale bg-muted/10' : ''
                }`}
              >
                <div className="flex items-start justify-between">
                  <div className="flex gap-3">
                    <div className={`p-3 rounded-xl ${styles.bgColor} ${styles.color} self-start`}>
                      <CreditCard size={20} />
                    </div>
                    <div>
                      <h4 className="font-bold text-foreground text-base leading-tight">{sub.name}</h4>
                      <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
                        <span className="text-[10px] bg-muted px-2 py-0.5 rounded-full font-bold uppercase text-muted-foreground">
                          {sub.billingCycle}
                        </span>
                        <span className="text-[10px] bg-primary/5 px-2 py-0.5 rounded-full font-bold uppercase text-primary">
                          {sub.category}
                        </span>
                      </div>
                      <p className="text-xs text-muted-foreground mt-2 flex items-center gap-1">
                        <Tag size={12} /> Pay via: {sub.paymentMethod}
                      </p>
                    </div>
                  </div>

                  <div className="text-right">
                    <div className="text-lg font-extrabold text-foreground">
                      {formatAmount(sub.cost)}
                    </div>
                    <div className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider mt-0.5">
                      per {sub.billingCycle === 'monthly' ? 'month' : 'year'}
                    </div>
                  </div>
                </div>

                <div className="border-t border-border pt-4 flex items-center justify-between">
                  {/* Status toggle & delete */}
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => toggleSubscriptionStatus(sub.id)}
                      className={`p-2 rounded-xl transition-all flex items-center gap-1.5 text-xs font-semibold ${
                        sub.active 
                          ? 'bg-amber-500/10 text-amber-500 hover:bg-amber-500/20' 
                          : 'bg-emerald-500/10 text-emerald-500 hover:bg-emerald-500/20'
                      }`}
                      title={sub.active ? 'Pause Service' : 'Activate Service'}
                    >
                      {sub.active ? <Pause size={14} /> : <Play size={14} />}
                      <span>{sub.active ? 'Pause' : 'Resume'}</span>
                    </button>
                    <button
                      onClick={() => handleDeleteSubscription(sub.id)}
                      className="p-2 text-muted-foreground hover:text-rose-500 hover:bg-rose-500/10 rounded-xl transition-all"
                      title="Delete Subscription"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>

                  {/* Renewal Alerts */}
                  {sub.active && sub.daysRemaining !== undefined && (
                    <div className="flex items-center gap-1.5">
                      <Calendar size={14} className="text-muted-foreground" />
                      <span className={`text-xs font-semibold ${
                        isDueToday 
                          ? 'text-rose-500 font-bold' 
                          : isCritical 
                            ? 'text-amber-500 font-bold' 
                            : 'text-muted-foreground'
                      }`}>
                        {isDueToday 
                          ? 'Renews today!' 
                          : sub.daysRemaining === 1 
                            ? 'Renews tomorrow' 
                            : `Renews in ${sub.daysRemaining} days`}
                      </span>
                      {isCritical && (
                        <AlertTriangle size={14} className="text-amber-500 animate-pulse" />
                      )}
                    </div>
                  )}

                  {!sub.active && (
                    <span className="text-xs text-muted-foreground italic font-medium">Service Paused</span>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Add Subscription Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-card w-full max-w-md rounded-2xl border border-border shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="p-6 border-b border-border flex items-center justify-between">
              <h2 className="text-lg font-bold">Add Subscription</h2>
              <button
                onClick={() => setShowAddModal(false)}
                className="p-1.5 hover:bg-muted rounded-full transition-colors"
              >
                <Plus size={20} className="rotate-45" />
              </button>
            </div>
            <form onSubmit={handleAddSubscription} className="p-6 space-y-4">
              {/* Name */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold uppercase text-muted-foreground">Service Name</label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Netflix, Spotify, iCloud"
                  className="w-full bg-muted border-none rounded-xl py-2.5 px-4 outline-none focus:ring-2 focus:ring-primary/20 text-sm"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                {/* Cost */}
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold uppercase text-muted-foreground">Cost</label>
                  <input
                    type="number"
                    step="0.01"
                    value={cost}
                    onChange={(e) => setCost(e.target.value)}
                    placeholder="e.g. 15.49"
                    className="w-full bg-muted border-none rounded-xl py-2.5 px-4 outline-none focus:ring-2 focus:ring-primary/20 text-sm"
                    required
                  />
                </div>

                {/* Billing Cycle */}
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold uppercase text-muted-foreground">Billing Cycle</label>
                  <select
                    value={billingCycle}
                    onChange={(e) => setBillingCycle(e.target.value as 'monthly' | 'yearly')}
                    className="w-full bg-muted border-none rounded-xl py-2.5 px-4 outline-none focus:ring-2 focus:ring-primary/20 text-sm cursor-pointer"
                  >
                    <option value="monthly">Monthly</option>
                    <option value="yearly">Yearly</option>
                  </select>
                </div>
              </div>

              {/* Start Date */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold uppercase text-muted-foreground">Start / Next Bill Date</label>
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="w-full bg-muted border-none rounded-xl py-2.5 px-4 outline-none focus:ring-2 focus:ring-primary/20 text-sm cursor-pointer"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                {/* Category */}
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold uppercase text-muted-foreground">Category</label>
                  <select
                    value={category}
                    onChange={(e) => setCategory(e.target.value as Subscription['category'])}
                    className="w-full bg-muted border-none rounded-xl py-2.5 px-4 outline-none focus:ring-2 focus:ring-primary/20 text-sm cursor-pointer"
                  >
                    {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>

                {/* Payment Method */}
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold uppercase text-muted-foreground">Payment Method</label>
                  <select
                    value={paymentMethod}
                    onChange={(e) => setPaymentMethod(e.target.value)}
                    className="w-full bg-muted border-none rounded-xl py-2.5 px-4 outline-none focus:ring-2 focus:ring-primary/20 text-sm cursor-pointer"
                  >
                    {PAYMENT_METHODS.map(pm => <option key={pm} value={pm}>{pm}</option>)}
                  </select>
                </div>
              </div>

              <div className="pt-4 flex gap-3">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="flex-1 px-4 py-2.5 rounded-xl font-medium border border-border hover:bg-muted text-sm transition-all"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 px-4 py-2.5 rounded-xl font-semibold bg-primary text-primary-foreground hover:opacity-90 text-sm transition-all shadow-lg shadow-primary/20"
                >
                  Save Subscription
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default Subscriptions;
