import React, { useState } from 'react';
import type { PlanConfig } from '../../../types/payments';
import { Button } from '../../ui/Button';
import { PlanBadge } from '../../ui/PlanBadge';
import { Shield, Zap, Crown, Edit, UserCheck, Search } from 'lucide-react';
import { toast } from 'sonner';

interface SubscriptionsPlansTabProps {
  plansConfig: Record<string, PlanConfig>;
  users: any[];
  onSavePlanConfig: (planId: string, planData: PlanConfig) => Promise<void>;
  onAssignUserPlan: (userId: string, planId: string, expiryDate: string) => Promise<void>;
}

export const SubscriptionsPlansTab: React.FC<SubscriptionsPlansTabProps> = ({
  plansConfig,
  users,
  onSavePlanConfig,
  onAssignUserPlan
}) => {
  const [activeSubTab, setActiveSubTab] = useState<'plans' | 'users'>('plans');
  const [editingPlanId, setEditingPlanId] = useState<string | null>(null);
  const [planForm, setPlanForm] = useState<Partial<PlanConfig>>({});

  // User Subscription Assignment State
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedUser, setSelectedUser] = useState<any | null>(null);
  const [showAssignModal, setShowAssignModal] = useState(false);
  const [targetPlan, setTargetPlan] = useState('pro');
  const [expiryDays, setExpiryDays] = useState(30);

  const filteredUsers = users.filter(u =>
    (u.email || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
    (u.displayName || '').toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleEditPlan = (planId: string) => {
    const p = plansConfig[planId];
    if (p) {
      setEditingPlanId(planId);
      setPlanForm({ ...p });
    }
  };

  const handleSavePlanSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingPlanId) return;

    try {
      await onSavePlanConfig(editingPlanId, planForm as PlanConfig);
      toast.success(`Plan ${planForm.name} updated!`);
      setEditingPlanId(null);
    } catch (e: any) {
      toast.error('Failed to update plan: ' + (e.message || e));
    }
  };

  const handleConfirmAssignPlan = async () => {
    if (!selectedUser) return;
    const d = new Date();
    d.setDate(d.getDate() + Number(expiryDays));
    const expiryISO = d.toISOString();

    try {
      await onAssignUserPlan(selectedUser.id, targetPlan, expiryISO);
      toast.success(`Assigned ${targetPlan.toUpperCase()} plan to ${selectedUser.email}`);
      setShowAssignModal(false);
      setSelectedUser(null);
    } catch (e: any) {
      toast.error('Plan assignment failed: ' + (e.message || e));
    }
  };

  return (
    <div className="space-y-6 text-left">
      {/* Sub Tab Switcher */}
      <div className="flex border-b border-border/60 gap-4">
        <button
          onClick={() => setActiveSubTab('plans')}
          className={`pb-2 text-xs font-bold transition-colors border-b-2 ${activeSubTab === 'plans' ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
        >
          Plan Tiers Configuration
        </button>
        <button
          onClick={() => setActiveSubTab('users')}
          className={`pb-2 text-xs font-bold transition-colors border-b-2 ${activeSubTab === 'users' ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
        >
          Subscriber Lifecycle & Manual Assignments ({users.length})
        </button>
      </div>

      {/* View 1: Plan Tiers */}
      {activeSubTab === 'plans' && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {Object.entries(plansConfig).map(([planId, plan]) => (
            <div key={planId} className="bg-card border border-border/80 rounded-3xl p-5 shadow-sm space-y-4 flex flex-col justify-between">
              <div className="space-y-3">
                <div className="flex items-center justify-between border-b border-border/40 pb-3">
                  <div className="flex items-center gap-2">
                    {planId === 'max' ? <Crown className="text-warning" size={20} /> : planId === 'pro' ? <Zap className="text-brand" size={20} /> : <Shield className="text-muted-foreground" size={20} />}
                    <h3 className="font-extrabold text-sm text-foreground">{plan.name}</h3>
                  </div>
                  <PlanBadge plan={planId as any} size="sm" />
                </div>

                <div className="space-y-1">
                  <span className="text-2xl font-black text-foreground">{plan.currency} {plan.price}</span>
                  <span className="text-[10px] text-muted-foreground block font-semibold">Billing Cycle: {plan.billingCycle}</span>
                </div>

                <div className="space-y-1 text-xs border-t border-border/40 pt-3">
                  <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider block mb-1">Limits:</span>
                  <p>• AI Calls: <strong>{plan.limits?.aiCallsPerDay ?? 0}/day</strong></p>
                  <p>• Max Transactions: <strong>{plan.limits?.maxTransactions === -1 ? 'Unlimited' : plan.limits?.maxTransactions?.toLocaleString()}</strong></p>
                </div>

                <div className="space-y-1 text-xs border-t border-border/40 pt-3">
                  <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider block mb-1">Features:</span>
                  <ul className="space-y-1 text-[11px] text-muted-foreground">
                    {(plan.features || []).map(f => (
                      <li key={f} className="capitalize">✓ {f.replace('-', ' ')}</li>
                    ))}
                  </ul>
                </div>
              </div>

              <div className="pt-2">
                <Button variant="outline" size="sm" className="w-full" onClick={() => handleEditPlan(planId)} leftIcon={<Edit size={14} />}>
                  Edit Plan Config
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* View 2: Subscriber List */}
      {activeSubTab === 'users' && (
        <div className="space-y-4">
          <div className="flex justify-between items-center bg-card border border-border/80 rounded-3xl p-4 shadow-sm">
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground" size={16} />
              <input
                type="text"
                placeholder="Search subscriber by email or name..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-10 pr-4 py-2 bg-muted/20 border border-border/60 rounded-2xl text-xs focus:outline-none"
              />
            </div>
          </div>

          <div className="bg-card border border-border rounded-3xl p-5 shadow-sm space-y-4">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="border-b border-border/40 text-muted-foreground font-semibold">
                    <th className="py-3 px-2">User</th>
                    <th className="py-3 px-2">Current Plan</th>
                    <th className="py-3 px-2">Expiry Date</th>
                    <th className="py-3 px-2 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/30">
                  {filteredUsers.map((u) => (
                    <tr key={u.id} className="hover:bg-muted/10 transition-colors">
                      <td className="py-3 px-2">
                        <p className="font-bold text-foreground">{u.displayName || u.email?.split('@')[0]}</p>
                        <p className="text-[10px] text-muted-foreground">{u.email}</p>
                      </td>
                      <td className="py-3 px-2">
                        <PlanBadge plan={u.plan || (u.isPro ? 'pro' : 'standard')} size="sm" />
                      </td>
                      <td className="py-3 px-2 text-muted-foreground text-[10px]">
                        {u.planExpiresAt ? new Date(u.planExpiresAt).toLocaleDateString() : 'Never (Forever)'}
                      </td>
                      <td className="py-3 px-2 text-right">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            setSelectedUser(u);
                            setTargetPlan(u.plan || 'pro');
                            setShowAssignModal(true);
                          }}
                          leftIcon={<UserCheck size={14} />}
                        >
                          Modify Plan
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Plan Edit Modal */}
      {editingPlanId && (
        <div className="fixed inset-0 z-50 bg-background/80 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-card border border-border rounded-3xl p-6 max-w-md w-full space-y-4 shadow-2xl text-left">
            <h3 className="font-extrabold text-sm text-foreground">Edit Plan: {planForm.name}</h3>

            <form onSubmit={handleSavePlanSubmit} className="space-y-3 text-xs">
              <div>
                <label className="font-semibold block mb-1">Price ({planForm.currency || 'PKR'})</label>
                <input
                  type="number"
                  value={planForm.price || 0}
                  onChange={(e) => setPlanForm({ ...planForm, price: Number(e.target.value) })}
                  className="w-full bg-muted/20 border border-border/60 rounded-xl px-3 py-2 text-foreground focus:outline-none"
                />
              </div>

              <div>
                <label className="font-semibold block mb-1">AI Calls Per Day Limit</label>
                <input
                  type="number"
                  value={planForm.limits?.aiCallsPerDay || 0}
                  onChange={(e) => setPlanForm({
                    ...planForm,
                    limits: { ...planForm.limits!, aiCallsPerDay: Number(e.target.value) }
                  })}
                  className="w-full bg-muted/20 border border-border/60 rounded-xl px-3 py-2 text-foreground focus:outline-none"
                />
              </div>

              <div>
                <label className="font-semibold block mb-1">Max Transactions (-1 for Unlimited)</label>
                <input
                  type="number"
                  value={planForm.limits?.maxTransactions || 0}
                  onChange={(e) => setPlanForm({
                    ...planForm,
                    limits: { ...planForm.limits!, maxTransactions: Number(e.target.value) }
                  })}
                  className="w-full bg-muted/20 border border-border/60 rounded-xl px-3 py-2 text-foreground focus:outline-none"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <Button variant="ghost" size="sm" onClick={() => setEditingPlanId(null)}>Cancel</Button>
                <Button variant="primary" size="sm" type="submit">Save Plan Changes</Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* User Assign Plan Modal */}
      {showAssignModal && selectedUser && (
        <div className="fixed inset-0 z-50 bg-background/80 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-card border border-border rounded-3xl p-6 max-w-md w-full space-y-4 shadow-2xl text-left">
            <h3 className="font-extrabold text-sm text-foreground">Assign Plan to {selectedUser.email}</h3>

            <div className="space-y-3 text-xs">
              <div>
                <label className="font-semibold block mb-1">Target Plan Tier</label>
                <select
                  value={targetPlan}
                  onChange={(e) => setTargetPlan(e.target.value)}
                  className="w-full bg-muted/20 border border-border/60 rounded-xl px-3 py-2 text-foreground focus:outline-none font-bold"
                >
                  <option value="standard">Standard (Free)</option>
                  <option value="pro">Pro Plan</option>
                  <option value="max">Max Plan</option>
                </select>
              </div>

              <div>
                <label className="font-semibold block mb-1">Duration (Days)</label>
                <select
                  value={expiryDays}
                  onChange={(e) => setExpiryDays(Number(e.target.value))}
                  className="w-full bg-muted/20 border border-border/60 rounded-xl px-3 py-2 text-foreground focus:outline-none"
                >
                  <option value={30}>30 Days (1 Month)</option>
                  <option value={90}>90 Days (3 Months)</option>
                  <option value={365}>365 Days (1 Year)</option>
                </select>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button variant="ghost" size="sm" onClick={() => setShowAssignModal(false)}>Cancel</Button>
              <Button variant="primary" size="sm" onClick={handleConfirmAssignPlan}>Apply Plan Update</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
