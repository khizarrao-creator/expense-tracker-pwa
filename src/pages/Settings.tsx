import React, { useState, useEffect } from 'react';
import { getTransactions } from '../db/queries';
import { runWithBindings } from '../db/sqlite';
import { Download, Trash2, Moon, Sun, Monitor, CloudSync } from 'lucide-react';
import { useCurrency } from '../contexts/CurrencyContext';
import { useTheme } from '../contexts/ThemeContext';
import { useSync } from '../contexts/SyncContext';
import { toast } from 'sonner';
import ConfirmModal from '../components/ConfirmModal';

const Settings: React.FC = () => {
  const { currency, setCurrency, currencies } = useCurrency();
  const { theme, setTheme } = useTheme();
  const { forceSync, isSyncing, lastSynced } = useSync();
  const [showClearConfirm, setShowClearConfirm] = useState(false);

  const handleThemeChange = (newTheme: 'light' | 'dark' | 'system') => {
    setTheme(newTheme);
    toast.success(`${newTheme.charAt(0).toUpperCase() + newTheme.slice(1)} theme applied`);
  };

  const exportData = async () => {
    try {
      const data = await getTransactions(10000);
      const csv = [
        ['ID', 'Type', 'Amount', 'Category', 'Description', 'Date', 'Bank/Account', 'Payment Method', 'Created At'],
        ...data.map(t => [
          t.id, t.type, t.amount, t.category, t.description, t.date, t.account_name || 'N/A', t.payment_method, t.created_at
        ])
      ].map(row => row.map(cell => `"${cell}"`).join(',')).join('\n');

      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.setAttribute('href', url);
      link.setAttribute('download', `expense_tracker_export_${new Date().toISOString().split('T')[0]}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      toast.success('Data exported successfully');
    } catch (error) {
      console.error('Failed to export', error);
      toast.error('Export failed');
    }
  };

  const clearLocalDatabase = () => {
    setShowClearConfirm(true);
  };

  const confirmClearDatabase = async () => {
    try {
      await runWithBindings('DELETE FROM transactions');
      await runWithBindings('DELETE FROM accounts');
      await runWithBindings('DELETE FROM categories');
      toast.success('Database cleared. Reloading...');
      setTimeout(() => {
        window.location.reload();
      }, 1500);
    } catch (error) {
      console.error(error);
      toast.error('Failed to clear database');
    } finally {
      setShowClearConfirm(false);
    }
  };

  return (
    <div className="max-w-xl mx-auto space-y-8">
      <h1 className="text-2xl font-bold">Settings</h1>

      <ConfirmModal
        isOpen={showClearConfirm}
        title="Clear Database?"
        message="WARNING: This will permanently erase ALL local data including transactions, accounts, and custom categories. This cannot be undone."
        onConfirm={confirmClearDatabase}
        onCancel={() => setShowClearConfirm(false)}
        variant="danger"
        confirmText="Clear Everything"
      />

      <div className="bg-card p-6 rounded-2xl shadow-sm border border-border">
        <h2 className="text-lg font-semibold mb-4 border-b border-border pb-4">Currency</h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {currencies.map((c) => (
            <button
              key={c.code}
              onClick={() => {
                setCurrency(c.code);
                toast.success(`Currency changed to ${c.code}`);
              }}
              className={`flex flex-col items-center justify-center p-4 rounded-xl border-2 transition-all ${
                currency.code === c.code ? 'border-primary bg-primary/5 text-primary' : 'border-border text-muted-foreground hover:bg-muted'
              }`}
            >
              <span className="text-xl font-bold mb-1">{c.symbol}</span>
              <span className="text-xs font-medium uppercase">{c.code}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="bg-card p-6 rounded-2xl shadow-sm border border-border">
        <h2 className="text-lg font-semibold mb-4 border-b border-border pb-4">Appearance</h2>
        <div className="grid grid-cols-3 gap-3">
          <button
            onClick={() => handleThemeChange('light')}
            className={`flex flex-col items-center justify-center p-4 rounded-xl border-2 transition-all ${
              theme === 'light' ? 'border-primary bg-primary/5 text-primary' : 'border-border text-muted-foreground hover:bg-muted'
            }`}
          >
            <Sun size={24} className="mb-2" />
            <span className="font-medium">Light</span>
          </button>
          
          <button
            onClick={() => handleThemeChange('dark')}
            className={`flex flex-col items-center justify-center p-4 rounded-xl border-2 transition-all ${
              theme === 'dark' ? 'border-primary bg-primary/5 text-primary' : 'border-border text-muted-foreground hover:bg-muted'
            }`}
          >
            <Moon size={24} className="mb-2" />
            <span className="font-medium">Dark</span>
          </button>

          <button
            onClick={() => handleThemeChange('system')}
            className={`flex flex-col items-center justify-center p-4 rounded-xl border-2 transition-all ${
              theme === 'system' ? 'border-primary bg-primary/5 text-primary' : 'border-border text-muted-foreground hover:bg-muted'
            }`}
          >
            <Monitor size={24} className="mb-2" />
            <span className="font-medium">System</span>
          </button>
        </div>
      </div>

      <div className="bg-card p-6 rounded-2xl shadow-sm border border-border">
        <h2 className="text-lg font-semibold mb-4 border-b border-border pb-4">Account & Sync</h2>
        
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-medium text-foreground">Synchronize Data</h3>
              <p className="text-sm text-muted-foreground">
                Last synced: {lastSynced ? lastSynced.toLocaleTimeString() : 'Never'}
              </p>
            </div>
            <button
              onClick={forceSync}
              disabled={isSyncing}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-all ${
                isSyncing 
                  ? 'bg-muted text-muted-foreground' 
                  : 'bg-primary/10 text-primary hover:bg-primary/20'
              }`}
            >
              <CloudSync size={18} className={isSyncing ? 'animate-spin' : ''} />
              {isSyncing ? 'Syncing...' : 'Sync Now'}
            </button>
          </div>
        </div>
      </div>

      <div className="bg-card p-6 rounded-2xl shadow-sm border border-border">
        
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-medium text-foreground">Export Data</h3>
              <p className="text-sm text-muted-foreground">Download all your transactions as a CSV file</p>
            </div>
            <button
              onClick={exportData}
              className="flex items-center gap-2 px-4 py-2 bg-primary/10 text-primary font-medium rounded-lg hover:bg-primary/20 transition-colors"
            >
              <Download size={18} />
              Export
            </button>
          </div>

          <div className="pt-4 border-t border-border flex items-center justify-between">
            <div>
              <h3 className="font-medium text-destructive">Clear Local Database</h3>
              <p className="text-sm text-muted-foreground">Erase all transactions and categories locally</p>
            </div>
            <button
              onClick={clearLocalDatabase}
              className="flex items-center gap-2 px-4 py-2 bg-destructive/10 text-destructive font-medium rounded-lg hover:bg-destructive/20 transition-colors"
            >
              <Trash2 size={18} />
              Clear
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Settings;
