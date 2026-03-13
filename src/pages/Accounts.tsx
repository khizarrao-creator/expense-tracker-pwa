import React, { useEffect, useState } from 'react';
import { getSummaryByAccount, addAccount, deleteAccount, updateAccount } from '../db/queries';
import { Wallet, Landmark, Plus, Trash2, Edit2, Check, X } from 'lucide-react';
import { useCurrency } from '../contexts/CurrencyContext';
import { toast } from 'sonner';
import ConfirmModal from '../components/ConfirmModal';

const Accounts: React.FC = () => {
  const { formatAmount } = useCurrency();
  const [accounts, setAccounts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editBalance, setEditBalance] = useState('');
  
  const [deleteAccountInfo, setDeleteAccountInfo] = useState<{ id: string, name: string } | null>(null);

  const [newName, setNewName] = useState('');
  const [newType, setNewType] = useState('bank');
  const [newBalance, setNewBalance] = useState('0');

  useEffect(() => {
    loadAccounts();
  }, []);

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
      await addAccount(newName, newType, Number(newBalance));
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
        <h1 className="text-2xl font-bold">Bank Accounts</h1>
        <button
          onClick={() => setShowAddForm(!showAddForm)}
          className="bg-primary text-primary-foreground p-2 rounded-full shadow-lg hover:rotate-90 transition-transform"
        >
          <Plus size={24} />
        </button>
      </div>

      {showAddForm && (
        <div className="bg-card p-6 rounded-2xl border border-border shadow-sm animate-in fade-in slide-in-from-top-4">
          <h2 className="text-lg font-semibold mb-4">Add New Account</h2>
          <form onSubmit={handleAddAccount} className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-1">Account Name</label>
              <input
                type="text"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                className="w-full px-4 py-2 bg-background border border-border rounded-xl focus:ring-2 focus:ring-primary outline-none"
                placeholder="e.g. SadaPay, HBL"
                required
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium mb-1">Type</label>
                <select
                  value={newType}
                  onChange={(e) => setNewType(e.target.value)}
                  className="w-full px-4 py-2 bg-background border border-border rounded-xl outline-none"
                >
                  <option value="bank">Bank Account</option>
                  <option value="wallet">Mobile Wallet</option>
                  <option value="cash">Cash / Physical</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Initial Balance</label>
                <input
                  type="number"
                  value={newBalance}
                  onChange={(e) => setNewBalance(e.target.value)}
                  className="w-full px-4 py-2 bg-background border border-border rounded-xl focus:ring-2 focus:ring-primary outline-none"
                />
              </div>
            </div>
            <div className="flex gap-2 pt-2">
              <button type="submit" className="flex-1 bg-primary text-primary-foreground py-2 rounded-xl font-medium">Save Account</button>
              <button type="button" onClick={() => setShowAddForm(false)} className="px-4 py-2 text-muted-foreground">Cancel</button>
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

            return (
              <div key={acc.id} className="bg-card p-6 rounded-2xl border border-border hover:shadow-md transition-shadow relative group">
                <div className="flex items-start justify-between mb-4">
                  <div className={`p-3 rounded-xl ${acc.type === 'bank' ? 'bg-blue-500/10 text-blue-500' : 'bg-orange-500/10 text-orange-500'}`}>
                    {acc.type === 'bank' ? <Landmark size={24} /> : <Wallet size={24} />}
                  </div>
                  <div className="flex gap-2">
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
                  <h3 className="text-lg font-bold">{acc.name}</h3>
                  <p className="text-sm text-muted-foreground capitalize mb-2">{acc.type}</p>
                  <div className="flex items-baseline gap-1">
                    <span className="text-2xl font-black text-foreground">{formatAmount(currentBalance)}</span>
                  </div>
                </div>

                {isEditing && (
                  <div className="mt-4 p-3 bg-muted rounded-xl animate-in slide-in-from-bottom-2">
                    <label className="block text-[10px] font-bold uppercase text-muted-foreground mb-1">Set Initial Balance</label>
                    <div className="flex gap-2">
                      <input
                        type="number"
                        value={editBalance}
                        onChange={(e) => setEditBalance(e.target.value)}
                        className="flex-1 px-3 py-1 bg-background border border-border rounded-lg text-sm outline-none focus:ring-1 focus:ring-primary"
                        autoFocus
                      />
                      <button onClick={() => handleUpdateBalance(acc.id)} className="p-1 text-emerald-500 hover:bg-emerald-500/10 rounded-lg"><Check size={18} /></button>
                      <button onClick={() => setEditingId(null)} className="p-1 text-muted-foreground hover:bg-muted-foreground/10 rounded-lg"><X size={18} /></button>
                    </div>
                  </div>
                )}

                <div className="mt-4 pt-4 border-t border-border space-y-2">
                  <div className="flex justify-between text-xs font-medium">
                    <span className="text-muted-foreground">Flows</span>
                    <span className="text-foreground">{formatAmount(currentBalance - acc.initial_balance)}</span>
                  </div>
                  <div className="flex justify-between text-xs text-muted-foreground">
                    <span className="flex items-center gap-1 text-emerald-500"><Plus size={10} />Income & Transfers In</span>
                    <span>+{formatAmount(acc.income + acc.transfer_in)}</span>
                  </div>
                  <div className="flex justify-between text-xs text-muted-foreground">
                    <span className="flex items-center gap-1 text-destructive"><Plus size={10} className="rotate-45" />Expenses & Transfers Out</span>
                    <span>-{formatAmount(acc.expense + acc.transfer_out)}</span>
                  </div>
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
