import React, { useState, useEffect } from 'react';
import {
  Plus,
  ArrowUpRight,
  ArrowDownLeft,
  Users,
  Calendar,
  Search,
  Trash2,
  CheckCircle2,
  Clock,
  AlertCircle,
  PlusCircle,
  X,
  History,
  Phone,
  Mail,
  StickyNote,
  Pencil,
  MessageCircle,
  MessageSquare,
  Send
} from 'lucide-react';
import {
  getLoans,
  getLoanParties,
  addLoan,
  addLoanParty,
  deleteLoan,
  deleteLoanParty,
  addLoanRepayment,
  getLoanRepayments,
  deleteLoanRepayment,
  getLoanSummary,
  getAccounts,
  updateLoan,
  updateLoanParty,
  markLoanAsLoss,
  getConfig,
  type Loan,
  type LoanParty,
  type LoanRepayment,
  type Account
} from '../db/queries';
import { useCurrency } from '../contexts/CurrencyContext';
import { toast } from 'sonner';
import { format } from 'date-fns';

const Loans: React.FC = () => {
  const { formatAmount } = useCurrency();
  
  // Data State
  const [loans, setLoans] = useState<Loan[]>([]);
  const [parties, setParties] = useState<LoanParty[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [summary, setSummary] = useState({ totalReceivable: 0, totalPayable: 0 });
  const [loading, setLoading] = useState(true);

  // UI State
  const [activeTab, setActiveTab] = useState<'loans' | 'parties'>('loans');
  const [filterDirection, setFilterDirection] = useState<'all' | 'given' | 'taken'>('all');
  const [filterStatus, setFilterStatus] = useState<'all' | 'open' | 'closed' | 'partial' | 'loss'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  
  // Modals
  const [isLoanModalOpen, setIsLoanModalOpen] = useState(false);
  const [isPartyModalOpen, setIsPartyModalOpen] = useState(false);
  const [isRepaymentModalOpen, setIsRepaymentModalOpen] = useState(false);
  const [isLossModalOpen, setIsLossModalOpen] = useState(false);
  const [selectedLoan, setSelectedLoan] = useState<Loan | null>(null);
  const [repayments, setRepayments] = useState<LoanRepayment[]>([]);
  const [editingParty, setEditingParty] = useState<LoanParty | null>(null);
  const [editingLoan, setEditingLoan] = useState<Loan | null>(null);
  const [isReminderModalOpen, setIsReminderModalOpen] = useState(false);
  const [reminderMessage, setReminderMessage] = useState('');

  // Loan Form State
  const [loanDirection, setLoanDirection] = useState<'given' | 'taken'>('given');
  const [loanPartyId, setLoanPartyId] = useState('');
  const [loanAmount, setLoanAmount] = useState('');
  const [loanDate, setLoanDate] = useState(new Date().toISOString().split('T')[0]);
  const [loanDueDate, setLoanDueDate] = useState('');
  const [loanDescription, setLoanDescription] = useState('');
  const [loanAccountId, setLoanAccountId] = useState('');
  const [loanCategory, setLoanCategory] = useState('Personal');

  // Party Form State
  const [partyName, setPartyName] = useState('');
  const [partyPhone, setPartyPhone] = useState('');
  const [partyEmail, setPartyEmail] = useState('');
  const [partyNotes, setPartyNotes] = useState('');

  // Repayment Form State
  const [repaymentAmount, setRepaymentAmount] = useState('');
  const [repaymentDate, setRepaymentDate] = useState(new Date().toISOString().split('T')[0]);
  const [repaymentNotes, setRepaymentNotes] = useState('');
  const [repaymentAccountId, setRepaymentAccountId] = useState('');

  // Loss Form State
  const [lossAmount, setLossAmount] = useState('');
  const [lossRemarks, setLossRemarks] = useState('');

  const loadData = async () => {
    setLoading(true);
    try {
      const direction = filterDirection === 'all' ? undefined : filterDirection;
      const status = filterStatus === 'all' ? undefined : filterStatus;
      
      const [loanList, partyList, accList, summaryData] = await Promise.all([
        getLoans({ direction, status }),
        getLoanParties(),
        getAccounts(),
        getLoanSummary()
      ]);
      
      setLoans(loanList);
      setParties(partyList);
      setAccounts(accList);
      setSummary(summaryData);
      
      if (accList.length > 0 && !loanAccountId) {
        setLoanAccountId(accList[0].id);
        setRepaymentAccountId(accList[0].id);
      }
    } catch (error) {
      toast.error('Failed to load loan data');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [filterDirection, filterStatus]);

  const handleAddParty = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!partyName) return;
    try {
      if (editingParty) {
        await updateLoanParty(editingParty.id, {
          name: partyName,
          phone: partyPhone,
          email: partyEmail,
          notes: partyNotes
        });
        toast.success('Counterparty updated');
      } else {
        await addLoanParty(partyName, partyPhone, partyEmail, partyNotes);
        toast.success('Counterparty added');
      }
      setIsPartyModalOpen(false);
      setEditingParty(null);
      setPartyName('');
      setPartyPhone('');
      setPartyEmail('');
      setPartyNotes('');
      loadData();
    } catch (error) {
      toast.error(editingParty ? 'Failed to update party' : 'Failed to add party');
    }
  };

  const handleEditParty = (party: LoanParty) => {
    setEditingParty(party);
    setPartyName(party.name);
    setPartyPhone(party.phone || '');
    setPartyEmail(party.email || '');
    setPartyNotes(party.notes || '');
    setIsPartyModalOpen(true);
  };

  const handleAddLoan = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!loanPartyId || !loanAmount || !loanDate) {
      toast.error('Please fill required fields');
      return;
    }
    try {
      if (editingLoan) {
        await updateLoan(editingLoan.id, {
          direction: loanDirection,
          party_id: loanPartyId,
          amount: parseFloat(loanAmount),
          date: loanDate,
          description: loanDescription,
          due_date: loanDueDate || null,
          category: loanCategory,
          account_id: loanAccountId || null
        });
        toast.success('Loan updated');
      } else {
        await addLoan(
          loanDirection,
          loanPartyId,
          parseFloat(loanAmount),
          loanDate,
          loanDescription,
          loanDueDate || null,
          loanCategory,
          0, // interest rate
          'none', // interest type
          loanAccountId || null
        );
        toast.success('Loan recorded');
      }
      setIsLoanModalOpen(false);
      setEditingLoan(null);
      resetLoanForm();
      loadData();
    } catch (error) {
      toast.error(editingLoan ? 'Failed to update loan' : 'Failed to record loan');
    }
  };

  const handleEditLoan = (loan: Loan) => {
    setEditingLoan(loan);
    setLoanDirection(loan.direction);
    setLoanPartyId(loan.party_id);
    setLoanAmount(loan.amount.toString());
    setLoanDate(loan.date);
    setLoanDueDate(loan.due_date || '');
    setLoanDescription(loan.description || '');
    setLoanAccountId(loan.account_id || '');
    setLoanCategory(loan.category || 'Personal');
    setIsRepaymentModalOpen(false);
    setIsLoanModalOpen(true);
  };

  const resetLoanForm = () => {
    setLoanAmount('');
    setLoanDescription('');
    setLoanDueDate('');
  };

  const handleViewRepayments = async (loan: Loan) => {
    setSelectedLoan(loan);
    try {
      const list = await getLoanRepayments(loan.id);
      setRepayments(list);
      setIsRepaymentModalOpen(true);
      setRepaymentAmount('');
    } catch (error) {
      toast.error('Failed to load repayments');
    }
  };

  const handleAddRepayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedLoan || !repaymentAmount || !repaymentDate) return;
    try {
      await addLoanRepayment(
        selectedLoan.id,
        parseFloat(repaymentAmount),
        repaymentDate,
        repaymentNotes,
        repaymentAccountId || null
      );
      toast.success('Repayment recorded');
      setRepaymentAmount('');
      setRepaymentNotes('');
      // Refresh repayments view
      const list = await getLoanRepayments(selectedLoan.id);
      setRepayments(list);
      loadData(); // Refresh main list
    } catch (error) {
      toast.error('Failed to record repayment');
    }
  };

  const handleDeleteRepayment = async (id: string) => {
    if (!selectedLoan || !confirm('Delete this repayment?')) return;
    try {
      await deleteLoanRepayment(id, selectedLoan.id);
      toast.success('Repayment deleted');
      const list = await getLoanRepayments(selectedLoan.id);
      setRepayments(list);
      loadData();
    } catch (error) {
      toast.error('Failed to delete repayment');
    }
  };

  const handleDeleteLoan = async (id: string) => {
    if (!confirm('Are you sure you want to delete this loan? This will also delete all repayment history.')) return;
    try {
      await deleteLoan(id);
      toast.success('Loan deleted');
      loadData();
    } catch (error) {
      toast.error('Failed to delete loan');
    }
  };

  const handleMarkAsLoss = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedLoan || !lossAmount || !lossRemarks) return;
    try {
      await markLoanAsLoss(selectedLoan.id, parseFloat(lossAmount), lossRemarks);
      toast.success('Loan marked as loss');
      setIsLossModalOpen(false);
      setIsRepaymentModalOpen(false);
      loadData();
    } catch (error) {
      toast.error('Failed to mark loan as loss');
    }
  };

  const openLossModal = (loan: Loan) => {
    setSelectedLoan(loan);
    setLossAmount(loan.remaining_balance?.toString() || '');
    setLossRemarks('');
    setIsLossModalOpen(true);
  };

  const handleOpenReminderModal = async (loan: Loan) => {
    const party = parties.find(p => p.id === loan.party_id);
    const remaining = loan.remaining_balance || 0;
    const amountStr = formatAmount(remaining);
    const totalStr = formatAmount(loan.amount);
    const username = await getConfig('username') || 'Khizar';
    
    let message = '';
    if (loan.direction === 'given') {
      message = `Hi ${party?.name},\n\nThis is a friendly reminder regarding the loan of ${amountStr} which is currently pending. \n\nTotal Amount: ${totalStr}\n${loan.due_date ? `Due Date: ${format(new Date(loan.due_date), 'MMM dd, yyyy')}\n` : ''}Please let me know when you can settle the remaining balance.\n\nRegards,\n${username}'s Smart Ai-Assitant\n\n_System Generated Reminder_`;
    } else {
      message = `Hi ${party?.name},\n\nThis is a reminder for myself regarding the payment of ${amountStr} I owe you. \n\nTotal Amount: ${totalStr}\n${loan.due_date ? `Due Date: ${format(new Date(loan.due_date), 'MMM dd, yyyy')}\n` : ''}I will settle this soon.\n\n_System Generated Reminder_`;
    }
    
    setReminderMessage(message);
    setIsReminderModalOpen(true);
  };

  const handleSendWhatsApp = () => {
    if (!selectedLoan) return;
    const party = parties.find(p => p.id === selectedLoan.party_id);
    if (!party?.phone) {
      toast.error('No phone number found for this party. Please add a phone number in the Counterparties tab.');
      return;
    }
    // Remove non-numeric characters for the phone number
    const cleanPhone = party.phone.replace(/\D/g, '');
    const encodedMsg = encodeURIComponent(reminderMessage);
    window.open(`https://wa.me/${cleanPhone}?text=${encodedMsg}`, '_blank');
    setIsReminderModalOpen(false);
  };

  const filteredLoans = loans.filter(l => 
    l.party_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    l.description?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Loan Management</h1>
          <p className="text-muted-foreground text-sm">Track money you've lent or borrowed</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setIsPartyModalOpen(true)}
            className="bg-secondary text-secondary-foreground px-4 py-2 rounded-xl flex items-center gap-2 hover:opacity-90 transition-opacity font-medium text-sm"
          >
            <Users size={18} />
            Add Party
          </button>
          <button
            onClick={() => setIsLoanModalOpen(true)}
            className="bg-primary text-primary-foreground px-4 py-2 rounded-xl flex items-center gap-2 hover:opacity-90 transition-opacity font-medium text-sm"
          >
            <Plus size={18} />
            New Loan
          </button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-card p-6 rounded-2xl border border-border relative overflow-hidden group">
          <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:scale-110 transition-transform">
            <ArrowUpRight size={64} className="text-emerald-500" />
          </div>
          <p className="text-sm text-muted-foreground mb-1">Total Receivables (Assets)</p>
          <h2 className="text-3xl font-bold text-emerald-500">{formatAmount(summary.totalReceivable)}</h2>
          <p className="text-[10px] text-muted-foreground mt-2 uppercase tracking-wider font-bold">Money others owe you</p>
        </div>
        <div className="bg-card p-6 rounded-2xl border border-border relative overflow-hidden group">
          <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:scale-110 transition-transform">
            <ArrowDownLeft size={64} className="text-destructive" />
          </div>
          <p className="text-sm text-muted-foreground mb-1">Total Payables (Liabilities)</p>
          <h2 className="text-3xl font-bold text-destructive">{formatAmount(summary.totalPayable)}</h2>
          <p className="text-[10px] text-muted-foreground mt-2 uppercase tracking-wider font-bold">Money you owe others</p>
        </div>
      </div>

      {/* Tabs & Filters */}
      <div className="bg-card border border-border rounded-2xl overflow-hidden">
        <div className="flex border-b border-border">
          <button
            onClick={() => setActiveTab('loans')}
            className={`flex-1 py-4 text-sm font-bold transition-colors ${activeTab === 'loans' ? 'bg-primary/5 text-primary border-b-2 border-primary' : 'text-muted-foreground hover:bg-muted'}`}
          >
            All Loans
          </button>
          <button
            onClick={() => setActiveTab('parties')}
            className={`flex-1 py-4 text-sm font-bold transition-colors ${activeTab === 'parties' ? 'bg-primary/5 text-primary border-b-2 border-primary' : 'text-muted-foreground hover:bg-muted'}`}
          >
            Counterparties
          </button>
        </div>

        {activeTab === 'loans' && (
          <div className="p-4 space-y-4">
            <div className="flex flex-col md:flex-row gap-4">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={18} />
                <input
                  type="text"
                  placeholder="Search loans, descriptions..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full bg-muted border-none rounded-xl pl-10 pr-4 py-2 text-sm outline-none focus:ring-1 focus:ring-primary"
                />
              </div>
              <div className="flex gap-2">
                <select
                  value={filterDirection}
                  onChange={(e) => setFilterDirection(e.target.value as any)}
                  className="bg-muted border-none rounded-xl px-3 py-2 text-sm outline-none cursor-pointer"
                >
                  <option value="all">All Directions</option>
                  <option value="given">Loans Given</option>
                  <option value="taken">Loans Taken</option>
                </select>
                <select
                  value={filterStatus}
                  onChange={(e) => setFilterStatus(e.target.value as any)}
                  className="bg-muted border-none rounded-xl px-3 py-2 text-sm outline-none cursor-pointer"
                >
                  <option value="all">All Status</option>
                  <option value="open">Open</option>
                  <option value="partial">Partial</option>
                  <option value="closed">Closed</option>
                  <option value="loss">Loss</option>
                </select>
              </div>
            </div>

            {loading ? (
              <div className="space-y-3 py-4">
                {[1, 2, 3].map(i => <div key={i} className="h-20 bg-muted animate-pulse rounded-xl" />)}
              </div>
            ) : filteredLoans.length === 0 ? (
              <div className="py-12 text-center">
                <Clock size={48} className="mx-auto mb-4 text-muted-foreground opacity-20" />
                <p className="text-muted-foreground">No loans found matching your criteria</p>
              </div>
            ) : (
              <div className="space-y-3">
                {filteredLoans.map((loan) => (
                  <div
                    key={loan.id}
                    onClick={() => handleViewRepayments(loan)}
                    className="bg-muted/30 p-4 rounded-xl border border-transparent hover:border-primary/20 hover:bg-muted/50 transition-all cursor-pointer group"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className={`p-2 rounded-lg ${loan.direction === 'given' ? 'bg-emerald-500/10 text-emerald-500' : 'bg-destructive/10 text-destructive'}`}>
                          {loan.direction === 'given' ? <ArrowUpRight size={20} /> : <ArrowDownLeft size={20} />}
                        </div>
                        <div>
                          <h4 className="font-bold flex items-center gap-2">
                            {loan.party_name}
                            {loan.status === 'closed' && <CheckCircle2 size={14} className="text-emerald-500" />}
                            {loan.status === 'partial' && <Clock size={14} className="text-amber-500" />}
                            {loan.status === 'loss' && <AlertCircle size={14} className="text-rose-500" />}
                          </h4>
                          <div className="flex items-center gap-2 text-xs text-muted-foreground mt-0.5">
                            <Calendar size={12} />
                            {format(new Date(loan.date), 'MMM dd, yyyy')}
                            {loan.due_date && (
                              <span className="flex items-center gap-1 text-rose-500 font-medium">
                                <AlertCircle size={12} />
                                Due: {format(new Date(loan.due_date), 'MMM dd')}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <div className="text-right">
                          <p className="font-bold">{formatAmount(loan.amount)}</p>
                          <p className={`text-xs font-medium ${loan.status === 'loss' ? 'text-rose-500' : loan.remaining_balance! <= 0 ? 'text-emerald-500' : 'text-muted-foreground'}`}>
                            {loan.status === 'loss' ? `Loss: ${formatAmount(loan.loss_amount)}` : loan.remaining_balance! <= 0 ? 'Fully Repaid' : `${formatAmount(loan.remaining_balance!)} remaining`}
                          </p>
                        </div>
                        {loan.status !== 'closed' && loan.status !== 'loss' && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedLoan(loan);
                              handleOpenReminderModal(loan);
                            }}
                            className="p-2 text-muted-foreground hover:text-emerald-500 hover:bg-emerald-500/10 rounded-lg transition-colors"
                            title="Quick WhatsApp Reminder"
                          >
                            <MessageCircle size={18} />
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {activeTab === 'parties' && (
          <div className="p-4">
             {parties.length === 0 ? (
               <div className="py-12 text-center">
                 <Users size={48} className="mx-auto mb-4 text-muted-foreground opacity-20" />
                 <p className="text-muted-foreground">No counterparties added yet</p>
               </div>
             ) : (
               <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                 {parties.map(party => (
                   <div key={party.id} className="bg-muted/30 p-4 rounded-xl border border-border flex items-center justify-between">
                     <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-primary/10 text-primary flex items-center justify-center font-bold">
                          {party.name.charAt(0).toUpperCase()}
                        </div>
                        <div>
                          <h4 className="font-bold">{party.name}</h4>
                          <div className="flex gap-3 mt-1">
                            {party.phone && <span className="text-[10px] text-muted-foreground flex items-center gap-1"><Phone size={10} /> {party.phone}</span>}
                            {party.email && <span className="text-[10px] text-muted-foreground flex items-center gap-1"><Mail size={10} /> {party.email}</span>}
                          </div>
                        </div>
                     </div>
                     <div className="flex gap-1">
                        <button
                           onClick={() => handleEditParty(party)}
                           className="p-2 text-muted-foreground hover:text-primary hover:bg-primary/10 rounded-lg transition-colors"
                        >
                           <Pencil size={16} />
                        </button>
                        <button
                           onClick={async () => {
                             if (confirm(`Delete ${party.name}?`)) {
                               await deleteLoanParty(party.id);
                               loadData();
                             }
                           }}
                           className="p-2 text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded-lg transition-colors"
                        >
                           <Trash2 size={16} />
                        </button>
                     </div>
                   </div>
                 ))}
               </div>
             )}
          </div>
        )}
      </div>

      {/* Modals */}
      {/* Party Modal */}
      {isPartyModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm">
          <div className="bg-card border border-border w-full max-w-md rounded-3xl shadow-2xl animate-in fade-in zoom-in duration-200">
            <div className="p-6 border-b border-border flex items-center justify-between">
              <h2 className="text-xl font-bold">{editingParty ? 'Edit Counterparty' : 'Add Counterparty'}</h2>
              <button onClick={() => { setIsPartyModalOpen(false); setEditingParty(null); }} className="text-muted-foreground hover:text-foreground">
                <X size={24} />
              </button>
            </div>
            <form onSubmit={handleAddParty} className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1.5">Full Name</label>
                <input
                  type="text"
                  value={partyName}
                  onChange={(e) => setPartyName(e.target.value)}
                  placeholder="Person or Entity name"
                  className="w-full bg-muted border-none rounded-xl p-3 outline-none focus:ring-2 focus:ring-primary"
                  required
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-1.5">Phone (Optional)</label>
                  <input
                    type="text"
                    value={partyPhone}
                    onChange={(e) => setPartyPhone(e.target.value)}
                    className="w-full bg-muted border-none rounded-xl p-3 outline-none focus:ring-2 focus:ring-primary"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1.5">Email (Optional)</label>
                  <input
                    type="email"
                    value={partyEmail}
                    onChange={(e) => setPartyEmail(e.target.value)}
                    className="w-full bg-muted border-none rounded-xl p-3 outline-none focus:ring-2 focus:ring-primary"
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1.5">Notes</label>
                <textarea
                  value={partyNotes}
                  onChange={(e) => setPartyNotes(e.target.value)}
                  className="w-full bg-muted border-none rounded-xl p-3 outline-none focus:ring-2 focus:ring-primary min-h-[80px]"
                />
              </div>
              <button
                type="submit"
                className="w-full bg-primary text-primary-foreground py-4 rounded-2xl font-bold hover:opacity-90 transition-opacity"
              >
                {editingParty ? 'Update Party' : 'Create Party'}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Loan Modal */}
      {isLoanModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm">
          <div className="bg-card border border-border w-full max-w-lg rounded-3xl shadow-2xl animate-in fade-in zoom-in duration-200">
            <div className="p-6 border-b border-border flex items-center justify-between">
              <h2 className="text-xl font-bold">{editingLoan ? 'Edit Loan Record' : 'New Loan Record'}</h2>
              <button onClick={() => { setIsLoanModalOpen(false); setEditingLoan(null); resetLoanForm(); }} className="text-muted-foreground hover:text-foreground">
                <X size={24} />
              </button>
            </div>
            <form onSubmit={handleAddLoan} className="p-6 space-y-4 max-h-[80vh] overflow-y-auto">
              <div>
                <label className="block text-sm font-medium mb-1.5">Loan Direction</label>
                <div className="flex p-1 bg-muted rounded-xl">
                  <button
                    type="button"
                    onClick={() => setLoanDirection('given')}
                    className={`flex-1 py-2 text-sm font-bold rounded-lg transition-all ${loanDirection === 'given' ? 'bg-card shadow-sm text-emerald-500' : 'text-muted-foreground'}`}
                  >
                    I'm Lending
                  </button>
                  <button
                    type="button"
                    onClick={() => setLoanDirection('taken')}
                    className={`flex-1 py-2 text-sm font-bold rounded-lg transition-all ${loanDirection === 'taken' ? 'bg-card shadow-sm text-destructive' : 'text-muted-foreground'}`}
                  >
                    I'm Borrowing
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium mb-1.5">Counterparty</label>
                <div className="flex gap-2">
                   <select
                    value={loanPartyId}
                    onChange={(e) => setLoanPartyId(e.target.value)}
                    className="flex-1 bg-muted border-none rounded-xl p-3 outline-none focus:ring-2 focus:ring-primary"
                    required
                  >
                    <option value="">Select a person/entity</option>
                    {parties.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </select>
                  <button
                    type="button"
                    onClick={() => setIsPartyModalOpen(true)}
                    className="p-3 bg-secondary rounded-xl text-secondary-foreground"
                  >
                    <Plus size={20} />
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-1.5">Amount</label>
                  <input
                    type="number"
                    step="any"
                    value={loanAmount}
                    onChange={(e) => setLoanAmount(e.target.value)}
                    placeholder="0.00"
                    className="w-full bg-muted border-none rounded-xl p-3 outline-none focus:ring-2 focus:ring-primary"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1.5">Category</label>
                  <select
                    value={loanCategory}
                    onChange={(e) => setLoanCategory(e.target.value)}
                    className="w-full bg-muted border-none rounded-xl p-3 outline-none focus:ring-2 focus:ring-primary"
                  >
                    <option value="Personal">Personal</option>
                    <option value="Business">Business</option>
                    <option value="Family">Family</option>
                    <option value="Other">Other</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-1.5">Loan Date</label>
                  <input
                    type="date"
                    value={loanDate}
                    onChange={(e) => setLoanDate(e.target.value)}
                    className="w-full bg-muted border-none rounded-xl p-3 outline-none focus:ring-2 focus:ring-primary"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1.5">Due Date (Optional)</label>
                  <input
                    type="date"
                    value={loanDueDate}
                    onChange={(e) => setLoanDueDate(e.target.value)}
                    className="w-full bg-muted border-none rounded-xl p-3 outline-none focus:ring-2 focus:ring-primary"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium mb-1.5">Account Linked</label>
                <select
                  value={loanAccountId}
                  onChange={(e) => setLoanAccountId(e.target.value)}
                  className="w-full bg-muted border-none rounded-xl p-3 outline-none focus:ring-2 focus:ring-primary"
                >
                  <option value="">No specific account</option>
                  {accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium mb-1.5">Description / Notes</label>
                <textarea
                  value={loanDescription}
                  onChange={(e) => setLoanDescription(e.target.value)}
                  placeholder="What is this loan for?"
                  className="w-full bg-muted border-none rounded-xl p-3 outline-none focus:ring-2 focus:ring-primary min-h-[80px]"
                />
              </div>

              <button
                type="submit"
                className="w-full bg-primary text-primary-foreground py-4 rounded-2xl font-bold hover:opacity-90 transition-opacity flex items-center justify-center gap-2"
              >
                <PlusCircle size={20} />
                {editingLoan ? 'Update Loan' : 'Save Loan'}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Repayment Modal / Details */}
      {isRepaymentModalOpen && selectedLoan && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm">
          <div className="bg-card border border-border w-full max-w-2xl rounded-3xl shadow-2xl animate-in fade-in zoom-in duration-200 overflow-hidden flex flex-col max-h-[90vh]">
            <div className="p-6 border-b border-border flex items-center justify-between">
              <div>
                <h2 className="text-xl font-bold">Loan Details</h2>
                <p className="text-sm text-muted-foreground">{selectedLoan.party_name} &bull; {selectedLoan.category}</p>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => handleOpenReminderModal(selectedLoan)}
                  className="p-2 text-muted-foreground hover:text-emerald-500 hover:bg-emerald-500/10 rounded-lg flex items-center gap-1"
                  title="Send WhatsApp Reminder"
                >
                  <MessageCircle size={20} />
                </button>
                <button
                  onClick={() => handleEditLoan(selectedLoan)}
                  className="p-2 text-muted-foreground hover:text-primary hover:bg-primary/10 rounded-lg"
                >
                  <Pencil size={20} />
                </button>
                <button
                  onClick={() => handleDeleteLoan(selectedLoan.id)}
                  className="p-2 text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded-lg"
                >
                  <Trash2 size={20} />
                </button>
                <button onClick={() => setIsRepaymentModalOpen(false)} className="text-muted-foreground hover:text-foreground">
                  <X size={24} />
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-6 space-y-6">
              {/* Loan Stats */}
              <div className="grid grid-cols-3 gap-4">
                <div className="bg-muted/50 p-4 rounded-2xl">
                  <p className="text-[10px] text-muted-foreground uppercase font-bold">Total Amount</p>
                  <p className="text-lg font-bold">{formatAmount(selectedLoan.amount)}</p>
                </div>
                <div className="bg-emerald-500/10 p-4 rounded-2xl">
                  <p className="text-[10px] text-emerald-500 uppercase font-bold">Repaid</p>
                  <p className="text-lg font-bold text-emerald-500">{formatAmount(selectedLoan.total_repaid!)}</p>
                </div>
                <div className="bg-primary/10 p-4 rounded-2xl">
                  <p className="text-[10px] text-primary uppercase font-bold">Remaining</p>
                  <p className="text-lg font-bold text-primary">{formatAmount(selectedLoan.remaining_balance!)}</p>
                </div>
              </div>

              {/* Repayment Form */}
              {selectedLoan.status !== 'closed' && selectedLoan.status !== 'loss' && (
                <div className="space-y-4">
                  <div className="bg-card border border-border rounded-2xl p-4">
                    <div className="flex items-center justify-between mb-4">
                      <h3 className="font-bold text-sm flex items-center gap-2">
                        <History size={16} className="text-primary" />
                        Record Repayment
                      </h3>
                      <button
                        onClick={() => openLossModal(selectedLoan)}
                        className="text-[10px] uppercase font-bold text-rose-500 hover:bg-rose-500/10 px-2 py-1 rounded transition-colors"
                      >
                        Mark as Loss
                      </button>
                    </div>
                  <form onSubmit={handleAddRepayment} className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-[10px] font-bold text-muted-foreground uppercase mb-1">Amount</label>
                        <input
                          type="number"
                          step="any"
                          value={repaymentAmount}
                          onChange={(e) => setRepaymentAmount(e.target.value)}
                          placeholder="0.00"
                          className="w-full bg-muted border-none rounded-xl p-2 text-sm outline-none focus:ring-1 focus:ring-primary"
                          required
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] font-bold text-muted-foreground uppercase mb-1">Date</label>
                        <input
                          type="date"
                          value={repaymentDate}
                          onChange={(e) => setRepaymentDate(e.target.value)}
                          className="w-full bg-muted border-none rounded-xl p-2 text-sm outline-none focus:ring-1 focus:ring-primary"
                          required
                        />
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-[10px] font-bold text-muted-foreground uppercase mb-1">From Account</label>
                        <select
                          value={repaymentAccountId}
                          onChange={(e) => setRepaymentAccountId(e.target.value)}
                          className="w-full bg-muted border-none rounded-xl p-2 text-sm outline-none focus:ring-1 focus:ring-primary"
                        >
                          {accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                        </select>
                      </div>
                      <div>
                        <label className="block text-[10px] font-bold text-muted-foreground uppercase mb-1">Notes</label>
                        <input
                          type="text"
                          value={repaymentNotes}
                          onChange={(e) => setRepaymentNotes(e.target.value)}
                          placeholder="Repayment details"
                          className="w-full bg-muted border-none rounded-xl p-2 text-sm outline-none focus:ring-1 focus:ring-primary"
                        />
                      </div>
                    </div>
                    <button
                      type="submit"
                      className="w-full bg-primary text-primary-foreground py-2 rounded-xl text-sm font-bold hover:opacity-90"
                    >
                      Post Repayment
                    </button>
                  </form>
                </div>
                </div>
              )}

              {selectedLoan.status === 'loss' && (
                <div className="bg-rose-500/5 border border-rose-500/20 rounded-2xl p-4">
                  <h3 className="font-bold text-sm text-rose-500 mb-2 flex items-center gap-2">
                    <AlertCircle size={16} />
                    Loan Loss Recorded
                  </h3>
                  <div className="space-y-2">
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Amount Lost:</span>
                      <span className="font-bold text-rose-500">{formatAmount(selectedLoan.loss_amount)}</span>
                    </div>
                    {selectedLoan.loss_remarks && (
                      <div className="text-xs bg-rose-500/10 p-2 rounded-lg italic text-muted-foreground">
                        "{selectedLoan.loss_remarks}"
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Repayment History */}
              <div className="space-y-3">
                 <h3 className="font-bold text-sm">Payment History</h3>
                 {repayments.length === 0 ? (
                   <p className="text-xs text-muted-foreground italic text-center py-4">No payments recorded yet</p>
                 ) : (
                   <div className="space-y-2">
                     {repayments.map(rep => (
                       <div key={rep.id} className="bg-muted/30 p-3 rounded-xl flex items-center justify-between border border-border/50">
                         <div>
                            <p className="text-sm font-bold">{formatAmount(rep.amount)}</p>
                            <p className="text-[10px] text-muted-foreground">
                              {format(new Date(rep.date), 'MMM dd, yyyy')} &bull; {rep.account_name || 'No account'}
                            </p>
                            {rep.notes && <p className="text-[10px] text-muted-foreground mt-1 flex items-center gap-1 italic"><StickyNote size={8} /> {rep.notes}</p>}
                         </div>
                         <button
                           onClick={() => handleDeleteRepayment(rep.id)}
                           className="p-1.5 text-muted-foreground hover:text-destructive rounded-md"
                         >
                           <Trash2 size={14} />
                         </button>
                       </div>
                     ))}
                   </div>
                 )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Loss Modal */}
      {isLossModalOpen && selectedLoan && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm">
          <div className="bg-card border border-border w-full max-w-md rounded-3xl shadow-2xl animate-in fade-in zoom-in duration-200">
            <div className="p-6 border-b border-border flex items-center justify-between">
              <h2 className="text-xl font-bold text-rose-500">Mark as Loan Loss</h2>
              <button onClick={() => setIsLossModalOpen(false)} className="text-muted-foreground hover:text-foreground">
                <X size={24} />
              </button>
            </div>
            <form onSubmit={handleMarkAsLoss} className="p-6 space-y-4">
              <div className="p-4 bg-rose-500/10 rounded-2xl text-rose-500 text-sm">
                <p className="font-bold">Important Notice</p>
                <p className="opacity-80">Marking a loan as a loss means you are giving up on the remaining balance. This will close the loan and record the loss in your transactions.</p>
              </div>

              <div>
                <label className="block text-sm font-medium mb-1.5">Loss Amount</label>
                <input
                  type="number"
                  step="any"
                  value={lossAmount}
                  onChange={(e) => setLossAmount(e.target.value)}
                  placeholder="0.00"
                  className="w-full bg-muted border-none rounded-xl p-3 outline-none focus:ring-2 focus:ring-rose-500"
                  required
                />
                <p className="text-[10px] text-muted-foreground mt-1">Remaining balance: {formatAmount(selectedLoan.remaining_balance!)}</p>
              </div>

              <div>
                <label className="block text-sm font-medium mb-1.5">Remarks / Reason</label>
                <textarea
                  value={lossRemarks}
                  onChange={(e) => setLossRemarks(e.target.value)}
                  placeholder="Why is this loan unrecoverable?"
                  className="w-full bg-muted border-none rounded-xl p-3 outline-none focus:ring-2 focus:ring-rose-500 min-h-[100px]"
                  required
                />
              </div>

              <button
                type="submit"
                className="w-full bg-rose-500 text-white py-4 rounded-2xl font-bold hover:opacity-90 transition-opacity"
              >
                Confirm Loan Loss
              </button>
            </form>
          </div>
        </div>
      )}

      {/* WhatsApp Reminder Modal */}
      {isReminderModalOpen && selectedLoan && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm">
          <div className="bg-card border border-border w-full max-w-md rounded-3xl shadow-2xl animate-in fade-in zoom-in duration-200">
            <div className="p-6 border-b border-border flex items-center justify-between">
              <div className="flex items-center gap-2">
                <MessageSquare className="text-emerald-500" size={24} />
                <h2 className="text-xl font-bold">Reminder Preview</h2>
              </div>
              <button onClick={() => setIsReminderModalOpen(false)} className="text-muted-foreground hover:text-foreground">
                <X size={24} />
              </button>
            </div>
            <div className="p-6 space-y-4">
              <p className="text-sm text-muted-foreground">You can customize the message before sending it to WhatsApp.</p>
              
              <div className="relative">
                <textarea
                  value={reminderMessage}
                  onChange={(e) => setReminderMessage(e.target.value)}
                  className="w-full bg-muted border border-border rounded-2xl p-4 text-sm min-h-[250px] outline-none focus:ring-2 focus:ring-emerald-500 transition-all font-sans leading-relaxed"
                  placeholder="Type your message here..."
                />
                <div className="absolute bottom-4 right-4 opacity-10">
                  <Send size={48} className="text-emerald-500" />
                </div>
              </div>

              <div className="flex gap-3">
                <button
                  onClick={() => setIsReminderModalOpen(false)}
                  className="flex-1 bg-secondary text-secondary-foreground py-4 rounded-2xl font-bold hover:opacity-90 transition-opacity"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSendWhatsApp}
                  className="flex-2 px-8 bg-emerald-500 text-white py-4 rounded-2xl font-bold hover:opacity-90 transition-opacity flex items-center justify-center gap-2"
                >
                  <Send size={18} />
                  Send to WhatsApp
                </button>
              </div>
              
              <p className="text-[10px] text-center text-muted-foreground italic">
                Note: This will open WhatsApp. You will still need to click the send button manually in the WhatsApp app.
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Loans;
