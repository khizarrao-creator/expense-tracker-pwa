import React, { useState, useEffect } from 'react';
import {
  Plus,
  Bell,
  Calendar,
  CheckCircle2,
  Trash2,
  PlusCircle,
  X,
  CreditCard,
  MessageSquare,
  MessageCircle,
  Send
} from 'lucide-react';
import {
  getReminders,
  addReminder,
  deleteReminder,
  markReminderAsPaid,
  getCategories,
  getAccounts,
  updateReminder,
  getConfig,
  type Reminder
} from '../db/queries';
import { useCurrency } from '../contexts/CurrencyContext';
import { toast } from 'sonner';
import { format, isPast, isToday, parseISO } from 'date-fns';
import { getWhatsAppStatus, sendWhatsAppMessage, initWhatsApp, type WhatsAppAccount } from '../services/whatsappService';

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

  // WhatsApp reminder states
  const [whatsappEnabled, setWhatsappEnabled] = useState(false);
  const [whatsappName, setWhatsappName] = useState('');
  const [whatsappPhone, setWhatsappPhone] = useState('');
  const [whatsappDate, setWhatsappDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [whatsappTime, setWhatsappTime] = useState('12:00');

  // WhatsApp Send Modal States
  const [isWaReminderModalOpen, setIsWaReminderModalOpen] = useState(false);
  const [waReminderMessage, setWaReminderMessage] = useState('');
  const [waReminderPhone, setWaReminderPhone] = useState('');
  const [waReminderName, setWaReminderName] = useState('');
  const [waAccounts, setWaAccounts] = useState<WhatsAppAccount[]>([]);
  const [selectedWaAccountId, setSelectedWaAccountId] = useState<string>('account1');
  const [sendMethod, setSendMethod] = useState<'direct' | 'manual'>('manual');
  const [isSendingWa, setIsSendingWa] = useState(false);
  const [isWaLinkModalOpen, setIsWaLinkModalOpen] = useState(false);

  useEffect(() => {
    if (!isWaLinkModalOpen) return;

    // Trigger manual initialization on the server
    initWhatsApp(selectedWaAccountId);

    const interval = setInterval(async () => {
      try {
        const res = await getWhatsAppStatus();
        const accounts = res.accounts || [];
        setWaAccounts(accounts);
        
        const active = accounts.find(a => a.id === selectedWaAccountId);
        if (active && active.status === 'connected') {
          toast.success(`${active.name} connected successfully!`);
          setSendMethod('direct');
          setIsWaLinkModalOpen(false);
        }
      } catch (e) {
        console.error(e);
      }
    }, 3000);

    return () => clearInterval(interval);
  }, [isWaLinkModalOpen, selectedWaAccountId]);

  const handleOpenWaReminderModal = async (reminder: Reminder) => {
    setSelectedReminder(reminder);
    setWaReminderPhone(reminder.whatsapp_phone || '');
    setWaReminderName(reminder.whatsapp_name || '');
    
    const amountStr = formatAmount(reminder.amount);
    const dueDateStr = format(parseISO(reminder.due_date), 'MMM dd, yyyy');
    const username = await getConfig('username') || 'Khizar';
    
    const message = `Hi ${reminder.whatsapp_name || 'there'},\n\nThis is a friendly reminder to pay the *${reminder.title}* bill of *${amountStr}*.\n\nDue Date: ${dueDateStr}\n\nRegards,\n${username}\n\n_Sent via Ledger PWA_`;
    
    setWaReminderMessage(message);
    setIsWaReminderModalOpen(true);

    try {
      const res = await getWhatsAppStatus();
      const accounts = res.accounts || [];
      setWaAccounts(accounts);
      
      const defaultAcc = await getConfig('whatsapp_default_account') || 'account1';
      setSelectedWaAccountId(defaultAcc);

      const activeAccount = accounts.find(a => a.id === defaultAcc);
      if (activeAccount && activeAccount.status === 'connected') {
        setSendMethod('direct');
      } else {
        const connected = accounts.find(a => a.status === 'connected');
        if (connected) {
          setSelectedWaAccountId(connected.id);
          setSendMethod('direct');
        } else {
          setSendMethod('manual');
        }
      }
    } catch (e) {
      console.error(e);
      setSendMethod('manual');
    }
  };

  const handleSendWhatsApp = async () => {
    if (!selectedReminder) return;
    if (!waReminderPhone) {
      toast.error('Please enter a phone number');
      return;
    }

    const cleanPhone = waReminderPhone.replace(/\D/g, '');

    if (sendMethod === 'manual') {
      const encodedMsg = encodeURIComponent(waReminderMessage);
      window.open(`https://wa.me/${cleanPhone}?text=${encodedMsg}`, '_blank');
      if (confirm('Did you send the message successfully? Click OK to mark it as sent.')) {
        await updateReminder(selectedReminder.id, { 
          whatsapp_sent: 1,
          whatsapp_phone: waReminderPhone,
          whatsapp_name: waReminderName
        });
        loadData();
      }
      setIsWaReminderModalOpen(false);
    } else {
      const activeAccount = waAccounts.find(a => a.id === selectedWaAccountId);
      if (!activeAccount || activeAccount.status !== 'connected') {
        toast.error('Selected WhatsApp device is not connected. Please scan the QR code first.');
        return;
      }

      setIsSendingWa(true);
      toast.loading('Sending WhatsApp reminder...', { id: 'wa-send' });
      try {
        const res = await sendWhatsAppMessage(selectedWaAccountId, cleanPhone, waReminderMessage);
        toast.dismiss('wa-send');
        if (res.success) {
          toast.success('Reminder message sent successfully!');
          await updateReminder(selectedReminder.id, { 
            whatsapp_sent: 1,
            whatsapp_phone: waReminderPhone,
            whatsapp_name: waReminderName
          });
          setIsWaReminderModalOpen(false);
          loadData();
        } else {
          toast.error(res.error || 'Failed to send message');
        }
      } catch (err: any) {
        toast.dismiss('wa-send');
        toast.error(err.message || 'Failed to send message');
      } finally {
        setIsSendingWa(false);
      }
    }
  };

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
        categoryId,
        whatsappEnabled ? whatsappPhone : null,
        whatsappEnabled ? whatsappName : null,
        whatsappEnabled ? whatsappDate : null,
        whatsappEnabled ? whatsappTime : null
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
    setWhatsappEnabled(false);
    setWhatsappName('');
    setWhatsappPhone('');
    setWhatsappDate(format(new Date(), 'yyyy-MM-dd'));
    setWhatsappTime('12:00');
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
                    {rem.whatsapp_phone && rem.status === 'pending' && (
                      <div className="flex items-center gap-1 text-[10px] text-emerald-500 font-semibold mt-1">
                        <MessageSquare size={12} />
                        <span>
                          {rem.whatsapp_sent === 1 
                            ? `WhatsApp sent to ${rem.whatsapp_name || rem.whatsapp_phone}` 
                            : `WhatsApp scheduled for ${rem.whatsapp_name || 'someone'} on ${rem.whatsapp_date ? format(parseISO(rem.whatsapp_date), 'MMM dd') : ''} at ${rem.whatsapp_time || ''}`
                          }
                        </span>
                      </div>
                    )}
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
                      <>
                        <button
                          onClick={() => handleOpenWaReminderModal(rem)}
                          className="p-2 text-emerald-500 hover:bg-emerald-500/10 rounded-lg transition-colors"
                          title="Send WhatsApp Reminder Now"
                        >
                          <MessageCircle size={20} />
                        </button>
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
                      </>
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
                    onChange={(e) => {
                      setDueDate(e.target.value);
                      setWhatsappDate(e.target.value);
                    }}
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

              <div className="border-t border-border pt-4 mt-2 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <MessageSquare size={18} className="text-emerald-500" />
                    <span className="text-sm font-semibold">Schedule WhatsApp Reminder</span>
                  </div>
                  <input
                    type="checkbox"
                    checked={whatsappEnabled}
                    onChange={(e) => setWhatsappEnabled(e.target.checked)}
                    className="w-4 h-4 rounded text-primary focus:ring-primary border-border bg-muted cursor-pointer"
                  />
                </div>

                {whatsappEnabled && (
                  <div className="space-y-3 p-3 bg-muted/40 border border-border rounded-2xl animate-in slide-in-from-top-2 duration-200">
                    <div>
                      <label className="block text-xs font-bold uppercase tracking-wider text-muted-foreground mb-1">Recipient Name</label>
                      <input
                        type="text"
                        value={whatsappName}
                        onChange={(e) => setWhatsappName(e.target.value)}
                        placeholder="e.g. Abc Person"
                        className="w-full bg-background border border-border rounded-xl p-2.5 text-sm outline-none focus:ring-1 focus:ring-primary"
                        required={whatsappEnabled}
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold uppercase tracking-wider text-muted-foreground mb-1">Phone Number</label>
                      <input
                        type="text"
                        value={whatsappPhone}
                        onChange={(e) => setWhatsappPhone(e.target.value)}
                        placeholder="e.g. 923001234567"
                        className="w-full bg-background border border-border rounded-xl p-2.5 text-sm outline-none focus:ring-1 focus:ring-primary"
                        required={whatsappEnabled}
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs font-bold uppercase tracking-wider text-muted-foreground mb-1">Schedule Date</label>
                        <input
                          type="date"
                          value={whatsappDate}
                          onChange={(e) => setWhatsappDate(e.target.value)}
                          className="w-full bg-background border border-border rounded-xl p-2.5 text-xs outline-none focus:ring-1 focus:ring-primary cursor-pointer"
                          required={whatsappEnabled}
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-bold uppercase tracking-wider text-muted-foreground mb-1">Schedule Time</label>
                        <input
                          type="time"
                          value={whatsappTime}
                          onChange={(e) => setWhatsappTime(e.target.value)}
                          className="w-full bg-background border border-border rounded-xl p-2.5 text-xs outline-none focus:ring-1 focus:ring-primary cursor-pointer"
                          required={whatsappEnabled}
                        />
                      </div>
                    </div>
                  </div>
                )}
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

      {/* WhatsApp Reminder Modal */}
      {isWaReminderModalOpen && selectedReminder && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-card border border-border w-full max-w-md rounded-3xl shadow-2xl animate-in zoom-in duration-200">
            <div className="p-6 border-b border-border flex items-center justify-between">
              <div className="flex items-center gap-2">
                <MessageSquare className="text-emerald-500" size={24} />
                <h2 className="text-xl font-bold">WhatsApp Reminder</h2>
              </div>
              <button onClick={() => setIsWaReminderModalOpen(false)} className="text-muted-foreground hover:text-foreground">
                <X size={24} />
              </button>
            </div>
            
            <div className="p-6 space-y-4">
              {/* Recipient Details */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-muted-foreground mb-1">Recipient Name</label>
                  <input
                    type="text"
                    value={waReminderName}
                    onChange={(e) => setWaReminderName(e.target.value)}
                    placeholder="e.g. Abc Person"
                    className="w-full bg-muted border-none rounded-xl p-3 text-xs outline-none focus:ring-2 focus:ring-primary"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-muted-foreground mb-1">Phone Number</label>
                  <input
                    type="text"
                    value={waReminderPhone}
                    onChange={(e) => setWaReminderPhone(e.target.value)}
                    placeholder="e.g. 923001234567"
                    className="w-full bg-muted border-none rounded-xl p-3 text-xs outline-none focus:ring-2 focus:ring-primary"
                    required
                  />
                </div>
              </div>

              {/* Send Method Toggle */}
              <div className="space-y-1">
                <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Send Method</label>
                <div className="flex p-1 bg-muted rounded-xl">
                  <button
                    type="button"
                    onClick={() => setSendMethod('direct')}
                    className={`flex-1 py-1.5 text-xs font-bold rounded-lg transition-all ${sendMethod === 'direct' ? 'bg-card shadow-sm text-emerald-500' : 'text-muted-foreground'}`}
                  >
                    Direct (Auto)
                  </button>
                  <button
                    type="button"
                    onClick={() => setSendMethod('manual')}
                    className={`flex-1 py-1.5 text-xs font-bold rounded-lg transition-all ${sendMethod === 'manual' ? 'bg-card shadow-sm text-muted-foreground' : 'text-muted-foreground'}`}
                  >
                    WhatsApp Web (Manual)
                  </button>
                </div>
              </div>

              {/* Direct Send Settings (Account Picker) */}
              {sendMethod === 'direct' && (
                <div className="p-3 bg-muted/30 border border-border rounded-2xl space-y-3 animate-in slide-in-from-top-2 duration-200">
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Send From Account</label>
                    <select
                      value={selectedWaAccountId}
                      onChange={(e) => setSelectedWaAccountId(e.target.value)}
                      className="w-full bg-background border border-border rounded-xl px-3 py-2 text-xs outline-none focus:ring-1 focus:ring-primary font-medium"
                    >
                      <option value="account1">Primary Account</option>
                      <option value="account2">Secondary Account</option>
                      <option value="account3">Work Account</option>
                    </select>
                  </div>

                  {/* Account Status Indicator */}
                  {(() => {
                    const activeAcc = waAccounts.find(a => a.id === selectedWaAccountId);
                    const isConnected = activeAcc?.status === 'connected';

                    return (
                      <div className="flex flex-col gap-2 pt-1">
                        <div className="flex items-center justify-between text-xs">
                          <span className="text-muted-foreground">Device Status:</span>
                          <span className={`font-bold uppercase tracking-wider text-[9px] px-2 py-0.5 rounded ${
                            isConnected ? 'bg-emerald-500/10 text-emerald-500' : 'bg-amber-500/10 text-amber-500'
                          }`}>
                            {isConnected ? 'Connected' : 'Action Required / Unlinked'}
                          </span>
                        </div>

                        {!isConnected && (
                          <div className="p-3 bg-amber-500/5 border border-amber-500/10 rounded-xl space-y-2">
                            <p className="text-[10px] text-amber-600 dark:text-amber-400 leading-normal font-medium animate-pulse">
                              This WhatsApp account is not linked as a device. Scan the QR code to pair it before sending.
                            </p>
                            <button
                              type="button"
                              onClick={() => {
                                setIsWaLinkModalOpen(true);
                              }}
                              className="w-full bg-amber-500 hover:bg-amber-600 text-white font-bold py-1.5 px-3 rounded-lg text-[10px] transition-colors"
                            >
                              Scan QR Code & Link Account
                            </button>
                          </div>
                        )}
                      </div>
                    );
                  })()}
                </div>
              )}

              {/* Message Input Box */}
              <div className="space-y-1">
                <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Reminder Message</label>
                <div className="relative">
                  <textarea
                    value={waReminderMessage}
                    onChange={(e) => setWaReminderMessage(e.target.value)}
                    className="w-full bg-muted border border-border rounded-2xl p-4 text-xs min-h-[160px] outline-none focus:ring-2 focus:ring-emerald-500 transition-all font-sans leading-relaxed"
                    placeholder="Type your message here..."
                  />
                  <div className="absolute bottom-4 right-4 opacity-10">
                    <Send size={36} className="text-emerald-500" />
                  </div>
                </div>
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  onClick={() => setIsWaReminderModalOpen(false)}
                  className="flex-1 bg-secondary text-secondary-foreground py-3.5 rounded-2xl font-bold hover:opacity-90 transition-opacity text-xs"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSendWhatsApp}
                  disabled={isSendingWa || (sendMethod === 'direct' && !(waAccounts.find(a => a.id === selectedWaAccountId)?.status === 'connected'))}
                  className="flex-2 px-6 bg-emerald-500 text-white py-3.5 rounded-2xl font-bold hover:opacity-90 transition-opacity flex items-center justify-center gap-2 disabled:opacity-50 text-xs shadow-md shadow-emerald-500/10"
                >
                  {isSendingWa ? (
                    <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></span>
                  ) : (
                    <Send size={14} />
                  )}
                  {sendMethod === 'direct' ? 'Send Direct (Auto)' : 'Open WhatsApp Web'}
                </button>
              </div>
              
              <p className="text-[9px] text-center text-muted-foreground leading-normal italic">
                {sendMethod === 'direct' 
                  ? 'Message will be delivered immediately through the linked device backend.' 
                  : 'This opens a new tab. You must manually click the send button inside WhatsApp.'}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* WhatsApp Scanner / Link Modal */}
      {isWaLinkModalOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-300">
          <div className="bg-card w-full max-w-md rounded-3xl p-6 border border-border shadow-2xl space-y-6 animate-in zoom-in duration-300 relative">
            <div className="flex justify-between items-center pb-4 border-b border-border">
              <div>
                <h2 className="text-lg font-bold">Link WhatsApp Account</h2>
                <p className="text-xs text-muted-foreground">
                  Connect {waAccounts.find(a => a.id === selectedWaAccountId)?.name || 'device'}
                </p>
              </div>
              <button 
                onClick={() => setIsWaLinkModalOpen(false)}
                className="p-2 text-muted-foreground hover:bg-muted rounded-full transition-colors"
              >
                <X size={20} />
              </button>
            </div>

            <div className="flex flex-col items-center justify-center p-4 space-y-4">
              {(() => {
                const active = waAccounts.find(a => a.id === selectedWaAccountId);
                if (!active) return null;

                if (active.status === 'qr' && active.qrCodeUrl) {
                  return (
                    <div className="flex flex-col items-center space-y-4">
                      <div className="bg-white p-4 rounded-2xl border border-border shadow-sm">
                        <img src={active.qrCodeUrl} alt="WhatsApp QR Code" className="w-56 h-56" />
                      </div>
                      <div className="text-center space-y-1">
                        <p className="text-xs font-bold text-foreground">
                          Scan this QR code with WhatsApp
                        </p>
                        <p className="text-[10px] text-muted-foreground leading-normal max-w-[280px]">
                          Open WhatsApp on your phone → Settings → Linked Devices → Scan. The system will automatically connect once scanned.
                        </p>
                      </div>
                    </div>
                  );
                }

                if (active.status === 'connecting') {
                  return (
                    <div className="py-8 text-center space-y-3">
                      <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto"></div>
                      <p className="text-xs text-muted-foreground">Connecting to WhatsApp servers...</p>
                    </div>
                  );
                }

                return (
                  <div className="py-8 text-center space-y-3">
                    <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto font-medium"></div>
                    <p className="text-xs text-muted-foreground">Generating QR pairing code...</p>
                  </div>
                );
              })()}
            </div>
            
            <div className="flex gap-2">
              <button
                onClick={() => setIsWaLinkModalOpen(false)}
                className="w-full bg-secondary text-secondary-foreground py-3 rounded-xl font-bold hover:opacity-90 transition-opacity text-xs"
              >
                Close Scanner
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Reminders;
