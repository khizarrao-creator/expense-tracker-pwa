import React, { useEffect, useState } from 'react';
import {
  getEvents,
  addEvent,
  updateEvent,
  deleteEvent,
  getEventDetails,
  linkItemsToEvent,
  getTransactions,
  getLoans
} from '../db/queries';
import type { Event, Transaction, Loan } from '../db/queries';
import {
  Calendar,
  Plus,
  ArrowLeft,
  Pencil,
  Trash2,
  DollarSign,
  ChevronRight,
  Link as LinkIcon,
  ArrowUpRight,
  ArrowDownLeft,
  Handshake,
  Receipt,
  CheckCircle2,
  TrendingDown,
  TrendingUp,
  Search,
  X,
  ArrowRightLeft,
  Repeat
} from 'lucide-react';
import { toast } from 'sonner';
import { v4 as uuidv4 } from 'uuid';

export default function Events() {
  const [events, setEvents] = useState<any[]>([]);
  const [selectedEvent, setSelectedEvent] = useState<any | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showLinkModal, setShowLinkModal] = useState(false);
  const [editingEvent, setEditingEvent] = useState<Event | null>(null);

  // Form states
  const [newName, setNewName] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [newDate, setNewDate] = useState(new Date().toISOString().split('T')[0]);
  const [newTotalCost, setNewTotalCost] = useState('0');

  // Linking states
  const [allTransactions, setAllTransactions] = useState<Transaction[]>([]);
  const [allLoans, setAllLoans] = useState<Loan[]>([]);
  const [selectedTransactionIds, setSelectedTransactionIds] = useState<Set<string>>(new Set());
  const [selectedLoanIds, setSelectedLoanIds] = useState<Set<string>>(new Set());
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    const data = await getEvents();
    setEvents(data);
  };

  const resetForm = () => {
    setNewName('');
    setNewDesc('');
    setNewDate(new Date().toISOString().split('T')[0]);
    setNewTotalCost('0');
    setEditingEvent(null);
    setShowAddModal(false);
  };

  const handleAddEvent = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (editingEvent) {
        await updateEvent(editingEvent.id, {
          name: newName,
          description: newDesc,
          date: newDate,
          total_cost: parseFloat(newTotalCost) || 0
        });
        toast.success('Event updated');

        if (selectedEvent) {
          handleViewDetails(selectedEvent);
        }
      } else {
        await addEvent(newName, newDesc, newDate, parseFloat(newTotalCost) || 0);
        toast.success('Event created');
      }
      resetForm();
      loadData();
    } catch (error: any) {
      console.error('Failed to save event:', error);
      toast.error(`Failed to save event: ${error.message || 'Unknown error'}`);
    }
  };

  const handleViewDetails = async (event: any) => {
    try {
      const details = await getEventDetails(event.id);
      setSelectedEvent(details);
    } catch (error) {
      toast.error('Failed to load event details');
    }
  };

  const handleDeleteEvent = async (id: string) => {
    if (window.confirm('Are you sure you want to delete this event? All linked items will be unlinked (but not deleted).')) {
      await deleteEvent(id);
      toast.success('Event deleted');
      setSelectedEvent(null);
      loadData();
    }
  };

  const openLinkModal = async () => {
    const [txs, lns] = await Promise.all([getTransactions(200), getLoans()]);
    setAllTransactions(txs.filter(t => !t.event_id || t.event_id === selectedEvent?.id));
    setAllLoans(lns.filter(l => !l.event_id || l.event_id === selectedEvent?.id));

    setSelectedTransactionIds(new Set((selectedEvent?.transactions || []).map((t: any) => t.id)));
    setSelectedLoanIds(new Set((selectedEvent?.loans || []).map((l: any) => l.id)));
    setSearchQuery('');
    setShowLinkModal(true);
  };

  const handleToggleLink = (id: string, type: 'transaction' | 'loan') => {
    if (type === 'transaction') {
      const next = new Set(selectedTransactionIds);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      setSelectedTransactionIds(next);
    } else {
      const next = new Set(selectedLoanIds);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      setSelectedLoanIds(next);
    }
  };

  const handleSaveLinks = async () => {
    try {
      await linkItemsToEvent(selectedEvent.id, Array.from(selectedTransactionIds), Array.from(selectedLoanIds));
      toast.success('Links updated');
      setShowLinkModal(false);
      handleViewDetails(selectedEvent);
      loadData();
    } catch (error) {
      toast.error('Failed to update links');
    }
  };

  const handleUnlinkItem = async (id: string, type: 'transaction' | 'loan') => {
    try {
      const currentTxIds = (selectedEvent.transactions || []).map((t: any) => t.id);
      const currentLnIds = (selectedEvent.loans || []).map((l: any) => l.id);

      if (type === 'transaction') {
        const next = currentTxIds.filter((txId: string) => txId !== id);
        await linkItemsToEvent(selectedEvent.id, next, currentLnIds);
      } else {
        const next = currentLnIds.filter((lnId: string) => lnId !== id);
        await linkItemsToEvent(selectedEvent.id, currentTxIds, next);
      }
      handleViewDetails(selectedEvent);
      loadData();
    } catch (error) {
      toast.error('Failed to unlink item');
    }
  };

  const formatAmount = (amount: number) => {
    return new Intl.NumberFormat('en-PK', {
      style: 'currency',
      currency: 'PKR',
      minimumFractionDigits: 2
    }).format(amount);
  };

  // Derived stats for Detail View
  let totalTransactions = 0;
  let totalLoans = 0;
  let totalVolume = 0;
  let summary: Record<string, number> = {};

  if (selectedEvent) {
    totalVolume =
      (selectedEvent.transactions || []).reduce((acc: number, t: any) => {
        if (t.type === 'income') return acc;
        return acc + (t.amount || 0);
      }, 0) +
      (selectedEvent.loans || []).reduce((acc: number, l: any) => {
        if (l.direction === 'taken') return acc;
        return acc + (l.amount || 0);
      }, 0);

    totalTransactions = (selectedEvent.transactions || []).reduce((acc: number, t: any) => {
      if (t.type === 'expense') return acc - (t.amount || 0);
      if (t.type === 'income') return acc + (t.amount || 0);
      return acc; // Transfers are net zero
    }, 0);

    totalLoans = (selectedEvent.loans || []).reduce((acc: number, l: any) => acc + (l.direction === 'given' ? -(l.amount || 0) : (l.amount || 0)), 0);

    (selectedEvent.loans || []).forEach((l: any) => {
      const key = l.direction === 'given' ? `Loan Given: ${l.party_name}` : `Loan Taken: ${l.party_name}`;
      summary[key] = (summary[key] || 0) + l.amount;
    });
  }

  // GROUPING LOGIC
  const linkedExpenses = selectedEvent?.transactions?.filter((t: any) => t.type === 'expense') || [];
  const linkedIncomes = selectedEvent?.transactions?.filter((t: any) => t.type === 'income') || [];
  const linkedTransfers = selectedEvent?.transactions?.filter((t: any) => t.type === 'transfer') || [];
  const linkedLoansGiven = selectedEvent?.loans?.filter((l: any) => l.direction === 'given') || [];
  const linkedLoansTaken = selectedEvent?.loans?.filter((l: any) => l.direction === 'taken') || [];

  const detectedRepayments = linkedIncomes.filter((t: any) =>
    t.description?.toLowerCase().includes('repayment') ||
    t.description?.toLowerCase().includes('recovered') ||
    t.description?.toLowerCase().includes('return')
  );

  const detectedLoansAsTransactions = linkedExpenses.filter((t: any) =>
    t.description?.toLowerCase().includes('loan given')
  );

  const realRepayments = selectedEvent?.repayments || [];

  const totalLoanInEvent = (linkedLoansGiven || []).reduce((acc: number, l: any) => acc + (l.amount || 0), 0) +
    (detectedLoansAsTransactions || []).reduce((acc: number, t: any) => acc + (t.amount || 0), 0);

  const totalLossInEvent = (linkedLoansGiven || []).reduce((acc: number, l: any) => acc + (l.loss_amount || 0), 0);
  
  const totalRecoveredInEvent = (realRepayments || []).reduce((acc: number, r: any) => acc + (r.amount || 0), 0) +
    (detectedRepayments || []).reduce((acc: number, t: any) => acc + (t.amount || 0), 0);

  const remainingLoanInEvent = totalLoanInEvent - totalRecoveredInEvent - totalLossInEvent;

  // Search filtering for modal
  const filteredTransactions = (allTransactions || []).filter(t =>
    (t.description || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
    (t.category || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
    (t.amount || 0).toString().includes(searchQuery)
  );

  const filteredLoans = (allLoans || []).filter(l =>
    (l.party_name || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
    (l.description || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
    (l.amount || 0).toString().includes(searchQuery)
  );

  return (
    <div className="space-y-6">
      {selectedEvent ? (
        <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-300">
          <div className="flex items-center justify-between">
            <button
              onClick={() => setSelectedEvent(null)}
              className="flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors"
            >
              <ArrowLeft size={20} />
              <span>Back to Events</span>
            </button>
            <div className="flex gap-2">
              <button
                onClick={() => {
                  setEditingEvent(selectedEvent);
                  setNewName(selectedEvent.name);
                  setNewDesc(selectedEvent.description || '');
                  setNewDate(selectedEvent.date);
                  setNewTotalCost(selectedEvent.total_cost?.toString() || '0');
                  setShowAddModal(true);
                }}
                className="p-2 bg-muted rounded-xl hover:bg-muted/80 transition-colors"
              >
                <Pencil size={20} />
              </button>
              <button
                onClick={() => handleDeleteEvent(selectedEvent.id)}
                className="p-2 bg-destructive/10 text-destructive rounded-xl hover:bg-destructive/20 transition-colors"
              >
                <Trash2 size={20} />
              </button>
            </div>
          </div>

          <div className="bg-card p-6 rounded-3xl border border-border">
            <div className="flex items-center gap-4 mb-4">
              <div className="p-3 bg-primary/10 text-primary rounded-2xl">
                <Calendar size={24} />
              </div>
              <div>
                <h1 className="text-2xl font-bold">{selectedEvent.name}</h1>
                <p className="text-muted-foreground">{new Date(selectedEvent.date).toLocaleDateString(undefined, { dateStyle: 'full' })}</p>
              </div>
            </div>
            {selectedEvent.description && (
              <p className="text-muted-foreground mt-4 p-4 bg-muted/50 rounded-2xl border border-border/50">
                {selectedEvent.description}
              </p>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-6">
              <div className="bg-primary/5 p-4 rounded-2xl border border-primary/10">
                <p className="text-xs font-semibold text-primary/70 uppercase tracking-wider mb-1">Total Impact</p>
                <p className={`text-2xl font-bold ${(totalTransactions + totalLoans) >= 0 ? 'text-emerald-500' : 'text-rose-500'}`}>
                  {formatAmount(Math.abs(totalTransactions + totalLoans))}
                  <span className="text-sm ml-1 font-normal opacity-70">
                    {(totalTransactions + totalLoans) >= 0 ? 'Net Inflow' : 'Net Outflow'}
                  </span>
                </p>
              </div>
              <div className="bg-amber-500/5 p-4 rounded-2xl border border-amber-500/10">
                <p className="text-xs font-semibold text-amber-500/70 uppercase tracking-wider mb-1">Items Linked</p>
                <p className="text-2xl font-bold text-amber-500">
                  {(selectedEvent.transactions?.length || 0) + (selectedEvent.loans?.length || 0)}
                  <span className="text-sm ml-1 font-normal opacity-70">entries</span>
                </p>
              </div>
              {selectedEvent.total_cost > 0 && (
                <div className="bg-indigo-500/5 p-4 rounded-2xl border border-indigo-500/10 md:col-span-2">
                  <div className="flex justify-between items-end mb-2">
                    <div>
                      <p className="text-xs font-semibold text-indigo-500/70 uppercase tracking-wider mb-1">Budget Progress</p>
                      <p className="text-2xl font-bold text-indigo-500">
                        {formatAmount(totalVolume)}
                        <span className="text-sm ml-1 font-normal opacity-70">of {formatAmount(selectedEvent.total_cost)}</span>
                      </p>
                    </div>
                    <p className="text-sm font-bold text-indigo-500">
                      {Math.min(100, Math.round((totalVolume / selectedEvent.total_cost) * 100))}%
                    </p>
                  </div>
                  <div className="h-2 bg-indigo-500/10 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-indigo-500 transition-all duration-500"
                      style={{ width: `${Math.min(100, (totalVolume / selectedEvent.total_cost) * 100)}%` }}
                    />
                  </div>
                </div>
              )}
            </div>
          </div>

          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-bold tracking-tight">Event Ledger</h2>
              <button
                onClick={openLinkModal}
                className="flex items-center gap-2 text-sm font-semibold text-primary bg-primary/10 px-4 py-2 rounded-xl hover:bg-primary/20 transition-all"
              >
                <LinkIcon size={16} />
                Manage Entries
              </button>
            </div>

            <div className="space-y-8">
              {(linkedExpenses.length > 0 || linkedLoansGiven.length > 0) && (
                <div className="space-y-4">
                  <div className="flex items-center gap-2 px-1">
                    <TrendingDown className="text-rose-500" size={20} />
                    <h3 className="text-sm font-bold text-muted-foreground uppercase tracking-widest">Spending & Loans Given</h3>
                  </div>
                  <div className="grid gap-3">
                    {linkedExpenses.map((t: any) => (
                      <div key={t.id} className="bg-card p-4 rounded-2xl border border-border flex items-center justify-between group hover:border-rose-500/30 transition-all">
                        <div className="flex items-center gap-4">
                          <div className="p-2.5 rounded-xl bg-rose-500/10 text-rose-500">
                            <ArrowUpRight size={20} />
                          </div>
                          <div>
                            <p className="font-semibold text-sm sm:text-base">{t.description || t.category}</p>
                            <p className="text-xs text-muted-foreground">{t.account_name} • {new Date(t.date).toLocaleDateString()}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-4">
                          <span className="font-bold text-rose-500 text-sm sm:text-base">
                            -{formatAmount(t.amount)}
                          </span>
                          <button
                            onClick={() => handleUnlinkItem(t.id, 'transaction')}
                            className="p-2 text-muted-foreground hover:text-destructive opacity-0 group-hover:opacity-100 transition-all"
                          >
                            <Plus size={18} className="rotate-45" />
                          </button>
                        </div>
                      </div>
                    ))}
                    {linkedLoansGiven.map((l: any) => (
                      <div key={l.id} className="bg-card p-4 rounded-2xl border border-border flex flex-col group border-l-4 border-l-amber-500 hover:border-amber-500/30 transition-all">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-4">
                            <div className="p-2.5 rounded-xl bg-amber-500/10 text-amber-500">
                              <Handshake size={20} />
                            </div>
                            <div>
                              <p className="font-semibold text-sm sm:text-base">Loan to {l.party_name}</p>
                              <p className="text-xs text-muted-foreground">{l.description || 'Personal'} • {new Date(l.date).toLocaleDateString()}</p>
                            </div>
                          </div>
                          <div className="flex items-center gap-4">
                            <span className="font-bold text-rose-500 text-sm sm:text-base">
                              -{formatAmount(l.amount)}
                            </span>
                            <button
                              onClick={() => handleUnlinkItem(l.id, 'loan')}
                              className="p-2 text-muted-foreground hover:text-destructive opacity-0 group-hover:opacity-100 transition-all"
                            >
                              <Plus size={18} className="rotate-45" />
                            </button>
                          </div>
                        </div>
                        {l.status === 'loss' && (
                          <div className="mt-3 pt-3 border-t border-border/50 flex items-center justify-between">
                            <div className="flex items-center gap-2 text-rose-500 text-[10px] font-black uppercase tracking-wider">
                              <TrendingDown size={12} />
                              Loan Loss Marked
                            </div>
                            <span className="text-xs font-bold text-rose-500">-{formatAmount(l.loss_amount)}</span>
                          </div>
                        )}
                        {l.loss_remarks && (
                          <p className="mt-2 text-[10px] text-muted-foreground italic bg-rose-500/5 p-2 rounded-lg border border-rose-500/10">
                            "{l.loss_remarks}"
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {linkedTransfers.length > 0 && (
                <div className="space-y-4">
                  <div className="flex items-center gap-2 px-1">
                    <ArrowRightLeft className="text-indigo-500" size={20} />
                    <h3 className="text-sm font-bold text-muted-foreground uppercase tracking-widest">Internal Transfers</h3>
                  </div>
                  <div className="grid gap-3">
                    {linkedTransfers.map((t: any) => (
                      <div key={t.id} className="bg-card p-4 rounded-2xl border border-border flex items-center justify-between group hover:border-indigo-500/30 transition-all">
                        <div className="flex items-center gap-4">
                          <div className="p-2.5 rounded-xl bg-indigo-500/10 text-indigo-500">
                            <ArrowRightLeft size={20} />
                          </div>
                          <div>
                            <p className="font-semibold text-sm sm:text-base">{t.description || 'Account Transfer'}</p>
                            <p className="text-xs text-muted-foreground flex items-center gap-1">
                              <span className="font-medium text-foreground">{t.account_name}</span>
                              <ArrowRightLeft size={10} className="mx-1" />
                              <span className="font-medium text-foreground">{t.to_account_name}</span>
                              <span className="mx-1">•</span>
                              {new Date(t.date).toLocaleDateString()}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-4">
                          <span className="font-bold text-indigo-500 text-sm sm:text-base">
                            {formatAmount(t.amount)}
                          </span>
                          <button
                            onClick={() => handleUnlinkItem(t.id, 'transaction')}
                            className="p-2 text-muted-foreground hover:text-destructive opacity-0 group-hover:opacity-100 transition-all"
                          >
                            <Plus size={18} className="rotate-45" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {(linkedIncomes.length > 0 || linkedLoansTaken.length > 0 || realRepayments.length > 0) && (
                <div className="space-y-4">
                  <div className="flex items-center gap-2 px-1">
                    <TrendingUp className="text-emerald-500" size={20} />
                    <h3 className="text-sm font-bold text-muted-foreground uppercase tracking-widest">Funding & Recoveries</h3>
                  </div>
                  <div className="grid gap-3">
                    {realRepayments.map((r: any) => (
                      <div key={r.id} className="bg-emerald-500/5 p-4 rounded-2xl border border-emerald-500/20 flex items-center justify-between group">
                        <div className="flex items-center gap-4">
                          <div className="p-2.5 rounded-xl bg-emerald-500/10 text-emerald-500">
                            <Receipt size={20} />
                          </div>
                          <div>
                            <p className="font-semibold text-sm sm:text-base">Recovered from {r.party_name}</p>
                            <p className="text-xs text-muted-foreground">{r.loan_desc} • {r.account_name}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-4">
                          <span className="font-bold text-emerald-500 text-sm sm:text-base">
                            +{formatAmount(r.amount)}
                          </span>
                          <div className="p-2 text-emerald-500">
                            <CheckCircle2 size={18} />
                          </div>
                        </div>
                      </div>
                    ))}
                    {linkedIncomes.map((t: any) => (
                      <div key={t.id} className={`p-4 rounded-2xl border flex items-center justify-between group transition-all ${detectedRepayments.some((dr: any) => dr.id === t.id)
                        ? 'bg-emerald-500/5 border-emerald-500/20'
                        : 'bg-card border-border hover:border-emerald-500/30'
                        }`}>
                        <div className="flex items-center gap-4">
                          <div className="p-2.5 rounded-xl bg-emerald-500/10 text-emerald-500">
                            <ArrowDownLeft size={20} />
                          </div>
                          <div>
                            <p className="font-semibold text-sm sm:text-base">{t.description || t.category}</p>
                            <p className="text-xs text-muted-foreground">{t.account_name} • {new Date(t.date).toLocaleDateString()}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-4">
                          <span className="font-bold text-emerald-500 text-sm sm:text-base">
                            +{formatAmount(t.amount)}
                          </span>
                          <button
                            onClick={() => handleUnlinkItem(t.id, 'transaction')}
                            className="p-2 text-muted-foreground hover:text-destructive opacity-0 group-hover:opacity-100 transition-all"
                          >
                            <Plus size={18} className="rotate-45" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>

                  {totalLoanInEvent > 0 && (
                    <div className="bg-indigo-500/10 p-5 rounded-3xl border border-indigo-500/20 shadow-sm mt-6 overflow-hidden relative group">
                      <div className="absolute top-0 right-0 p-4 opacity-5 group-hover:opacity-10 transition-opacity">
                        <Handshake size={80} />
                      </div>
                      <div className="relative z-10 flex flex-wrap gap-6 justify-between items-center">
                        <div className="space-y-1">
                          <p className="text-[10px] uppercase tracking-[0.2em] font-black text-indigo-500/60">Total Loaned in Event</p>
                          <p className="text-2xl font-black text-indigo-600">{formatAmount(totalLoanInEvent)}</p>
                        </div>
                        <div className="space-y-1 text-right">
                          <p className="text-[10px] uppercase tracking-[0.2em] font-black text-indigo-500/60">Remaining Loan Balance</p>
                          <p className={`text-2xl font-black ${remainingLoanInEvent === 0 ? 'text-emerald-500' : 'text-amber-500'}`}>
                            {formatAmount(remainingLoanInEvent)}
                          </p>
                        </div>
                      </div>
                      <div className="mt-4 h-1.5 bg-indigo-500/10 rounded-full overflow-hidden flex">
                        <div
                          className="h-full bg-indigo-500 transition-all duration-1000 ease-out"
                          style={{ width: `${Math.min(100, (totalRecoveredInEvent / totalLoanInEvent) * 100)}%` }}
                        />
                        <div
                          className="h-full bg-rose-500 opacity-60 transition-all duration-1000 ease-out"
                          style={{ width: `${Math.min(100, (totalLossInEvent / totalLoanInEvent) * 100)}%` }}
                        />
                      </div>
                      {remainingLoanInEvent === 0 && (
                        <div className="mt-3 flex items-center gap-2 text-emerald-500 font-bold text-xs uppercase tracking-widest justify-center">
                          <CheckCircle2 size={14} />
                          {totalLossInEvent > 0 ? 'Event Loans Settled (with loss)' : 'All Event Loans Fully Recovered'}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

              {selectedEvent.transactions?.length === 0 && selectedEvent.loans?.length === 0 && (
                <div className="py-20 text-center border-2 border-dashed border-border rounded-[2rem] bg-muted/30">
                  <div className="bg-muted w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4 border border-border">
                    <LinkIcon size={32} className="text-muted-foreground" />
                  </div>
                  <h3 className="text-lg font-bold">No entries linked</h3>
                  <p className="text-muted-foreground text-sm max-w-xs mx-auto mt-2">
                    Start by linking your expenses and loans to see the breakdown.
                  </p>
                  <button onClick={openLinkModal} className="mt-6 bg-primary text-primary-foreground px-6 py-3 rounded-2xl font-bold shadow-lg hover:scale-105 transition-all">Link entries now</button>
                </div>
              )}
            </div>
          </div>

          {Object.keys(summary).length > 0 && (
            <div className="bg-card p-6 rounded-3xl border border-border shadow-sm">
              <h3 className="font-bold mb-4 text-lg">Event Breakdown</h3>
              <div className="space-y-4">
                {Object.entries(summary).map(([name, amount]) => (
                  <div key={name} className="flex justify-between items-center text-sm border-b border-border/50 pb-3 last:border-0 last:pb-0">
                    <span className="text-muted-foreground font-medium">{name}</span>
                    <span className="font-bold">{formatAmount(amount)}</span>
                  </div>
                ))}
                <div className="pt-4 border-t-2 border-border flex justify-between items-center">
                  <span className="font-black text-base">Participants Total</span>
                  <span className="font-black text-xl text-primary">{formatAmount(Object.values(summary).reduce((a, b) => a + b, 0))}</span>
                </div>
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-black tracking-tight">Event Tracking</h1>
              <p className="text-sm text-muted-foreground mt-1">Group related expenses and loans into events</p>
            </div>
            <button
              onClick={() => setShowAddModal(true)}
              className="bg-primary text-primary-foreground p-4 rounded-2xl shadow-xl shadow-primary/20 hover:scale-105 active:scale-95 transition-all flex items-center gap-2"
            >
              <Plus size={24} />
              <span className="hidden sm:inline font-bold">New Event</span>
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {events.map((event) => (
              <div
                key={event.id}
                onClick={() => handleViewDetails(event)}
                className="bg-card p-6 rounded-3xl shadow-sm border border-border group relative transition-all hover:border-primary/50 hover:shadow-xl hover:shadow-primary/5 cursor-pointer overflow-hidden"
              >
                <div className="absolute top-0 left-0 w-1 h-full bg-primary opacity-0 group-hover:opacity-100 transition-opacity" />
                <div className="flex items-center gap-4 mb-4">
                  <div className="p-3 rounded-2xl bg-primary/10 text-primary group-hover:bg-primary group-hover:text-primary-foreground transition-all duration-300">
                    <Calendar size={24} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h2 className="font-bold text-lg truncate group-hover:text-primary transition-colors">{event.name}</h2>
                    <p className="text-xs text-muted-foreground font-medium">{new Date(event.date).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}</p>
                  </div>
                  <ChevronRight size={20} className="text-muted-foreground group-hover:text-primary group-hover:translate-x-1 transition-all" />
                </div>

                {event.description && (
                  <p className="text-sm text-muted-foreground line-clamp-2 mb-4 italic">
                    "{event.description}"
                  </p>
                )}

                {event.total_cost > 0 && (
                  <div className="mb-4 bg-muted/30 p-3 rounded-2xl border border-border/50">
                    <div className="flex justify-between text-[10px] mb-2 font-black uppercase tracking-widest">
                      <span className="text-muted-foreground">Budget Progress</span>
                      <span className="text-primary">{Math.min(100, Math.round((event.total_linked_volume / event.total_cost) * 100))}%</span>
                    </div>
                    <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                      <div
                        className="h-full bg-primary rounded-full transition-all duration-1000"
                        style={{ width: `${Math.min(100, (event.total_linked_volume / event.total_cost) * 100)}%` }}
                      />
                    </div>
                  </div>
                )}

                <div className="pt-4 border-t border-border flex items-center justify-between text-[10px] font-black uppercase tracking-widest text-muted-foreground group-hover:text-primary transition-colors">
                  <div className="flex items-center gap-1">
                    <LinkIcon size={12} />
                    <span>{event.item_count} Linked Items</span>
                  </div>
                  <span>View Ledger</span>
                </div>
              </div>
            ))}

            {events.length === 0 && (
              <div className="col-span-full py-20 text-center border-2 border-dashed border-border rounded-[2.5rem] bg-muted/10">
                <div className="bg-muted w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-4 border border-border">
                  <Calendar size={40} className="text-muted-foreground" />
                </div>
                <h3 className="text-xl font-bold">No events created</h3>
                <p className="text-muted-foreground text-sm max-w-xs mx-auto mt-2">
                  Create events to track group trips, dinner parties, or shared costs.
                </p>
                <button
                  onClick={() => setShowAddModal(true)}
                  className="mt-8 bg-primary text-primary-foreground px-8 py-4 rounded-2xl font-bold shadow-lg shadow-primary/20 hover:scale-105 transition-all"
                >
                  Create your first event
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {showAddModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-md z-50 flex items-center justify-center p-4">
          <div className="bg-card w-full max-w-md rounded-[2.5rem] shadow-2xl p-8 border border-border animate-in fade-in zoom-in duration-300">
            <div className="flex items-center justify-between mb-8">
              <div>
                <h2 className="text-2xl font-black tracking-tight">{editingEvent ? 'Edit Event' : 'New Event'}</h2>
                <p className="text-xs text-muted-foreground font-medium mt-1">Fill in the details below</p>
              </div>
              <button
                onClick={resetForm}
                className="p-3 hover:bg-muted rounded-2xl transition-all hover:rotate-90 duration-300"
              >
                <Plus size={24} className="rotate-45" />
              </button>
            </div>

            <form onSubmit={handleAddEvent} className="space-y-6">
              <div className="space-y-2">
                <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground ml-1">Event Name</label>
                <input
                  type="text"
                  required
                  placeholder="e.g., AG Foods Trip"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  className="w-full bg-muted/50 border-2 border-transparent rounded-[1.25rem] p-4 focus:border-primary focus:bg-card transition-all font-bold"
                />
              </div>

              <div className="space-y-2">
                <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground ml-1">Description (Optional)</label>
                <textarea
                  placeholder="What is this for?"
                  value={newDesc}
                  onChange={(e) => setNewDesc(e.target.value)}
                  className="w-full bg-muted/50 border-2 border-transparent rounded-[1.25rem] p-4 focus:border-primary focus:bg-card transition-all font-medium resize-none h-24"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground ml-1">Date</label>
                  <input
                    type="date"
                    required
                    value={newDate}
                    onChange={(e) => setNewDate(e.target.value)}
                    className="w-full bg-muted/50 border-2 border-transparent rounded-[1.25rem] p-4 focus:border-primary focus:bg-card transition-all font-bold"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground ml-1">Budget</label>
                  <div className="relative">
                    <input
                      type="number"
                      step="0.01"
                      placeholder="0.00"
                      value={newTotalCost}
                      onChange={(e) => setNewTotalCost(e.target.value)}
                      className="w-full bg-muted/50 border-2 border-transparent rounded-[1.25rem] p-4 pl-10 focus:border-primary focus:bg-card transition-all font-bold"
                    />
                    <div className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground">
                      <DollarSign size={16} />
                    </div>
                  </div>
                </div>
              </div>

              <div className="pt-4 flex gap-4">
                <button
                  type="button"
                  onClick={resetForm}
                  className="flex-1 bg-muted hover:bg-muted/80 font-bold py-4 rounded-2xl transition-all"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 bg-primary text-primary-foreground font-black py-4 rounded-2xl shadow-xl shadow-primary/20 hover:scale-105 active:scale-95 transition-all"
                >
                  {editingEvent ? 'Update' : 'Create'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showLinkModal && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-lg z-50 flex items-center justify-center p-4">
          <div className="bg-card w-full max-w-2xl max-h-[90vh] rounded-[3rem] shadow-2xl overflow-hidden flex flex-col border border-border animate-in slide-in-from-bottom-10 duration-500">
            <div className="p-8 border-b border-border bg-muted/20">
              <div className="flex items-center justify-between mb-6">
                <div>
                  <h2 className="text-2xl font-black tracking-tight">Link Entries</h2>
                  <p className="text-xs text-muted-foreground font-medium mt-1">Search and select items to link to {selectedEvent.name}</p>
                </div>
                <button
                  onClick={() => setShowLinkModal(false)}
                  className="p-3 hover:bg-card rounded-2xl transition-all"
                >
                  <Plus size={24} className="rotate-45" />
                </button>
              </div>

              <div className="relative">
                <input
                  type="text"
                  placeholder="Search by description, category or amount..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full bg-card border-2 border-border rounded-2xl p-4 pl-12 focus:border-primary transition-all font-bold"
                />
                <Search size={20} className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground" />
                {searchQuery && (
                  <button
                    onClick={() => setSearchQuery('')}
                    className="absolute right-4 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  >
                    <X size={18} />
                  </button>
                )}
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-8 space-y-10">
              <section>
                <div className="flex items-center justify-between mb-6 px-1">
                  <h3 className="text-xs font-black text-muted-foreground uppercase tracking-[0.2em]">Transactions</h3>
                  <span className="text-[10px] font-bold px-2 py-1 bg-primary/10 text-primary rounded-lg">{filteredTransactions.length} found</span>
                </div>
                <div className="grid grid-cols-1 gap-4">
                  {filteredTransactions.map((t: any) => (
                    <div
                      key={t.id}
                      onClick={() => handleToggleLink(t.id, 'transaction')}
                      className={`p-5 rounded-[2rem] border-2 transition-all cursor-pointer flex items-center justify-between ${selectedTransactionIds.has(t.id)
                        ? 'border-primary bg-primary/5 shadow-inner'
                        : 'border-border bg-card hover:border-primary/40'
                        }`}
                    >
                      <div className="flex items-center gap-5">
                        <div className={`p-3 rounded-2xl ${t.type === 'expense' ? 'bg-rose-500/10 text-rose-500' : t.type === 'income' ? 'bg-emerald-500/10 text-emerald-500' : 'bg-indigo-500/10 text-indigo-500'}`}>
                          {t.type === 'expense' ? <ArrowUpRight size={22} /> : t.type === 'income' ? <ArrowDownLeft size={22} /> : <ArrowRightLeft size={22} />}
                        </div>
                        <div>
                          <p className="font-bold text-base">{t.description || t.category || (t.type === 'transfer' ? 'Transfer' : '')}</p>
                          <p className="text-xs text-muted-foreground font-medium">
                            {t.type === 'transfer' ? `${t.account_name} → ${t.to_account_name}` : t.account_name} • {new Date(t.date).toLocaleDateString()}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-4">
                        <span className={`font-black text-base ${t.type === 'expense' ? 'text-rose-500' : t.type === 'income' ? 'text-emerald-500' : 'text-indigo-500'}`}>
                          {t.type === 'expense' ? '-' : t.type === 'income' ? '+' : ''}{formatAmount(t.amount)}
                        </span>
                        <div className={`w-8 h-8 rounded-2xl border-2 flex items-center justify-center transition-all duration-300 ${selectedTransactionIds.has(t.id) ? 'bg-primary border-primary scale-110 shadow-lg shadow-primary/20' : 'border-muted-foreground/20'
                          }`}>
                          {selectedTransactionIds.has(t.id) && <Plus size={18} className="text-primary-foreground" />}
                        </div>
                      </div>
                    </div>
                  ))}
                  {filteredTransactions.length === 0 && (
                    <div className="text-center py-10 bg-muted/20 rounded-3xl border border-dashed border-border">
                      <p className="text-sm text-muted-foreground font-medium">No transactions found</p>
                    </div>
                  )}
                </div>
              </section>

              <section>
                <div className="flex items-center justify-between mb-6 px-1">
                  <h3 className="text-xs font-black text-muted-foreground uppercase tracking-[0.2em]">Loans</h3>
                  <span className="text-[10px] font-bold px-2 py-1 bg-primary/10 text-primary rounded-lg">{filteredLoans.length} found</span>
                </div>
                <div className="grid grid-cols-1 gap-4">
                  {filteredLoans.map(l => (
                    <div
                      key={l.id}
                      onClick={() => handleToggleLink(l.id, 'loan')}
                      className={`p-5 rounded-[2rem] border-2 transition-all cursor-pointer flex items-center justify-between ${selectedLoanIds.has(l.id)
                        ? 'border-primary bg-primary/5 shadow-inner'
                        : 'border-border bg-card hover:border-primary/40'
                        }`}
                    >
                      <div className="flex items-center gap-5">
                        <div className={`p-3 rounded-2xl ${l.direction === 'given' ? 'bg-rose-500/10 text-rose-500' : 'bg-emerald-500/10 text-emerald-500'}`}>
                          <Handshake size={22} />
                        </div>
                        <div>
                          <p className="font-bold text-base">Loan to {l.party_name}</p>
                          <p className="text-xs text-muted-foreground font-medium">{l.description || 'Personal'}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-4">
                        <span className={`font-black text-base ${l.direction === 'given' ? 'text-rose-500' : 'text-emerald-500'}`}>
                          {l.direction === 'given' ? '-' : '+'}{formatAmount(l.amount)}
                        </span>
                        <div className={`w-8 h-8 rounded-2xl border-2 flex items-center justify-center transition-all duration-300 ${selectedLoanIds.has(l.id) ? 'bg-primary border-primary scale-110 shadow-lg shadow-primary/20' : 'border-muted-foreground/20'
                          }`}>
                          {selectedLoanIds.has(l.id) && <Plus size={18} className="text-primary-foreground" />}
                        </div>
                      </div>
                    </div>
                  ))}
                  {filteredLoans.length === 0 && (
                    <div className="text-center py-10 bg-muted/20 rounded-3xl border border-dashed border-border">
                      <p className="text-sm text-muted-foreground font-medium">No loans found</p>
                    </div>
                  )}
                </div>
              </section>
            </div>

            <div className="p-8 border-t border-border bg-muted/30 flex gap-4">
              <button
                onClick={() => setShowLinkModal(false)}
                className="flex-1 bg-card hover:bg-muted font-bold py-5 rounded-[1.5rem] transition-all border border-border"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveLinks}
                className="flex-1 bg-primary text-primary-foreground font-black py-5 rounded-[1.5rem] shadow-xl shadow-primary/30 hover:scale-[1.02] active:scale-95 transition-all"
              >
                Sync {selectedTransactionIds.size + selectedLoanIds.size} Linked Items
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
