import React, { useState, useEffect } from 'react';
import { getTransactions } from '../db/queries';
import { runWithBindings } from '../db/sqlite';
import { Download, Trash2, Moon, Sun, Monitor } from 'lucide-react';

const Settings: React.FC = () => {
  const [theme, setTheme] = useState<'light' | 'dark' | 'system'>('system');

  useEffect(() => {
    const savedTheme = localStorage.getItem('theme') || 'system';
    setTheme(savedTheme as any);
  }, []);

  const handleThemeChange = (newTheme: 'light' | 'dark' | 'system') => {
    setTheme(newTheme);
    localStorage.setItem('theme', newTheme);
    
    if (newTheme === 'dark') {
      document.documentElement.classList.add('dark');
    } else if (newTheme === 'light') {
      document.documentElement.classList.remove('dark');
    } else {
      // System
      if (window.matchMedia('(prefers-color-scheme: dark)').matches) {
        document.documentElement.classList.add('dark');
      } else {
        document.documentElement.classList.remove('dark');
      }
    }
  };

  const exportData = async () => {
    try {
      const data = await getTransactions(10000);
      const csv = [
        ['ID', 'Type', 'Amount', 'Category', 'Description', 'Date', 'Payment Method', 'Created At'],
        ...data.map(t => [
          t.id, t.type, t.amount, t.category, t.description, t.date, t.payment_method, t.created_at
        ])
      ].map(e => e.join(',')).join('\n');

      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.setAttribute('href', url);
      link.setAttribute('download', `expense_tracker_export_${new Date().toISOString().split('T')[0]}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (error) {
      console.error('Failed to export', error);
      alert('Export failed.');
    }
  };

  const clearLocalDatabase = async () => {
    if (window.confirm('WARNING: Are you sure you want to clear your local database? Make sure your data is synced or exported!')) {
      if (window.prompt('Type "DELETE" to confirm.') === 'DELETE') {
        try {
          // In wa-sqlite, just truncating tables is easiest
          await runWithBindings('DELETE FROM transactions');
          await runWithBindings('DELETE FROM categories');
          alert('Local database cleared successfully.');
          window.location.reload();
        } catch (error) {
          console.error(error);
          alert('Failed to clear database');
        }
      }
    }
  };

  return (
    <div className="max-w-xl mx-auto space-y-8">
      <h1 className="text-2xl font-bold">Settings</h1>

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
        <h2 className="text-lg font-semibold mb-4 border-b border-border pb-4">Data Management</h2>
        
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
