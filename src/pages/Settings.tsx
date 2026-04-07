import React, { useState, useRef } from 'react';
import * as XLSX from 'xlsx';
import { getTransactions, exportAllData, importAllData, clearAllData } from '../db/queries';
import { Download, Moon, Sun, Monitor, CloudSync, FileJson, Upload, AlertTriangle, LayoutList, ChevronRight } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useCurrency } from '../contexts/CurrencyContext';
import { useTheme } from '../contexts/ThemeContext';
import { useSync } from '../contexts/SyncContext';
import { useAuth } from '../contexts/AuthContext';
import { toast } from 'sonner';
import { syncManager } from '../db/SyncManager';
import ConfirmModal from '../components/ConfirmModal';

const Settings: React.FC = () => {
  const { currency, setCurrency, currencies } = useCurrency();
  const navigate = useNavigate();
  const { theme, setTheme } = useTheme();
  const { forceSync, isSyncing, lastSynced } = useSync();
  const { signOut } = useAuth();
  
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [showMasterWipeConfirm, setShowMasterWipeConfirm] = useState(false);
  const [showImportConfirm, setShowImportConfirm] = useState(false);
  const [pendingImportData, setPendingImportData] = useState<any>(null);
  const [isWiping, setIsWiping] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleThemeChange = (newTheme: 'light' | 'dark' | 'system') => {
    setTheme(newTheme);
    toast.success(`${newTheme.charAt(0).toUpperCase() + newTheme.slice(1)} theme applied`);
  };

  const exportCSV = async () => {
    try {
      const data = await getTransactions(10000);
      
      const worksheetData = data.map(t => ({
        'ID': t.id,
        'Type': t.type,
        'Amount': t.amount,
        'Category': t.category,
        'Description': t.description,
        'Date': t.date,
        'Bank/Account': t.account_name || 'N/A',
        'Payment Method': t.payment_method,
        'Created At': t.created_at
      }));

      const worksheet = XLSX.utils.json_to_sheet(worksheetData);
      const csv = XLSX.utils.sheet_to_csv(worksheet);

      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.setAttribute('href', url);
      link.setAttribute('download', `expense_tracker_export_${new Date().toISOString().split('T')[0]}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      toast.success('CSV exported successfully');
    } catch (error) {
      console.error('Failed to export CSV', error);
      toast.error('CSV Export failed');
    }
  };

  const exportXLSX = async () => {
    try {
      const data = await getTransactions(10000);
      
      const worksheetData = data.map(t => ({
        'ID': t.id,
        'Type': t.type,
        'Amount': t.amount,
        'Category': t.category,
        'Description': t.description,
        'Date': t.date,
        'Bank/Account': t.account_name || 'N/A',
        'Payment Method': t.payment_method,
        'Created At': t.created_at
      }));

      const worksheet = XLSX.utils.json_to_sheet(worksheetData);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, 'Transactions');
      
      XLSX.writeFile(workbook, `expense_tracker_export_${new Date().toISOString().split('T')[0]}.xlsx`);
      toast.success('XLSX exported successfully');
    } catch (error) {
      console.error('Failed to export XLSX', error);
      toast.error('XLSX Export failed');
    }
  };

  const handleJsonExport = async () => {
    try {
      const data = await exportAllData();
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.setAttribute('href', url);
      link.setAttribute('download', `expense_tracker_backup_${new Date().toISOString().split('T')[0]}.json`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      toast.success('Backup created successfully');
      return true;
    } catch (error) {
      console.error('Failed to export JSON', error);
      toast.error('Backup failed');
      return false;
    }
  };

  const handleDataImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      toast.loading('Analyzing file...', { id: 'importProcess' });
      const extension = file.name.split('.').pop()?.toLowerCase();
      
      if (extension === 'json') {
        const text = await file.text();
        const data = JSON.parse(text);
        setPendingImportData(data);
      } else if (extension === 'csv' || extension === 'xlsx') {
        const dataBuffer = await file.arrayBuffer();
        const workbook = XLSX.read(dataBuffer, { type: 'array' });
        const firstSheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[firstSheetName];
        const json = XLSX.utils.sheet_to_json<any>(worksheet);
        
        const deviceId = localStorage.getItem('deviceId') || 'unknown';
        const transactions = json.map((row: any) => ({
          id: row['ID'] || crypto.randomUUID(),
          type: row['Type']?.toLowerCase() || 'expense',
          amount: parseFloat(row['Amount']) || 0,
          category: row['Category'] || 'Other',
          description: row['Description'] || '',
          date: row['Date'] || new Date().toISOString().split('T')[0],
          payment_method: row['Payment Method'] || '',
          created_at: row['Created At'] || new Date().toISOString(),
          updated_at: new Date().toISOString(),
          deviceId
        }));

        setPendingImportData({ transactions });
      } else {
        toast.dismiss('importProcess');
        toast.error('Unsupported file format');
        return;
      }
      
      toast.dismiss('importProcess');
      setShowImportConfirm(true);
    } catch (error) {
      console.error('Import failed', error);
      toast.dismiss('importProcess');
      toast.error('Invalid or corrupted file');
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const confirmImportData = async () => {
    if (!pendingImportData) return;
    try {
      await importAllData(pendingImportData);
      toast.success('Data imported successfully. Syncing...');
      forceSync();
      setTimeout(() => window.location.reload(), 2000);
    } catch (error) {
      console.error('Import failed', error);
      toast.error('Failed to import data');
    } finally {
      setPendingImportData(null);
      setShowImportConfirm(false);
    }
  };

  const handleMasterWipe = async () => {
    setIsWiping(true);
    try {
      // 1. Download Backup first as safety measure
      toast.loading('Creating emergency backup...');
      const backupSuccess = await handleJsonExport();
      if (!backupSuccess) {
         if (!confirm("Emergency backup failed. Do you want to proceed with deletion anyway?")) {
            setIsWiping(false);
            return;
         }
      }

      // 2. Wipe Remote (Firestore)
      toast.loading('Wiping cloud data...');
      await syncManager.wipeRemoteData();

      // 3. Wipe Local (SQLite)
      toast.loading('Wiping local database...');
      await clearAllData();

      toast.success('All data erased. Signing out...');
      setTimeout(async () => {
        await signOut();
        window.location.href = '/login';
      }, 2000);
    } catch (error) {
      console.error('Master wipe failed', error);
      toast.error('Failed to complete data wipe');
    } finally {
      setIsWiping(false);
      setShowMasterWipeConfirm(false);
    }
  };

  const confirmClearLocal = async () => {
    try {
      await clearAllData();
      toast.success('Local database cleared. Reloading...');
      setTimeout(() => window.location.reload(), 1500);
    } catch (error) {
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
        title="Clear Local Database?"
        message="This will permanently erase ALL local data. Cloud data will remain and will be re-downloaded next time you sync."
        onConfirm={confirmClearLocal}
        onCancel={() => setShowClearConfirm(false)}
        variant="danger"
        confirmText="Clear Local"
      />

      <ConfirmModal
        isOpen={showMasterWipeConfirm}
        title="ERASE ALL DATA EVERYWHERE?"
        message="CRITICAL WARNING: This will permanently delete your data from both this device AND the cloud server. We will download a backup for you before starting, but this action is otherwise irreversible."
        onConfirm={handleMasterWipe}
        onCancel={() => setShowMasterWipeConfirm(false)}
        variant="danger"
        confirmText="Yes, Wipe Everything"
      />

      <ConfirmModal
        isOpen={showImportConfirm}
        title="Import Backup Data?"
        message="This will merge the imported data with your existing records. Duplicate IDs will be overwritten. Proceed?"
        onConfirm={confirmImportData}
        onCancel={() => { setShowImportConfirm(false); setPendingImportData(null); }}
        variant="danger"
        confirmText="Import & Merge"
      />

      {/* Currency & Appearance sections remain same but with updated styles if needed */}
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
        <h2 className="text-lg font-semibold mb-4 border-b border-border pb-4">Organization</h2>
        <button
          onClick={() => navigate('/categories')}
          className="w-full flex items-center justify-between p-4 rounded-xl border border-border hover:bg-muted transition-colors text-left group"
        >
          <div className="flex items-center gap-3">
            <div className="bg-primary/10 text-primary p-2 rounded-lg group-hover:bg-primary/20 transition-colors">
              <LayoutList size={20} />
            </div>
            <div>
              <h3 className="font-medium text-foreground">Manage Categories</h3>
              <p className="text-sm text-muted-foreground">Add, edit, or remove expense and income categories</p>
            </div>
          </div>
          <ChevronRight size={20} className="text-muted-foreground group-hover:translate-x-1 transition-transform" />
        </button>
      </div>

      <div className="bg-card p-6 rounded-2xl shadow-sm border border-border">
        <h2 className="text-lg font-semibold mb-4 border-b border-border pb-4">Appearance</h2>
        <div className="grid grid-cols-3 gap-3">
          {(['light', 'dark', 'system'] as const).map((t) => (
            <button
              key={t}
              onClick={() => handleThemeChange(t)}
              className={`flex flex-col items-center justify-center p-4 rounded-xl border-2 transition-all ${
                theme === t ? 'border-primary bg-primary/5 text-primary' : 'border-border text-muted-foreground hover:bg-muted'
              }`}
            >
              {t === 'light' && <Sun size={24} className="mb-2" />}
              {t === 'dark' && <Moon size={24} className="mb-2" />}
              {t === 'system' && <Monitor size={24} className="mb-2" />}
              <span className="font-medium capitalize">{t}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="bg-card p-6 rounded-2xl shadow-sm border border-border">
        <h2 className="text-lg font-semibold mb-4 border-b border-border pb-4">Account & Sync</h2>
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
              isSyncing ? 'bg-muted text-muted-foreground' : 'bg-primary/10 text-primary hover:bg-primary/20'
            }`}
          >
            <CloudSync size={18} className={isSyncing ? 'animate-spin' : ''} />
            {isSyncing ? 'Syncing...' : 'Sync Now'}
          </button>
        </div>
      </div>

      <div className="bg-card p-6 rounded-2xl shadow-sm border border-border space-y-6">
        <h2 className="text-lg font-semibold border-b border-border pb-4 text-destructive">Danger Zone</h2>
        
        <div className="space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h3 className="font-medium">Data Portability</h3>
              <p className="text-sm text-muted-foreground">Backup or restore your complete database</p>
            </div>
            <div className="flex gap-2">
              <button
                onClick={handleJsonExport}
                className="flex items-center gap-2 px-4 py-2 bg-muted text-foreground font-medium rounded-lg hover:bg-muted/80 transition-colors text-sm"
              >
                <FileJson size={16} />
                Backup JSON
              </button>
              <button
                onClick={() => fileInputRef.current?.click()}
                className="flex items-center gap-2 px-4 py-2 bg-muted text-foreground font-medium rounded-lg hover:bg-muted/80 transition-colors text-sm"
              >
                <Upload size={16} />
                Import
              </button>
              <input 
                type="file" 
                ref={fileInputRef} 
                onChange={handleDataImport} 
                className="hidden" 
                accept=".json,.csv,.xlsx"
              />
            </div>
          </div>

          <div className="pt-4 border-t border-border flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h3 className="font-medium">Export CSV</h3>
              <p className="text-sm text-muted-foreground">Download transactions for spreadsheet apps</p>
            </div>
            <div className="flex gap-2">
              <button
                onClick={exportCSV}
                className="flex items-center gap-2 px-4 py-2 bg-muted text-foreground font-medium rounded-lg hover:bg-muted/80 transition-colors text-sm"
              >
                <Download size={16} />
                CSV
              </button>
              <button
                onClick={exportXLSX}
                className="flex items-center gap-2 px-4 py-2 bg-muted text-foreground font-medium rounded-lg hover:bg-muted/80 transition-colors text-sm"
              >
                <Download size={16} />
                XLSX
              </button>
            </div>
          </div>

          <div className="pt-4 border-t border-border flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h3 className="font-medium text-destructive">Erase All Data</h3>
              <p className="text-sm text-muted-foreground">Completely wipe local and cloud records</p>
            </div>
            <button
              onClick={() => setShowMasterWipeConfirm(true)}
              disabled={isWiping}
              className="flex items-center gap-2 px-4 py-2 bg-destructive/10 text-destructive font-medium rounded-lg hover:bg-destructive/20 transition-colors text-sm"
            >
              <AlertTriangle size={16} />
              Wipe Everything
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Settings;
