import React, { useEffect, useState } from 'react';
import { getGoals, addGoal, deleteGoal, getSummaryByAccount } from '../db/queries';
import type { Goal } from '../db/queries';
import { useCurrency } from '../contexts/CurrencyContext';
import { Plus, Target, Trash2, Calendar, CheckCircle2 } from 'lucide-react';
import { toast } from 'sonner';

const Goals: React.FC = () => {
  const { formatAmount } = useCurrency();
  const [goals, setGoals] = useState<Goal[]>([]);
  const [accountsList, setAccountsList] = useState<any[]>([]);
  const [showAddModal, setShowAddModal] = useState(false);
  const [loading, setLoading] = useState(true);
  const [totalBalance, setTotalBalance] = useState(0);

  // Form State
  const [newName, setNewName] = useState('');
  const [newTarget, setNewTarget] = useState('');
  const [newDeadline, setNewDeadline] = useState('');
  const [newLinkedAccounts, setNewLinkedAccounts] = useState<string[]>([]);

  useEffect(() => {
    loadData();
    window.addEventListener('app-sync-complete', loadData);
    return () => window.removeEventListener('app-sync-complete', loadData);
  }, []);

  const loadData = async () => {
    try {
      const [goalsList, accounts] = await Promise.all([
        getGoals(),
        getSummaryByAccount()
      ]);
      setGoals(goalsList);
      setAccountsList(accounts);
      
      const balance = accounts.reduce((acc, curr) => acc + (curr.initial_balance + curr.income - curr.expense), 0);
      setTotalBalance(balance);
    } catch (error) {
      console.error('Failed to load goals', error);
    } finally {
      setLoading(false);
    }
  };

  const handleAddGoal = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName || !newTarget) return;

    try {
      const linkedPayload = newLinkedAccounts.length > 0 ? JSON.stringify(newLinkedAccounts) : null;
      await addGoal(newName, parseFloat(newTarget), null, newDeadline || null, linkedPayload, crypto.randomUUID());
      
      toast.success('Goal added successfully');
      setShowAddModal(false);
      setNewName('');
      setNewTarget('');
      setNewDeadline('');
      setNewLinkedAccounts([]);
      loadData();
    } catch (error) {
      toast.error('Failed to add goal');
    }
  };

  const handleDeleteGoal = async (id: string) => {
    if (!confirm('Are you sure you want to delete this goal?')) return;
    try {
      await deleteGoal(id);
      toast.success('Goal deleted');
      loadData();
    } catch (error) {
      toast.error('Failed to delete goal');
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
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Savings Goals</h1>
          <p className="text-sm text-muted-foreground mt-1">Track your progress towards your dreams</p>
        </div>
        <button
          onClick={() => setShowAddModal(true)}
          className="bg-primary text-primary-foreground p-3 rounded-xl shadow-lg hover:shadow-primary/20 transition-all flex items-center gap-2"
        >
          <Plus size={20} />
          <span className="hidden sm:inline font-medium">New Goal</span>
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {goals.map((goal) => {
          let currentBalance = 0;
          
          if (goal.linked_accounts) {
            try {
              const linkedIds = JSON.parse(goal.linked_accounts);
              if (Array.isArray(linkedIds) && linkedIds.length > 0) {
                currentBalance = accountsList
                  .filter(a => linkedIds.includes(a.id))
                  .reduce((acc, curr) => acc + (curr.initial_balance + curr.income - curr.expense), 0);
              } else {
                currentBalance = 0;
              }
            } catch (e) {
              currentBalance = totalBalance; // fallback
            }
          } else {
            // Legacy fallbacks
            currentBalance = totalBalance;
          }

          const progress = Math.min((currentBalance / goal.target_amount) * 100, 100);
          const isCompleted = progress >= 100;

          return (
            <div key={goal.id} className="bg-card p-6 rounded-2xl shadow-sm border border-border group relative transition-all hover:border-primary/50">
              <button
                onClick={() => handleDeleteGoal(goal.id)}
                className="absolute top-4 right-4 p-2 text-muted-foreground hover:text-destructive opacity-0 group-hover:opacity-100 transition-opacity"
              >
                <Trash2 size={16} />
              </button>

              <div className="flex items-center gap-4 mb-6">
                <div className={`p-3 rounded-xl ${isCompleted ? 'bg-emerald-500/10 text-emerald-500' : 'bg-primary/10 text-primary'}`}>
                  {isCompleted ? <CheckCircle2 size={24} /> : <Target size={24} />}
                </div>
                <div>
                  <h2 className="font-semibold text-lg">{goal.name}</h2>
                  <p className="text-sm text-muted-foreground">Target: {formatAmount(goal.target_amount)}</p>
                </div>
              </div>

              <div className="space-y-3">
                <div className="flex items-center justify-between text-sm">
                  <span className="font-medium text-muted-foreground">{progress.toFixed(0)}% Complete</span>
                  <span className="font-bold">{formatAmount(currentBalance)}</span>
                </div>
                <div className="h-3 w-full bg-muted rounded-full overflow-hidden">
                  <div
                    className={`h-full transition-all duration-1000 ${isCompleted ? 'bg-emerald-500' : 'bg-primary'}`}
                    style={{ width: `${progress}%` }}
                  />
                </div>
              </div>

              <div className="mt-6 pt-6 border-t border-border flex items-center justify-between text-xs text-muted-foreground">
                <div className="flex items-center gap-1">
                  <Calendar size={12} />
                  <span>
                    {goal.deadline 
                      ? `Deadline: ${new Date(goal.deadline).toLocaleDateString()}` 
                      : (isCompleted ? 'Goal Met!' : 'No deadline set')}
                  </span>
                </div>
                {!isCompleted && currentBalance > 0 && (
                  <div className="text-primary font-medium">
                    Est: {new Date(Date.now() + ((goal.target_amount - currentBalance) / (currentBalance / 30 || 1)) * 24 * 60 * 60 * 1000).toLocaleDateString()}
                  </div>
                )}
              </div>
            </div>
          );
        })}

        {goals.length === 0 && (
          <div className="col-span-full py-20 text-center border-2 border-dashed border-border rounded-3xl">
            <div className="bg-muted inline-p-4 rounded-full mb-4 inline-block">
              <Target size={40} className="text-muted-foreground" />
            </div>
            <h3 className="text-lg font-medium">No goals yet</h3>
            <p className="text-muted-foreground text-sm max-w-xs mx-auto mt-2">
              Start by setting a target for what you want to achieve.
            </p>
            <button 
              onClick={() => setShowAddModal(true)}
              className="mt-6 text-primary font-semibold hover:underline"
            >
              Set your first goal
            </button>
          </div>
        )}
      </div>

      {showAddModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-card w-full max-w-md rounded-3xl shadow-2xl p-6 border border-border animate-in fade-in zoom-in duration-200">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-bold">Add Savings Goal</h2>
              <button onClick={() => setShowAddModal(false)} className="text-muted-foreground hover:bg-muted p-2 rounded-full">
                <Plus size={20} className="rotate-45" />
              </button>
            </div>

            <form onSubmit={handleAddGoal} className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1.5 ml-1">Goal Name</label>
                <input
                  type="text"
                  required
                  placeholder="e.g., Buy a laptop"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  className="w-full bg-muted border-none rounded-2xl p-4 focus:ring-2 focus:ring-primary transition-all"
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-1.5 ml-1">Target Amount</label>
                <input
                  type="number"
                  required
                  placeholder="0.00"
                  value={newTarget}
                  onChange={(e) => setNewTarget(e.target.value)}
                  className="w-full bg-muted border-none rounded-2xl p-4 focus:ring-2 focus:ring-primary transition-all"
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-1.5 ml-1">Target Date (Optional)</label>
                <input
                  type="date"
                  value={newDeadline}
                  onChange={(e) => setNewDeadline(e.target.value)}
                  className="w-full bg-muted border-none rounded-2xl p-4 focus:ring-2 focus:ring-primary transition-all"
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-1.5 ml-1 flex justify-between">
                  Linked Accounts
                  <span className="text-xs text-muted-foreground font-normal">If empty, tracks net worth</span>
                </label>
                <div className="bg-muted p-4 rounded-2xl space-y-3 max-h-44 overflow-y-auto">
                  {accountsList.map((acc) => (
                    <label key={acc.id} className="flex items-center justify-between cursor-pointer group hover:bg-background/40 p-2 -mx-2 rounded-xl transition-colors">
                      <span className="text-sm font-medium">{acc.name}</span>
                      <div className="relative inline-flex items-center">
                        <input
                          type="checkbox"
                          checked={newLinkedAccounts.includes(acc.id)}
                          onChange={(e) => {
                            if (e.target.checked) setNewLinkedAccounts(prev => [...prev, acc.id]);
                            else setNewLinkedAccounts(prev => prev.filter(id => id !== acc.id));
                          }}
                          className="w-5 h-5 rounded border-border text-primary focus:ring-primary focus:ring-offset-background accent-primary transition-all cursor-pointer"
                        />
                      </div>
                    </label>
                  ))}
                  {accountsList.length === 0 && <p className="text-xs text-muted-foreground text-center py-2">No accounts available.</p>}
                </div>
              </div>

              <div className="pt-4 flex gap-3">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="flex-1 bg-muted font-semibold py-4 rounded-2xl hover:bg-muted/80 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 bg-primary text-primary-foreground font-semibold py-4 rounded-2xl shadow-lg hover:shadow-primary/20 transition-all"
                >
                  Create Goal
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default Goals;
