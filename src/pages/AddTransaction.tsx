import React, { useState, useEffect } from 'react';
import { addTransaction, getTransaction, updateTransaction, getCategories, getAccounts } from '../db/queries';
import type { Category, Account } from '../db/queries';
import { useNavigate, useParams } from 'react-router-dom';
import { Landmark } from 'lucide-react';
import { useCurrency } from '../contexts/CurrencyContext';
import { toast } from 'sonner';
import { syncManager } from '../db/SyncManager';
import { v4 as uuidv4 } from 'uuid';

const AddTransaction: React.FC = () => {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const { currency } = useCurrency();

  const [categories, setCategories] = useState<Category[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);

  const [type, setType] = useState<'income' | 'expense' | 'transfer'>('expense');
  const [amount, setAmount] = useState('');
  const [category, setCategory] = useState('');
  const [description, setDescription] = useState('');
  const [date, setDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [paymentMethod, setPaymentMethod] = useState('Debit Card');
  const [accountId, setAccountId] = useState('');
  const [toAccountId, setToAccountId] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const loadInitialData = async () => {
      const [cats, accs] = await Promise.all([
        getCategories(type === 'transfer' ? undefined : type), 
        getAccounts()
      ]);
      setCategories(cats);
      setAccounts(accs);

      // Only set initial bank/account if not already set or editing
      if (!id) {
        if (accs.length > 0 && !accountId) setAccountId(accs[0].id);
        if (accs.length > 1 && !toAccountId) setToAccountId(accs[1].id);
        if (cats.length > 0) setCategory(cats[0].name);
      }

      if (id) {
        setLoading(true);
        const trx = await getTransaction(id);
        if (trx) {
          setType(trx.type);
          setAmount(trx.amount.toString());
          setCategory(trx.category);
          setDescription(trx.description || '');
          setDate(trx.date);
          setPaymentMethod(trx.payment_method);
          setAccountId(trx.account_id || '');
          setToAccountId(trx.to_account_id || '');
        }
        setLoading(false);
      }
    };
    loadInitialData();
  }, [id, type]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!amount || isNaN(Number(amount)) || Number(amount) <= 0) {
      toast.error('Please enter a valid amount');
      return;
    }

    if (type === 'transfer' && (!accountId || !toAccountId)) {
      toast.error('Please select both accounts for the transfer');
      return;
    }

    if (type === 'transfer' && accountId === toAccountId) {
      toast.error('Source and destination accounts must be different');
      return;
    }

    try {
      const trxId = id || uuidv4();
      const now = new Date().toISOString();
      const deviceId = localStorage.getItem('deviceId') || 'unknown';
      
      const trxData = {
        id: trxId,
        type,
        amount: Number(amount),
        category: type === 'transfer' ? 'Transfer' : category,
        description,
        date,
        payment_method: paymentMethod,
        account_id: accountId || null,
        to_account_id: type === 'transfer' ? toAccountId : null,
        created_at: now,
        updated_at: now,
        deviceId
      };

      if (id) {
        await syncManager.performOperation('transaction_update', trxData, () => 
          updateTransaction(id, trxData)
        );
      } else {
        await syncManager.performOperation('transaction_add', trxData, () => 
          addTransaction(
            trxData.type,
            trxData.amount,
            trxData.category,
            trxData.description,
            trxData.date,
            trxData.payment_method,
            trxData.account_id,
            trxData.to_account_id,
            trxData.id
          )
        );
      }
      toast.success(id ? 'Transaction updated successfully' : 'Transaction saved successfully');
      navigate('/transactions');
    } catch (error) {
      console.error('Failed to save transaction', error);
      toast.error('Failed to save transaction');
    }
  };

  if (loading) return <div className="text-center py-10">Loading transaction...</div>;


  return (
    <div className="max-w-md mx-auto space-y-6">
      <h1 className="text-2xl font-bold">{id ? 'Edit' : 'Add'} Transaction</h1>

      <div className="bg-card p-6 rounded-2xl shadow-sm border border-border">
        <div className="flex bg-muted p-1 rounded-xl mb-6">
          <button
            type="button"
            onClick={() => setType('expense')}
            className={`flex-1 py-2 text-sm font-medium rounded-lg transition-colors ${type === 'expense' ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
              }`}
          >
            Expense
          </button>
          <button
            type="button"
            onClick={() => setType('income')}
            className={`flex-1 py-2 text-sm font-medium rounded-lg transition-colors ${type === 'income' ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
              }`}
          >
            Income
          </button>
          <button
            type="button"
            onClick={() => setType('transfer')}
            className={`flex-1 py-2 text-sm font-medium rounded-lg transition-colors ${type === 'transfer' ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
              }`}
          >
            Transfer
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-muted-foreground mb-1">Amount</label>
            <div className="relative">
              <span className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground font-medium">{currency.symbol}</span>
              <input
                type="number"
                step="0.01"
                placeholder="0.00"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="w-full pl-8 pr-4 py-3 bg-background border border-border rounded-xl focus:outline-none focus:ring-2 focus:ring-primary text-xl font-medium"
                required
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            {type !== 'transfer' ? (
              <div>
                <label className="block text-sm font-medium text-muted-foreground mb-1">Category</label>
                <select
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  className="w-full px-4 py-3 bg-background border border-border rounded-xl focus:outline-none focus:ring-2 focus:ring-primary"
                  required
                >
                  {categories.map((c) => (
                    <option key={c.id} value={c.name}>{c.name}</option>
                  ))}
                </select>
              </div>
            ) : (
              <div>
                <label className="block text-sm font-medium text-muted-foreground mb-1">Date</label>
                <input
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  className="w-full px-4 py-3 bg-background border border-border rounded-xl focus:outline-none focus:ring-2 focus:ring-primary"
                  required
                />
              </div>
            )}
            {type !== 'transfer' && (
              <div>
                <label className="block text-sm font-medium text-muted-foreground mb-1">Date</label>
                <input
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  className="w-full px-4 py-3 bg-background border border-border rounded-xl focus:outline-none focus:ring-2 focus:ring-primary"
                  required
                />
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-muted-foreground mb-1">
                {type === 'transfer' ? 'From Account' : 'Account / Bank'}
              </label>
              <div className="relative">
                <select
                  value={accountId}
                  onChange={(e) => setAccountId(e.target.value)}
                  className="w-full pl-10 pr-4 py-3 bg-background border border-border rounded-xl focus:outline-none focus:ring-2 focus:ring-primary appearance-none"
                >
                  <option value="">No Account</option>
                  {accounts.map((acc) => (
                    <option key={acc.id} value={acc.id}>{acc.name}</option>
                  ))}
                </select>
                <div className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                  <Landmark size={18} />
                </div>
              </div>
            </div>

            {type === 'transfer' && (
              <div>
                <label className="block text-sm font-medium text-muted-foreground mb-1">To Account</label>
                <div className="relative">
                  <select
                    value={toAccountId}
                    onChange={(e) => setToAccountId(e.target.value)}
                    className="w-full pl-10 pr-4 py-3 bg-background border border-border rounded-xl focus:outline-none focus:ring-2 focus:ring-primary appearance-none"
                  >
                    <option value="">Select Destination</option>
                    {accounts.map((acc) => (
                      <option key={acc.id} value={acc.id}>{acc.name}</option>
                    ))}
                  </select>
                  <div className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                    <Landmark size={18} />
                  </div>
                </div>
              </div>
            )}
          </div>

          {type !== 'transfer' && (
            <div>
              <label className="block text-sm font-medium text-muted-foreground mb-1">Payment Method</label>
              <div className="flex flex-wrap gap-2">
                {['Cash', 'Debit Card', 'Credit Card', 'Bank Transfer'].map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => setPaymentMethod(m)}
                    className={`px-3 py-2 rounded-lg text-sm transition-all border ${paymentMethod === m
                        ? 'bg-primary/10 border-primary text-primary font-medium'
                        : 'bg-background border-border text-muted-foreground hover:bg-muted'
                      }`}
                  >
                    {m}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-muted-foreground mb-1">Description</label>
            <input
              type="text"
              placeholder={type === 'transfer' ? 'Internal transfer' : 'What was this for?'}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full px-4 py-3 bg-background border border-border rounded-xl focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </div>

          <div className="pt-4">
            <button
              type="submit"
              className="w-full bg-primary text-primary-foreground py-3 rounded-xl font-semibold hover:bg-primary/90 transition-colors shadow-md active:scale-[0.98]"
            >
              {id ? 'Update' : 'Save'} {type === 'transfer' ? 'Transfer' : 'Transaction'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default AddTransaction;

