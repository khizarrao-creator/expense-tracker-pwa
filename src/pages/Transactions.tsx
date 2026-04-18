import React, { useEffect, useState } from 'react';
import { getTransactions, deleteTransaction, getSummaryByAccount, getCategories } from '../db/queries';
import type { Transaction } from '../db/queries';
import { Search, Filter, Trash2, Edit2, TrendingUp, TrendingDown, Landmark, Plus, Tag, Calendar } from 'lucide-react';
import { format } from 'date-fns';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useCurrency } from '../contexts/CurrencyContext';
import ConfirmModal from '../components/ConfirmModal';
import { toast } from 'sonner';

const Transactions: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const initialAccountFilter = searchParams.get('account') || 'all';

  const { formatAmount } = useCurrency();
  const [transactions, setTransactions] = useState<(Transaction & { account_name?: string, to_account_name?: string })[]>([]);
  const [accounts, setAccounts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterType, setFilterType] = useState<'all' | 'income' | 'expense' | 'transfer'>('all');
  const [filterAccount, setFilterAccount] = useState<string>(initialAccountFilter);
  const [filterCategory, setFilterCategory] = useState<string>('all');
  const [categories, setCategories] = useState<any[]>([]);
  const [fromDate, setFromDate] = useState<string>('');
  const [toDate, setToDate] = useState<string>('');
  const [deleteId, setDeleteId] = useState<string | null>(null);

  useEffect(() => {
    loadTransactions();

    const handleSyncComplete = () => {
      loadTransactions();
    };

    window.addEventListener('app-sync-complete', handleSyncComplete);
    return () => {
      window.removeEventListener('app-sync-complete', handleSyncComplete);
    };
  }, []);

  const loadTransactions = async () => {
    setLoading(true);
    try {
      const [txData, accData, catData] = await Promise.all([
        getTransactions(100),
        getSummaryByAccount(),
        getCategories(undefined, 'all')
      ]);
      setTransactions(txData);
      setAccounts(accData);
      setCategories(catData);
    } catch (error) {
      console.error('Failed to load transactions:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: string) => {
    setDeleteId(id);
  };

  const confirmDelete = async () => {
    if (!deleteId) return;
    try {
      await deleteTransaction(deleteId);
      setTransactions(transactions.filter(t => t.id !== deleteId));
      toast.success('Transaction deleted');
    } catch (e) {
      toast.error('Failed to delete transaction');
    } finally {
      setDeleteId(null);
    }
  };

  const handleAccountFilterChange = (accId: string) => {
    setFilterAccount(accId);
    if (accId === 'all') {
      searchParams.delete('account');
    } else {
      searchParams.set('account', accId);
    }
    setSearchParams(searchParams);
  };

  useEffect(() => {
    const accountParam = searchParams.get('account') || 'all';
    if (accountParam !== filterAccount) {
      setFilterAccount(accountParam);
    }
  }, [searchParams]);

  const filteredTransactions = transactions.filter(t => {
    const matchesSearch =
      t.description?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      t.category.toLowerCase().includes(searchTerm.toLowerCase()) ||
      t.account_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      t.to_account_name?.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesType = filterType === 'all' || t.type === filterType;
    const matchesAccount = filterAccount === 'all' || t.account_id === filterAccount || t.to_account_id === filterAccount;
    
    let matchesCategory = filterCategory === 'all';
    if (!matchesCategory) {
      if (filterCategory.includes(' > ')) {
        const [p, s] = filterCategory.split(' > ');
        matchesCategory = t.category === p && t.subcategory === s;
      } else {
        matchesCategory = t.category === filterCategory;
      }
    }

    const matchesFromDate = !fromDate || t.date >= fromDate;
    const matchesToDate = !toDate || t.date <= toDate;
    return matchesSearch && matchesType && matchesAccount && matchesCategory && matchesFromDate && matchesToDate;
  });

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Transactions</h1>

      <ConfirmModal
        isOpen={deleteId !== null}
        title="Delete Transaction"
        message="Are you sure you want to delete this transaction? This action cannot be undone."
        onConfirm={confirmDelete}
        onCancel={() => setDeleteId(null)}
        variant="danger"
        confirmText="Delete"
      />

      <div className="flex flex-col sm:flex-row gap-4 mb-6">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={20} />
          <input
            type="text"
            placeholder="Search descriptions, categories, or banks..."
            className="w-full pl-10 pr-4 py-2 bg-card border border-border rounded-xl focus:outline-none focus:ring-2 focus:ring-primary"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>

        <div className="flex items-center gap-2 overflow-x-auto pb-2 sm:pb-0">
          <div className="relative shrink-0">
            <Landmark className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={18} />
            <select
              className="bg-card border border-border rounded-xl pl-9 pr-8 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary appearance-none cursor-pointer"
              value={filterAccount}
              onChange={(e) => handleAccountFilterChange(e.target.value)}
            >
              <option value="all">All Accounts</option>
              {accounts.map(acc => (
                <option key={acc.id} value={acc.id}>{acc.name}</option>
              ))}
            </select>
          </div>

          <div className="relative shrink-0">
            <Filter className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={18} />
            <select
              className="bg-card border border-border rounded-xl pl-9 pr-8 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary appearance-none cursor-pointer"
              value={filterType}
              onChange={(e) => setFilterType(e.target.value as any)}
            >
              <option value="all">All Types</option>
              <option value="income">Income Only</option>
              <option value="expense">Expense Only</option>
              <option value="transfer">Transfers Only</option>
            </select>
          </div>

          <div className="relative shrink-0">
            <Tag className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={18} />
            <select
              className="bg-card border border-border rounded-xl pl-9 pr-8 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary appearance-none cursor-pointer"
              value={filterCategory}
              onChange={(e) => setFilterCategory(e.target.value)}
            >
              <option value="all">All Categories</option>
              {categories.filter(c => !c.parent_id).map(parent => (
                <React.Fragment key={parent.id}>
                  <option value={parent.name}>{parent.name}</option>
                  {categories
                    .filter(sub => sub.parent_id === parent.id)
                    .map(sub => (
                      <option key={sub.id} value={`${parent.name} > ${sub.name}`}>
                        &nbsp;&nbsp;{sub.name}
                      </option>
                    ))
                  }
                </React.Fragment>
              ))}
            </select>
          </div>

          <div className="relative shrink-0 flex items-center gap-2 bg-card border border-border rounded-xl px-3 py-1.5">
            <Calendar className="text-muted-foreground" size={18} />
            <div className="flex items-center gap-1">
              <input
                type="date"
                className="bg-transparent text-xs focus:outline-none cursor-pointer"
                value={fromDate}
                onChange={(e) => setFromDate(e.target.value)}
                placeholder="From"
              />
              <span className="text-muted-foreground text-xs">to</span>
              <input
                type="date"
                className="bg-transparent text-xs focus:outline-none cursor-pointer"
                value={toDate}
                onChange={(e) => setToDate(e.target.value)}
                placeholder="To"
              />
              {(fromDate || toDate) && (
                <button
                  onClick={() => { setFromDate(''); setToDate(''); }}
                  className="ml-1 text-muted-foreground hover:text-destructive"
                >
                  <Plus size={14} className="rotate-45" />
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center p-8">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
        </div>
      ) : filteredTransactions.length === 0 ? (
        <div className="text-center p-12 bg-card border border-border rounded-2xl text-muted-foreground">
          <p>No transactions found.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filteredTransactions.map((trx) => (
            <div key={trx.id} className={`bg-card p-4 rounded-xl border border-border flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-4 hover:shadow-md transition-shadow group ${trx.synced === 0 ? 'opacity-60' : ''}`}>
              <div className="flex items-start sm:items-center gap-3 md:gap-4 w-full sm:w-auto min-w-0">
                <div className={`shrink-0 p-3 rounded-full ${trx.type === 'income' ? 'bg-emerald-500/10 text-emerald-500' :
                  trx.type === 'transfer' ? 'bg-blue-500/10 text-blue-500' :
                    'bg-destructive/10 text-destructive'
                  }`}>
                  {trx.type === 'income' ? <TrendingUp size={24} /> : trx.type === 'transfer' ? <Landmark size={24} /> : <TrendingDown size={24} />}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <h3 className="font-semibold text-foreground truncate">{trx.description || trx.category}</h3>
                    {trx.synced === 0 && (
                      <span className="shrink-0 text-[10px] bg-muted px-1.5 py-0.5 rounded text-muted-foreground animate-pulse">Syncing...</span>
                    )}
                  </div>
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground mt-1">
                    <span className="capitalize">
                      {trx.type === 'transfer' ? 'Bank Transfer' : trx.subcategory ? `${trx.category} > ${trx.subcategory}` : trx.category}
                    </span>
                    <span className="hidden xs:inline">•</span>
                    <span>{format(new Date(trx.date), 'MMM d, yyyy')}</span>
                    {trx.account_name && (
                      <>
                        <span className="hidden xs:inline">•</span>
                        <span className="flex items-center gap-1 bg-muted px-1.5 py-0.5 rounded text-foreground/70 truncate max-w-[120px] xs:max-w-none">
                          <Landmark size={10} className="shrink-0" />
                          <span className="truncate">{trx.account_name}</span>
                          {trx.type === 'transfer' && trx.to_account_name && (
                            <>
                              <Plus size={10} className="mx-0.5 rotate-45 shrink-0" />
                              <span className="truncate">{trx.to_account_name}</span>
                            </>
                          )}
                        </span>
                      </>
                    )}
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-between sm:justify-end w-full sm:w-auto pt-3 sm:pt-0 border-t sm:border-0 border-border mt-2 sm:mt-0">
                <span className={`font-bold text-lg md:mr-2 ${trx.type === 'income' ? 'text-emerald-500' :
                  trx.type === 'transfer' ? 'text-blue-500' :
                    'text-foreground'
                  }`}>
                  {trx.type === 'income' ? '+' : trx.type === 'transfer' ? '⇄' : '-'}{formatAmount(trx.amount)}
                </span>
                <div className="flex sm:opacity-0 group-hover:opacity-100 transition-opacity gap-1">
                  <button
                    onClick={() => navigate(`/edit/${trx.id}`)}
                    className="p-2 text-muted-foreground hover:text-primary hover:bg-primary/10 rounded-lg transition-colors bg-muted sm:bg-transparent"
                    title="Edit"
                  >
                    <Edit2 size={18} />
                  </button>
                  <button
                    onClick={() => handleDelete(trx.id)}
                    className="p-2 text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded-lg transition-colors bg-muted sm:bg-transparent"
                    title="Delete"
                  >
                    <Trash2 size={18} />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default Transactions;

