import React, { useEffect, useState } from 'react';
import { getSummaryByAccount, addAccount, deleteAccount, updateAccount } from '../db/queries';
import { Wallet, Landmark, Plus, Trash2, Edit2, Check, X, Coins } from 'lucide-react';
import { useCurrency } from '../contexts/CurrencyContext';
import { toast } from 'sonner';
import ConfirmModal from '../components/ConfirmModal';
import { v4 as uuidv4 } from 'uuid';
import { useNavigate } from 'react-router-dom';

const Accounts: React.FC = () => {
  const { formatAmount, currencies, currency: globalCurrency } = useCurrency();
  const navigate = useNavigate();
  const [accounts, setAccounts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editBalance, setEditBalance] = useState('');
  
  // MEXC Integration
  const [mexcTotalValue, setMexcTotalValue] = useState<Record<string, number>>({});
  
  const [deleteAccountInfo, setDeleteAccountInfo] = useState<{ id: string, name: string } | null>(null);

  const [newName, setNewName] = useState('');
  const [newType, setNewType] = useState('bank');
  const [newBalance, setNewBalance] = useState('0');
  const [newCurrency, setNewCurrency] = useState(globalCurrency.code);

  useEffect(() => {
    loadAccounts();
    loadMexcData();
  }, []);

  const loadMexcData = async () => {
    const { getConfig, getMEXCData, fetchCryptoPrice } = await import('../db/queries');
    const key = await getConfig('mexc_api_key');
    const secret = await getConfig('mexc_api_secret');

    if (key && secret) {
      try {
        const data = await getMEXCData(key, secret);
        if (data && data.balances) {
          const balances = data.balances.filter((b: any) => parseFloat(b.free) > 0 || parseFloat(b.locked) > 0);
          
          let totalUSD = 0;
          for (const b of balances) {
            const amount = parseFloat(b.free) + parseFloat(b.locked);
            if (b.asset === 'USDT' || b.asset === 'USD') {
              totalUSD += amount;
            } else {
              const price = await fetchCryptoPrice(b.asset);
              if (price) {
                totalUSD += amount * price;
              }
            }
          }
          // Store the total value for accounts named 'MEXC'
          setMexcTotalValue({ 'MEXC': totalUSD });
        }
      } catch (e) {
        console.error('Failed to load MEXC data in Accounts', e);
      }
    }
  };

  const loadAccounts = async () => {
    setLoading(true);
    try {
      const data = await getSummaryByAccount();
      setAccounts(data);
    } catch (error) {
      console.error('Failed to load accounts:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleAddAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName) return;

    try {
      const accountId = uuidv4();
      await addAccount(newName, newType, Number(newBalance), null, accountId, newCurrency);

      setNewName('');
      setNewBalance('0');
      setShowAddForm(false);
      loadAccounts();
      toast.success('Account added successfully');
    } catch (error) {
      toast.error('Failed to add account');
    }
  };

  const handleDeleteAccount = async (id: string, name: string) => {
    setDeleteAccountInfo({ id, name });
  };

  const confirmDeleteAccount = async () => {
    if (!deleteAccountInfo) return;
    try {
      await deleteAccount(deleteAccountInfo.id);
      loadAccounts();
      toast.success('Account deleted successfully');
    } catch (error) {
      toast.error('Failed to delete account');
    } finally {
      setDeleteAccountInfo(null);
    }
  };

  const handleUpdateBalance = async (id: string) => {
    if (isNaN(Number(editBalance))) {
      toast.error('Please enter a valid balance');
      return;
    }
    try {
      await updateAccount(id, { initial_balance: Number(editBalance) });
      setEditingId(null);
      loadAccounts();
      toast.success('Initial balance updated');
    } catch (error) {
      toast.error('Failed to update balance');
    }
  };

  const getAccountIcon = (type: string) => {
    switch (type) {
      case 'bank': return <Landmark size={24} />;
      case 'crypto': return <Coins size={24} />;
      default: return <Wallet size={24} />;
    }
  };

  const getAccountColor = (type: string) => {
    switch (type) {
      case 'bank': return 'bg-blue-500/10 text-blue-500';
      case 'crypto': return 'bg-purple-500/10 text-purple-500';
      default: return 'bg-orange-500/10 text-orange-500';
    }
  };

  return (
    <div className="space-y-6">
      <ConfirmModal
        isOpen={deleteAccountInfo !== null}
        title="Delete Account"
        message={`Are you sure you want to delete ${deleteAccountInfo?.name}? This will not delete its transactions but they will be unlinked.`}
        onConfirm={confirmDeleteAccount}
        onCancel={() => setDeleteAccountInfo(null)}
        variant="danger"
        confirmText="Delete Account"
      />
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold tracking-tight">Bank Accounts & Wallets</h1>
        <button
          onClick={() => setShowAddForm(!showAddForm)}
          className="bg-primary text-primary-foreground p-2 rounded-full shadow-lg hover:rotate-90 transition-transform"
        >
          <Plus size={24} />
        </button>
      </div>

      {showAddForm && (
        <div className="bg-card p-6 rounded-2xl border border-border shadow-sm animate-in fade-in slide-in-from-top-4">
          <h2 className="text-lg font-bold mb-4">Add New Account</h2>
          <form onSubmit={handleAddAccount} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-black uppercase tracking-widest text-muted-foreground mb-1.5">Account Name</label>
                <input
                  type="text"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  className="w-full px-4 py-3 bg-muted/50 border border-transparent rounded-xl focus:bg-background focus:border-primary outline-none transition-all font-bold"
                  placeholder="e.g. SadaPay, MEXC Wallet"
                  required
                />
              </div>
              <div>
                <label className="block text-xs font-black uppercase tracking-widest text-muted-foreground mb-1.5">Account Type</label>
                <select
                  value={newType}
                  onChange={(e) => setNewType(e.target.value)}
                  className="w-full px-4 py-3 bg-muted/50 border border-transparent rounded-xl outline-none font-bold appearance-none"
                >
                  <option value="bank">Bank Account</option>
                  <option value="wallet">Mobile Wallet</option>
                  <option value="crypto">Crypto Wallet</option>
                  <option value="cash">Cash / Physical</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-black uppercase tracking-widest text-muted-foreground mb-1.5">Currency</label>
                <select
                  value={newCurrency}
                  onChange={(e) => setNewCurrency(e.target.value)}
                  className="w-full px-4 py-3 bg-muted/50 border border-transparent rounded-xl outline-none font-bold appearance-none"
                >
                  {currencies.map(c => (
                    <option key={c.code} value={c.code}>{c.code} ({c.symbol})</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-black uppercase tracking-widest text-muted-foreground mb-1.5">Initial Balance</label>
                <input
                  type="number"
                  value={newBalance}
                  onChange={(e) => setNewBalance(e.target.value)}
                  className="w-full px-4 py-3 bg-muted/50 border border-transparent rounded-xl focus:bg-background focus:border-primary outline-none transition-all font-bold"
                />
              </div>
            </div>

            <div className="flex gap-2 pt-2">
              <button type="submit" className="flex-1 bg-primary text-primary-foreground py-4 rounded-xl font-black text-sm uppercase tracking-widest hover:opacity-90 transition-opacity">Save Account</button>
              <button type="button" onClick={() => setShowAddForm(false)} className="px-6 py-4 text-muted-foreground font-bold text-sm uppercase tracking-widest">Cancel</button>
            </div>
          </form>
        </div>
      )}

      {loading ? (
        <div className="flex justify-center p-8">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {accounts.map((acc) => {
            const currentBalance = acc.initial_balance + (acc.income || 0) + (acc.transfer_in || 0) - (acc.expense || 0) - (acc.transfer_out || 0);
            const isEditing = editingId === acc.id;
            const accCurrency = currencies.find(c => c.code === acc.currency) || globalCurrency;

            return (
              <div key={acc.id} className="bg-card p-6 rounded-2xl border border-border hover:border-primary/50 transition-all relative group shadow-sm">
                <div className="flex items-start justify-between mb-4">
                  <div className={`p-3 rounded-xl ${getAccountColor(acc.type)}`}>
                    {getAccountIcon(acc.type)}
                  </div>
                  <div className="flex gap-1">
                    <button
                      onClick={() => {
                        setEditingId(acc.id);
                        setEditBalance(acc.initial_balance.toString());
                      }}
                      className="opacity-0 group-hover:opacity-100 p-2 text-muted-foreground hover:text-primary hover:bg-primary/10 rounded-lg transition-all"
                    >
                      <Edit2 size={16} />
                    </button>
                    <button
                      onClick={() => handleDeleteAccount(acc.id, acc.name)}
                      className="opacity-0 group-hover:opacity-100 p-2 text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded-lg transition-all"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <h3 className="text-lg font-black tracking-tight leading-none">{acc.name}</h3>
                    <span className="text-[10px] font-black uppercase tracking-widest bg-muted px-2 py-0.5 rounded text-muted-foreground">
                      {acc.currency}
                    </span>
                    {acc.name.toLowerCase().includes('mexc') && (
                      <span className="flex items-center gap-1 text-[8px] font-bold text-emerald-500 uppercase tracking-tighter bg-emerald-500/10 px-1.5 py-0.5 rounded animate-pulse">
                        Live API Linked
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground font-bold uppercase tracking-wider mb-3">{acc.type}</p>
                  <div className="flex items-baseline gap-1">
                    <span className="text-2xl font-black text-foreground">
                      {acc.name.toLowerCase().includes('mexc') && mexcTotalValue['MEXC'] !== undefined 
                        ? formatAmount(mexcTotalValue['MEXC'], accCurrency.symbol, 2)
                        : formatAmount(currentBalance, accCurrency.symbol, acc.type === 'crypto' ? 8 : 2)
                      }
                    </span>
                    {acc.name.toLowerCase().includes('mexc') && mexcTotalValue['MEXC'] !== undefined && (
                      <span className="text-[10px] text-muted-foreground font-medium ml-1">
                        (Live)
                      </span>
                    )}
                  </div>
                </div>

                {isEditing && (
                  <div className="mt-4 p-4 bg-muted/50 rounded-2xl animate-in slide-in-from-bottom-2">
                    <label className="block text-[10px] font-black uppercase tracking-widest text-muted-foreground mb-2">Set Initial Balance</label>
                    <div className="flex gap-2">
                      <input
                        type="number"
                        value={editBalance}
                        onChange={(e) => setEditBalance(e.target.value)}
                        className="flex-1 px-4 py-2 bg-background border-2 border-transparent rounded-xl text-sm outline-none focus:border-primary font-bold"
                        autoFocus
                      />
                      <button onClick={() => handleUpdateBalance(acc.id)} className="p-2 text-emerald-500 hover:bg-emerald-500/10 rounded-xl transition-colors"><Check size={20} /></button>
                      <button onClick={() => setEditingId(null)} className="p-2 text-muted-foreground hover:bg-muted-foreground/10 rounded-xl transition-colors"><X size={20} /></button>
                    </div>
                  </div>
                )}

                <div className="mt-4 pt-4 border-t border-border space-y-2">
                  <div className="flex justify-between text-xs font-bold uppercase tracking-wider">
                    <span className="text-muted-foreground">Net Flow</span>
                    <span className={currentBalance - acc.initial_balance >= 0 ? 'text-emerald-500' : 'text-destructive'}>
                      {formatAmount(currentBalance - acc.initial_balance, accCurrency.symbol)}
                    </span>
                  </div>
                  <div className="flex justify-between text-[11px] font-medium text-muted-foreground">
                    <span className="flex items-center gap-1"><Plus size={10} className="text-emerald-500" />Income / In</span>
                    <span>{formatAmount(acc.income + acc.transfer_in, accCurrency.symbol)}</span>
                  </div>
                  <div className="flex justify-between text-[11px] font-medium text-muted-foreground">
                    <span className="flex items-center gap-1"><X size={10} className="text-destructive" />Expense / Out</span>
                    <span>{formatAmount(acc.expense + acc.transfer_out, accCurrency.symbol)}</span>
                  </div>
                </div>

                <div className="mt-6 flex gap-2">
                  <button 
                    onClick={() => navigate(`/transactions?account=${acc.id}`)}
                    className="flex-1 py-3 bg-muted hover:bg-primary hover:text-primary-foreground rounded-xl font-black uppercase tracking-widest transition-all text-[10px] border border-transparent active:scale-[0.98]"
                  >
                    View Activity Ledger
                  </button>
                  {acc.name.toLowerCase().includes('mexc') && (
                    <button 
                      onClick={() => navigate(`/mexc-details/${acc.id}`)}
                      className="flex-1 py-3 bg-primary/10 text-primary hover:bg-primary hover:text-primary-foreground rounded-xl font-black uppercase tracking-widest transition-all text-[10px] border border-transparent active:scale-[0.98]"
                    >
                      View API Details
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default Accounts;
