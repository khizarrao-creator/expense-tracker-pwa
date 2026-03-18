import React, { useState, useEffect } from 'react';
import {
  Plus,
  Bell,
  Calendar,
  CheckCircle2,
  Trash2,
  PlusCircle,
  X,
  CreditCard
} from 'lucide-react';
import {
  getReminders,
  addReminder,
  deleteReminder,
  markReminderAsPaid,
  getCategories,
  getAccounts,
  type Reminder
} from '../db/queries';
import { useCurrency } from '../contexts/CurrencyContext';
import { toast } from 'sonner';
import { format, isPast, isToday, parseISO } from 'date-fns';

const Reminders: React.FC = () => {
  const { formatAmount } = useCurrency();
  const [reminders, setReminders] = useState<Reminder[]>([]);
  const [categories, setCategories] = useState<any[]>([]);
  const [accounts, setAccounts] = useState<any[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isPayModalOpen, setIsPayModalOpen] = useState(false);
  const [selectedReminder, setSelectedReminder] = useState<Reminder | null>(null);
  const [selectedAccountId, setSelectedAccountId] = useState('');
  const [loading, setLoading] = useState(true);

  // Form State
  const [title, setTitle] = useState('');
  const [amount, setAmount] = useState('');
  const [dueDate, setDueDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [frequency, setFrequency] = useState('Monthly');
  const [categoryId, setCategoryId] = useState('');

  const loadData = async () => {
    setLoading(true);
    try {
      const [remList, catList, accList] = await Promise.all([
        getReminders(),
        getCategories(),
        getAccounts()
      ]);
      setReminders(remList);
      setCategories(catList.filter((c: any) => c.type === 'expense'));
      setAccounts(accList);
      if (catList.length > 0) setCategoryId(catList[0].id);
      if (accList.length > 0) setSelectedAccountId(accList[0].id);
    } catch (error) {
      toast.error('Failed to load reminders');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title || !amount || !dueDate || !categoryId) {
      toast.error('Please fill all required fields');
      return;
    }

    try {
      await addReminder(
        title,
        parseFloat(amount),
        dueDate,
        frequency,
        categoryId
      );
      toast.success('Reminder added');
      setIsModalOpen(false);
      resetForm();
      loadData();
    } catch (error) {
      toast.error('Failed to add reminder');
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this reminder?')) return;
    try {
      await deleteReminder(id);
      toast.success('Reminder deleted');
      loadData();
    } catch (error) {
      toast.error('Failed to delete reminder');
    }
  };

  const handlePay = async () => {
    if (!selectedReminder || !selectedAccountId) return;
    try {
      await markReminderAsPaid(selectedReminder, selectedAccountId);
      toast.success('Bill marked as paid');
      setIsPayModalOpen(false);
      setSelectedReminder(null);
      loadData();
    } catch (error) {
      toast.error('Failed to process payment');
    }
  };

  const resetForm = () => {
    setTitle('');
    setAmount('');
    setDueDate(format(new Date(), 'yyyy-MM-dd'));
    setFrequency('Monthly');
  };

  const frequencies = ['One-time', 'Monthly', 'Yearly'];

  const getStatusColor = (reminder: Reminder) => {
    if (reminder.status === 'paid') return 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20';
    const date = parseISO(reminder.due_date);
    if (isPast(date) && !isToday(date)) return 'bg-destructive/10 text-destructive border-destructive/20';
    if (isToday(date)) return 'bg-amber-500/10 text-amber-500 border-amber-500/20';
    return 'bg-muted text-muted-foreground border-border';
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Bill Reminders</h1>
        <button
          onClick={() => setIsModalOpen(true)}
          className="bg-primary text-primary-foreground p-2 rounded-full hover:opacity-90 transition-opacity"
        >
          <Plus size={24} />
        </button>
      </div>

      <div className="space-y-4">
        {loading ? (
          <div className="space-y-4">
            {[1, 2, 3].map(i => <div key={i} className="h-20 bg-muted animate-pulse rounded-2xl" />)}
          </div>
        ) : reminders.length === 0 ? (
          <div className="bg-card p-12 rounded-2xl border border-dashed border-border text-center">
            <Bell size={48} className="mx-auto mb-4 text-muted-foreground opacity-20" />
            <p className="text-muted-foreground">No reminders set</p>
            <button
              onClick={() => setIsModalOpen(true)}
              className="mt-4 text-primary font-medium hover:underline"
            >
              Add your first bill
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            {reminders.map((rem) => (
              <div
                key={rem.id}
                className={`bg-card p-4 rounded-2xl border border-border flex items-center justify-between group transition-all ${rem.status === 'paid' ? 'opacity-60' : ''}`}
              >
                <div className="flex items-center gap-4">
                  <div className={`p-3 rounded-xl border ${getStatusColor(rem)}`}>
                    <Calendar size={20} />
                  </div>
                  <div>
                    <h4 className="font-bold">{rem.title}</h4>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <span>{format(parseISO(rem.due_date), 'MMM dd, yyyy')}</span>
                      <span>•</span>
                      <span>{rem.frequency}</span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-4">
                  <div className="text-right">
                    <p className="font-bold">{formatAmount(rem.amount)}</p>
                    <p className={`text-[10px] font-bold uppercase tracking-wider ${rem.status === 'paid' ? 'text-emerald-500' : 'text-muted-foreground'}`}>
                      {rem.status}
                    </p>
                  </div>

                  <div className="flex items-center gap-2">
                    {rem.status === 'pending' && (
                      <button
                        onClick={() => {
                          setSelectedReminder(rem);
                          setIsPayModalOpen(true);
                        }}
                        className="p-2 text-primary hover:bg-primary/10 rounded-lg transition-colors"
                        title="Mark as Paid"
                      >
                        <CheckCircle2 size={20} />
                      </button>
                    )}
                    <button
                      onClick={() => handleDelete(rem.id)}
                      className="p-2 text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded-lg transition-colors opacity-0 group-hover:opacity-100"
                    >
                      <Trash2 size={20} />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Add Reminder Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm">
          <div className="bg-card border border-border w-full max-w-md rounded-3xl shadow-2xl overflow-hidden animate-in fade-in zoom-in duration-200">
            <div className="p-6 border-b border-border flex items-center justify-between">
              <h2 className="text-xl font-bold">New Reminder</h2>
              <button onClick={() => setIsModalOpen(false)} className="text-muted-foreground hover:text-foreground">
                <X size={24} />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1.5">Bill Title</label>
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="e.g. Netflix, Rent, Electricity"
                  className="w-full bg-muted border-none rounded-xl p-3 focus:ring-2 focus:ring-primary outline-none"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-1.5">Amount</label>
                  <input
                    type="number"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    placeholder="0.00"
                    className="w-full bg-muted border-none rounded-xl p-3 focus:ring-2 focus:ring-primary outline-none"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1.5">Due Date</label>
                  <input
                    type="date"
                    value={dueDate}
                    onChange={(e) => setDueDate(e.target.value)}
                    className="w-full bg-muted border-none rounded-xl p-3 focus:ring-2 focus:ring-primary outline-none"
                    required
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium mb-1.5">Category</label>
                <select
                  value={categoryId}
                  onChange={(e) => setCategoryId(e.target.value)}
                  className="w-full bg-muted border-none rounded-xl p-3 focus:ring-2 focus:ring-primary outline-none"
                  required
                >
                  {categories.map(c => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium mb-1.5">Frequency</label>
                <div className="flex gap-2">
                  {frequencies.map(f => (
                    <button
                      key={f}
                      type="button"
                      onClick={() => setFrequency(f)}
                      className={`flex-1 py-3 rounded-xl text-sm font-medium border-2 transition-all ${frequency === f ? 'border-primary bg-primary/5 text-primary' : 'border-transparent bg-muted text-muted-foreground'
                        }`}
                    >
                      {f}
                    </button>
                  ))}
                </div>
              </div>

              <button
                type="submit"
                className="w-full bg-primary text-primary-foreground py-4 rounded-2xl font-bold mt-4 hover:opacity-90 transition-opacity flex items-center justify-center gap-2"
              >
                <PlusCircle size={20} />
                Set Reminder
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Pay Modal */}
      {isPayModalOpen && selectedReminder && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm">
          <div className="bg-card border border-border w-full max-w-sm rounded-3xl shadow-2xl p-6 space-y-4 animate-in fade-in zoom-in duration-200">
            <div className="text-center">
              <div className="w-16 h-16 bg-primary/10 text-primary rounded-full flex items-center justify-center mx-auto mb-4">
                <CreditCard size={32} />
              </div>
              <h2 className="text-xl font-bold">Pay {selectedReminder.title}?</h2>
              <p className="text-muted-foreground text-sm mt-1">
                This will create an expense transaction of {formatAmount(selectedReminder.amount)}.
              </p>
            </div>

            <div className="space-y-3">
              <label className="text-sm font-medium">Select Account</label>
              <select
                value={selectedAccountId}
                onChange={(e) => setSelectedAccountId(e.target.value)}
                className="w-full bg-muted border-none rounded-xl p-3 focus:ring-2 focus:ring-primary outline-none"
              >
                {accounts.map(a => (
                  <option key={a.id} value={a.id}>{a.name}</option>
                ))}
              </select>
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => setIsPayModalOpen(false)}
                className="flex-1 py-3 rounded-xl font-medium bg-muted text-muted-foreground hover:bg-muted/80 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handlePay}
                className="flex-1 py-3 rounded-xl font-bold bg-primary text-primary-foreground hover:opacity-90 transition-opacity"
              >
                Pay Now
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Reminders;
