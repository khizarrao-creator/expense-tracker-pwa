import React, { useState } from 'react';
import type { UserLedger } from '../../../types/payments';
import { Badge } from '../../ui/Badge';
import { Button } from '../../ui/Button';
import { Wallet, Search, PlusCircle, ArrowUpRight, ArrowDownLeft, History } from 'lucide-react';
import { toast } from 'sonner';

interface DuesAndAdvancesTabProps {
  ledgers: UserLedger[];
  users?: any[];
  onAdjustLedger: (
    userId: string,
    userEmail: string,
    userName: string,
    type: 'advance_credit' | 'due_recorded' | 'adjustment',
    amount: number,
    description: string
  ) => Promise<void>;
}

export const DuesAndAdvancesTab: React.FC<DuesAndAdvancesTabProps> = ({
  ledgers,
  users = [],
  onAdjustLedger
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [filterType, setFilterType] = useState<'all' | 'has_advance' | 'has_dues'>('all');
  const [selectedLedger, setSelectedLedger] = useState<UserLedger | null>(null);
  const [showAdjustModal, setShowAdjustModal] = useState(false);

  // Autocomplete state
  const [emailSuggestions, setEmailSuggestions] = useState<any[]>([]);
  const [showEmailSuggestions, setShowEmailSuggestions] = useState(false);

  // Form states
  const [targetUserId, setTargetUserId] = useState('');
  const [targetUserEmail, setTargetUserEmail] = useState('');
  const [targetUserName, setTargetUserName] = useState('');
  const [adjustmentType, setAdjustmentType] = useState<'advance_credit' | 'due_recorded' | 'adjustment'>('advance_credit');
  const [amount, setAmount] = useState<number>(0);
  const [description, setDescription] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const filteredLedgers = ledgers.filter(l => {
    const matchesSearch =
      (l.userName || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
      (l.userEmail || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
      (l.userId || '').toLowerCase().includes(searchQuery.toLowerCase());

    if (filterType === 'has_advance') return matchesSearch && (l.advanceCredit > 0);
    if (filterType === 'has_dues') return matchesSearch && (l.outstandingDues > 0);
    return matchesSearch;
  });

  const totalAdvances = ledgers.reduce((sum, l) => sum + (l.advanceCredit || 0), 0);
  const totalOutstandingDues = ledgers.reduce((sum, l) => sum + (l.outstandingDues || 0), 0);

  const handleOpenAdjustModal = (ledger?: UserLedger) => {
    if (ledger) {
      setTargetUserId(ledger.userId);
      setTargetUserEmail(ledger.userEmail);
      setTargetUserName(ledger.userName);
    } else {
      setTargetUserId('');
      setTargetUserEmail('');
      setTargetUserName('');
    }
    setAmount(0);
    setDescription('');
    setShowAdjustModal(true);
  };

  const handleSubmitAdjustment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!targetUserEmail.trim() || amount <= 0) {
      toast.error('Please enter a valid user email and positive amount.');
      return;
    }

    const userId = targetUserId.trim() || targetUserEmail.trim().toLowerCase();
    const userName = targetUserName.trim() || targetUserEmail.split('@')[0];

    setIsSubmitting(true);
    try {
      await onAdjustLedger(
        userId,
        targetUserEmail.trim(),
        userName,
        adjustmentType,
        amount,
        description.trim() || `${adjustmentType.replace('_', ' ')} adjustment`
      );
      toast.success('Ledger balance updated successfully!');
      setShowAdjustModal(false);
    } catch (e: any) {
      toast.error('Failed to update ledger: ' + (e.message || e));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-6 text-left">
      {/* Stat Cards Header */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="bg-card border border-success/30 bg-success/5 rounded-3xl p-5 shadow-sm flex items-center justify-between">
          <div>
            <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Total Advance Credits</span>
            <h3 className="text-2xl font-black text-success">PKR {totalAdvances.toLocaleString()}</h3>
            <p className="text-[11px] text-muted-foreground mt-0.5">Pre-paid customer deposits & overpayments</p>
          </div>
          <div className="p-3 bg-success/10 text-success rounded-2xl">
            <ArrowDownLeft size={24} />
          </div>
        </div>

        <div className="bg-card border border-destructive/30 bg-destructive/5 rounded-3xl p-5 shadow-sm flex items-center justify-between">
          <div>
            <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Total Outstanding Dues</span>
            <h3 className="text-2xl font-black text-destructive">PKR {totalOutstandingDues.toLocaleString()}</h3>
            <p className="text-[11px] text-muted-foreground mt-0.5">Unpaid invoices & pending balance dues</p>
          </div>
          <div className="p-3 bg-destructive/10 text-destructive rounded-2xl">
            <ArrowUpRight size={24} />
          </div>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="flex flex-col sm:flex-row justify-between items-stretch sm:items-center gap-4 bg-card border border-border/80 rounded-3xl p-4 shadow-sm">
        <div className="relative flex-1">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground" size={16} />
          <input
            type="text"
            placeholder="Search user ledger by Email or Name..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2 bg-muted/20 border border-border/60 rounded-2xl text-xs focus:outline-none focus:ring-2 focus:ring-primary/40"
          />
        </div>

        <div className="flex items-center gap-3">
          <select
            value={filterType}
            onChange={(e) => setFilterType(e.target.value as any)}
            className="bg-muted/20 border border-border/60 rounded-2xl px-3 py-2 text-xs font-semibold text-foreground focus:outline-none"
          >
            <option value="all">All Ledgers ({ledgers.length})</option>
            <option value="has_advance">Has Advance Credit</option>
            <option value="has_dues">Has Outstanding Dues</option>
          </select>

          <Button
            variant="primary"
            size="sm"
            onClick={() => handleOpenAdjustModal()}
            leftIcon={<PlusCircle size={14} />}
          >
            Adjust Ledger
          </Button>
        </div>
      </div>

      {/* Ledgers Table */}
      <div className="bg-card border border-border rounded-3xl p-5 shadow-sm space-y-4">
        <div className="flex items-center justify-between border-b border-border/40 pb-4">
          <div className="flex items-center gap-2">
            <Wallet className="text-primary" size={18} />
            <h3 className="font-extrabold text-sm text-foreground">User Balance Directory</h3>
          </div>
          <Badge variant="outline" size="sm">Accounts: {ledgers.length}</Badge>
        </div>

        {filteredLedgers.length === 0 ? (
          <div className="py-12 text-center text-xs text-muted-foreground italic">
            No user ledgers found matching your criteria.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-border/40 text-muted-foreground font-semibold">
                  <th className="py-3 px-2">Customer</th>
                  <th className="py-3 px-2">Advance Credit</th>
                  <th className="py-3 px-2">Outstanding Dues</th>
                  <th className="py-3 px-2">Net Status</th>
                  <th className="py-3 px-2">Last Updated</th>
                  <th className="py-3 px-2 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/30">
                {filteredLedgers.map((l) => {
                  const netBalance = l.advanceCredit - l.outstandingDues;
                  return (
                    <tr key={l.userId} className="hover:bg-muted/10 transition-colors">
                      <td className="py-3 px-2">
                        <p className="font-bold text-foreground">{l.userName}</p>
                        <p className="text-[10px] text-muted-foreground">{l.userEmail}</p>
                      </td>
                      <td className="py-3 px-2 font-bold text-success">
                        PKR {l.advanceCredit.toLocaleString()}
                      </td>
                      <td className="py-3 px-2 font-bold text-destructive">
                        PKR {l.outstandingDues.toLocaleString()}
                      </td>
                      <td className="py-3 px-2">
                        <Badge
                          variant={
                            netBalance > 0 ? 'success' :
                            netBalance < 0 ? 'danger' : 'outline'
                          }
                          size="sm"
                        >
                          {netBalance > 0 ? `+PKR ${netBalance}` : netBalance < 0 ? `-PKR ${Math.abs(netBalance)}` : 'Balanced'}
                        </Badge>
                      </td>
                      <td className="py-3 px-2 text-muted-foreground text-[10px]">
                        {new Date(l.lastUpdated).toLocaleDateString()}
                      </td>
                      <td className="py-3 px-2 text-right space-x-2 shrink-0">
                        <button
                          onClick={() => setSelectedLedger(l)}
                          className="p-1.5 hover:bg-muted rounded-lg text-primary transition-colors inline-flex"
                          title="View Ledger History"
                        >
                          <History size={16} />
                        </button>
                        <button
                          onClick={() => handleOpenAdjustModal(l)}
                          className="p-1.5 hover:bg-muted rounded-lg text-brand transition-colors inline-flex"
                          title="Adjust Balance"
                        >
                          <PlusCircle size={16} />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Ledger History Lightbox */}
      {selectedLedger && (
        <div className="fixed inset-0 z-50 bg-background/80 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-card border border-border rounded-3xl p-6 max-w-lg w-full space-y-4 shadow-2xl text-left">
            <div className="flex justify-between items-center border-b border-border/40 pb-3">
              <div>
                <h3 className="font-extrabold text-sm text-foreground">Ledger History Timeline</h3>
                <p className="text-[10px] text-muted-foreground">{selectedLedger.userEmail}</p>
              </div>
              <button onClick={() => setSelectedLedger(null)} className="text-muted-foreground">✕</button>
            </div>

            <div className="space-y-3 max-h-[300px] overflow-y-auto pr-1">
              {(selectedLedger.history || []).length === 0 ? (
                <p className="text-xs text-muted-foreground py-6 text-center italic">No ledger transaction history recorded yet.</p>
              ) : (
                selectedLedger.history.map((tx) => (
                  <div key={tx.id} className="border border-border/60 bg-muted/10 p-3 rounded-2xl space-y-1 text-xs">
                    <div className="flex justify-between items-center">
                      <span className="font-bold text-foreground capitalize">{tx.type.replace('_', ' ')}</span>
                      <span className={`font-mono font-bold ${tx.type === 'advance_credit' ? 'text-success' : 'text-destructive'}`}>
                        {tx.type === 'advance_credit' ? '+' : '-'}{tx.currency || 'PKR'} {tx.amount}
                      </span>
                    </div>
                    <p className="text-[11px] text-muted-foreground">{tx.description}</p>
                    <div className="flex justify-between items-center text-[9px] text-muted-foreground pt-1 border-t border-border/30">
                      <span>By: {tx.performedBy}</span>
                      <span>{new Date(tx.timestamp).toLocaleString()}</span>
                    </div>
                  </div>
                ))
              )}
            </div>

            <div className="flex justify-end pt-2">
              <Button variant="ghost" size="sm" onClick={() => setSelectedLedger(null)}>Close</Button>
            </div>
          </div>
        </div>
      )}

      {/* Adjust Ledger Modal */}
      {showAdjustModal && (
        <div className="fixed inset-0 z-50 bg-background/80 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-card border border-border rounded-3xl p-6 max-w-md w-full space-y-4 shadow-2xl text-left">
            <h3 className="font-extrabold text-sm text-foreground">Adjust User Ledger Balance</h3>

            <form onSubmit={handleSubmitAdjustment} className="space-y-3 text-xs">
              <div className="relative">
                <label className="font-semibold block mb-1">User Email *</label>
                <input
                  type="email"
                  required
                  value={targetUserEmail}
                  onChange={(e) => {
                    const val = e.target.value;
                    setTargetUserEmail(val);
                    if (val.trim()) {
                      const matches = (users || []).filter(u =>
                        (u.email || '').toLowerCase().includes(val.toLowerCase()) ||
                        (u.displayName || '').toLowerCase().includes(val.toLowerCase())
                      ).slice(0, 6);
                      setEmailSuggestions(matches);
                      setShowEmailSuggestions(matches.length > 0);
                    } else {
                      setShowEmailSuggestions(false);
                    }
                  }}
                  onFocus={() => {
                    if (targetUserEmail.trim()) {
                      const matches = (users || []).filter(u =>
                        (u.email || '').toLowerCase().includes(targetUserEmail.toLowerCase()) ||
                        (u.displayName || '').toLowerCase().includes(targetUserEmail.toLowerCase())
                      ).slice(0, 6);
                      setEmailSuggestions(matches);
                      setShowEmailSuggestions(matches.length > 0);
                    }
                  }}
                  onBlur={() => setTimeout(() => setShowEmailSuggestions(false), 200)}
                  placeholder="Start typing email or name..."
                  className="w-full bg-muted/20 border border-border/60 rounded-xl px-3 py-2 text-foreground focus:outline-none"
                />

                {showEmailSuggestions && emailSuggestions.length > 0 && (
                  <div className="absolute left-0 right-0 top-full mt-1 bg-card border border-border rounded-2xl shadow-2xl z-50 max-h-48 overflow-y-auto divide-y divide-border/30">
                    {emailSuggestions.map((u) => (
                      <button
                        key={u.id || u.email}
                        type="button"
                        onMouseDown={() => {
                          setTargetUserEmail(u.email);
                          setTargetUserName(u.displayName || u.email.split('@')[0]);
                          setTargetUserId(u.id || u.email);
                          setShowEmailSuggestions(false);
                        }}
                        className="w-full text-left p-2.5 hover:bg-muted/30 transition-colors flex flex-col"
                      >
                        <span className="font-bold text-xs text-foreground">{u.displayName || u.email.split('@')[0]}</span>
                        <span className="text-[10px] text-muted-foreground">{u.email}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <div>
                <label className="font-semibold block mb-1">Adjustment Type</label>
                <select
                  value={adjustmentType}
                  onChange={(e) => setAdjustmentType(e.target.value as any)}
                  className="w-full bg-muted/20 border border-border/60 rounded-xl px-3 py-2 text-foreground focus:outline-none font-semibold"
                >
                  <option value="advance_credit">Add Advance Deposit (+Credit)</option>
                  <option value="due_recorded">Record Outstanding Due (-Fee)</option>
                  <option value="adjustment">Direct Adjustment</option>
                </select>
              </div>

              <div>
                <label className="font-semibold block mb-1">Amount (PKR) *</label>
                <input
                  type="number"
                  required
                  min="1"
                  value={amount || ''}
                  onChange={(e) => setAmount(Number(e.target.value))}
                  placeholder="1000"
                  className="w-full bg-muted/20 border border-border/60 rounded-xl px-3 py-2 text-foreground focus:outline-none font-mono font-bold"
                />
              </div>

              <div>
                <label className="font-semibold block mb-1">Description / Reference Reason</label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Reason for advance deposit or manual due recording..."
                  rows={2}
                  className="w-full bg-muted/20 border border-border/60 rounded-xl p-3 text-foreground focus:outline-none"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <Button variant="ghost" size="sm" onClick={() => setShowAdjustModal(false)}>Cancel</Button>
                <Button variant="primary" size="sm" type="submit" loading={isSubmitting}>Save Adjustment</Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
