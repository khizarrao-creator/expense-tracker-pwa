import React, { useEffect, useState } from 'react';
import { getTransactions, deleteTransaction } from '../db/queries';
import type { Transaction } from '../db/queries';
import { Search, Filter, Trash2, Edit2, TrendingUp, TrendingDown, Landmark, Plus } from 'lucide-react';
import { format } from 'date-fns';
import { useNavigate } from 'react-router-dom';
import { useCurrency } from '../contexts/CurrencyContext';
import ConfirmModal from '../components/ConfirmModal';
import { toast } from 'sonner';

const Transactions: React.FC = () => {
  const navigate = useNavigate();
  const { formatAmount } = useCurrency();
  const [transactions, setTransactions] = useState<(Transaction & { account_name?: string, to_account_name?: string })[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterType, setFilterType] = useState<'all' | 'income' | 'expense' | 'transfer'>('all');
  
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
      const data = await getTransactions(100);
      setTransactions(data);
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

  const filteredTransactions = transactions.filter(t => {
    const matchesSearch =
      t.description?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      t.category.toLowerCase().includes(searchTerm.toLowerCase()) ||
      t.account_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      t.to_account_name?.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesType = filterType === 'all' || t.type === filterType;
    return matchesSearch && matchesType;
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

        <div className="flex items-center gap-2">
          <Filter className="text-muted-foreground" size={20} />
          <select
            className="bg-card border border-border rounded-xl px-4 py-2 focus:outline-none focus:ring-2 focus:ring-primary appearance-none pr-8 relative"
            value={filterType}
            onChange={(e) => setFilterType(e.target.value as any)}
          >
            <option value="all">All Types</option>
            <option value="income">Income Only</option>
            <option value="expense">Expense Only</option>
            <option value="transfer">Transfers Only</option>
          </select>
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
            <div key={trx.id} className={`bg-card p-4 rounded-xl border border-border flex items-center justify-between hover:shadow-md transition-shadow group ${trx.synced === 0 ? 'opacity-60' : ''}`}>
              <div className="flex items-center gap-4">
                <div className={`p-3 rounded-full ${trx.type === 'income' ? 'bg-emerald-500/10 text-emerald-500' :
                    trx.type === 'transfer' ? 'bg-blue-500/10 text-blue-500' :
                      'bg-destructive/10 text-destructive'
                  }`}>
                  {trx.type === 'income' ? <TrendingUp size={24} /> : trx.type === 'transfer' ? <Landmark size={24} /> : <TrendingDown size={24} />}
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="font-semibold text-foreground">{trx.description || trx.category}</h3>
                    {trx.synced === 0 && (
                      <span className="text-[10px] bg-muted px-1.5 py-0.5 rounded text-muted-foreground animate-pulse">Syncing...</span>
                    )}
                  </div>
                  <div className="flex items-center flex-wrap gap-2 text-xs text-muted-foreground">
                    <span className="capitalize">{trx.type === 'transfer' ? 'Bank Transfer' : trx.category}</span>
                    <span>•</span>
                    <span>{format(new Date(trx.date), 'MMM d, yyyy')}</span>
                    {trx.account_name && (
                      <>
                        <span>•</span>
                        <span className="flex items-center gap-1 bg-muted px-1.5 py-0.5 rounded text-foreground/70">
                          <Landmark size={10} />
                          {trx.account_name}
                          {trx.type === 'transfer' && trx.to_account_name && (
                            <>
                              <Plus size={10} className="mx-0.5 rotate-45" />
                              {trx.to_account_name}
                            </>
                          )}
                        </span>
                      </>
                    )}
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2 md:gap-4">
                <span className={`font-bold text-lg mr-2 ${trx.type === 'income' ? 'text-emerald-500' :
                    trx.type === 'transfer' ? 'text-blue-500' :
                      'text-foreground'
                  }`}>
                  {trx.type === 'income' ? '+' : trx.type === 'transfer' ? '⇄' : '-'}{formatAmount(trx.amount)}
                </span>
                <div className="flex opacity-0 group-hover:opacity-100 transition-opacity">
                  <button
                    onClick={() => navigate(`/edit/${trx.id}`)}
                    className="p-2 text-muted-foreground hover:text-primary hover:bg-primary/10 rounded-lg transition-colors"
                    title="Edit"
                  >
                    <Edit2 size={18} />
                  </button>
                  <button
                    onClick={() => handleDelete(trx.id)}
                    className="p-2 text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded-lg transition-colors"
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

