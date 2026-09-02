import React, { useState, useEffect } from 'react';
import type { PaymentRequest, PaymentAccount, Invoice, UserLedger, PlanConfig } from '../../../types/payments';
import { VerificationQueueTab } from './VerificationQueueTab';
import { InvoicesTab } from './InvoicesTab';
import { DuesAndAdvancesTab } from './DuesAndAdvancesTab';
import { SubscriptionsPlansTab } from './SubscriptionsPlansTab';
import { PaymentAccountsTab } from './PaymentAccountsTab';
import { billingService } from '../../../services/BillingService';
import { Clock, FileText, Wallet, Crown, CreditCard, ShieldCheck, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';

interface PaymentsAdminLayoutProps {
  paymentRequests: PaymentRequest[];
  paymentAccounts: PaymentAccount[];
  plansConfig: Record<string, PlanConfig>;
  users: any[];
  onApproveRequest: (req: PaymentRequest, expiryDate: string, notes?: string) => Promise<void>;
  onRejectRequest: (req: PaymentRequest, reason: string) => Promise<void>;
  onSaveAccount: (acc: PaymentAccount) => Promise<void>;
  onDeleteAccount: (accountId: string) => Promise<void>;
  onSavePlanConfig: (planId: string, planData: PlanConfig) => Promise<void>;
  onAssignUserPlan: (userId: string, planId: string, expiryDate: string) => Promise<void>;
  onRefreshData: () => Promise<void>;
}

export const PaymentsAdminLayout: React.FC<PaymentsAdminLayoutProps> = ({
  paymentRequests,
  paymentAccounts,
  plansConfig,
  users,
  onApproveRequest,
  onRejectRequest,
  onSaveAccount,
  onDeleteAccount,
  onSavePlanConfig,
  onAssignUserPlan,
  onRefreshData
}) => {
  const [activeTab, setActiveTab] = useState<'verifications' | 'invoices' | 'ledgers' | 'subscriptions' | 'accounts'>('verifications');
  
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [ledgers, setLedgers] = useState<UserLedger[]>([]);
  const [loadingData, setLoadingData] = useState(false);

  const loadBillingData = async () => {
    setLoadingData(true);
    try {
      const [invList, ledgerList] = await Promise.all([
        billingService.getInvoices(),
        billingService.getUserLedgers()
      ]);
      setInvoices(invList);
      setLedgers(ledgerList);
    } catch (e: any) {
      console.error('[PaymentsAdminLayout] Load error:', e);
    } finally {
      setLoadingData(false);
    }
  };

  useEffect(() => {
    loadBillingData();
  }, []);

  const handleCreateInvoice = async (invoice: Invoice) => {
    await billingService.saveInvoice(invoice);
    await loadBillingData();
  };

  const handleMarkInvoicePaid = async (invoiceId: string) => {
    const inv = invoices.find(i => i.id === invoiceId);
    if (!inv) return;
    inv.status = 'paid';
    inv.paidAt = new Date().toISOString();
    await billingService.saveInvoice(inv);
    toast.success(`Invoice ${inv.invoiceNumber} marked as paid!`);
    await loadBillingData();
  };

  const handleAdjustLedger = async (
    userId: string,
    userEmail: string,
    userName: string,
    type: 'advance_credit' | 'due_recorded' | 'adjustment',
    amount: number,
    description: string
  ) => {
    await billingService.adjustUserLedger(userId, userEmail, userName, type, amount, description);
    await loadBillingData();
  };

  const pendingCount = paymentRequests.filter(r => r.status === 'pending').length;

  return (
    <div className="space-y-6 text-left animate-in fade-in duration-200">
      {/* Module Banner Header */}
      <div className="bg-gradient-to-r from-brand/20 via-background to-muted/20 border border-brand/20 rounded-3xl p-6 shadow-sm flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <ShieldCheck className="text-brand" size={24} />
            <h2 className="text-xl font-black text-foreground tracking-tight">Payments & Financial Billing Subsystem</h2>
          </div>
          <p className="text-xs text-muted-foreground">
            Manage customer verifications, invoices, user ledgers, advances, dues, and subscription tiers.
          </p>
        </div>

        <button
          onClick={async () => {
            await onRefreshData();
            await loadBillingData();
            toast.success('Billing data refreshed');
          }}
          disabled={loadingData}
          className="px-3 py-2 bg-card border border-border/80 hover:bg-muted/20 text-foreground rounded-2xl text-xs font-bold inline-flex items-center gap-1.5 transition-colors"
        >
          <RefreshCw size={14} className={loadingData ? 'animate-spin' : ''} />
          <span>Refresh Module</span>
        </button>
      </div>

      {/* Subsystem Sub-Navigation Tabs */}
      <div className="flex flex-wrap border-b border-border/60 gap-2 sm:gap-4 text-xs font-extrabold">
        <button
          onClick={() => setActiveTab('verifications')}
          className={`pb-3 px-3 flex items-center gap-2 border-b-2 transition-colors ${
            activeTab === 'verifications' ? 'border-brand text-brand' : 'border-transparent text-muted-foreground hover:text-foreground'
          }`}
        >
          <Clock size={16} />
          <span>Verification Queue</span>
          {pendingCount > 0 && (
            <span className="px-1.5 py-0.5 rounded-full text-[10px] bg-warning/20 text-warning font-bold">
              {pendingCount}
            </span>
          )}
        </button>

        <button
          onClick={() => setActiveTab('invoices')}
          className={`pb-3 px-3 flex items-center gap-2 border-b-2 transition-colors ${
            activeTab === 'invoices' ? 'border-brand text-brand' : 'border-transparent text-muted-foreground hover:text-foreground'
          }`}
        >
          <FileText size={16} />
          <span>Invoicing Engine ({invoices.length})</span>
        </button>

        <button
          onClick={() => setActiveTab('ledgers')}
          className={`pb-3 px-3 flex items-center gap-2 border-b-2 transition-colors ${
            activeTab === 'ledgers' ? 'border-brand text-brand' : 'border-transparent text-muted-foreground hover:text-foreground'
          }`}
        >
          <Wallet size={16} />
          <span>Dues & Advances Ledger ({ledgers.length})</span>
        </button>

        <button
          onClick={() => setActiveTab('subscriptions')}
          className={`pb-3 px-3 flex items-center gap-2 border-b-2 transition-colors ${
            activeTab === 'subscriptions' ? 'border-brand text-brand' : 'border-transparent text-muted-foreground hover:text-foreground'
          }`}
        >
          <Crown size={16} />
          <span>Subscriptions & Plans</span>
        </button>

        <button
          onClick={() => setActiveTab('accounts')}
          className={`pb-3 px-3 flex items-center gap-2 border-b-2 transition-colors ${
            activeTab === 'accounts' ? 'border-brand text-brand' : 'border-transparent text-muted-foreground hover:text-foreground'
          }`}
        >
          <CreditCard size={16} />
          <span>Payment Accounts Config</span>
        </button>
      </div>

      {/* Subsystem Active View */}
      {activeTab === 'verifications' && (
        <VerificationQueueTab
          paymentRequests={paymentRequests}
          onApprove={onApproveRequest}
          onReject={onRejectRequest}
          isLoading={loadingData}
        />
      )}

      {activeTab === 'invoices' && (
        <InvoicesTab
          invoices={invoices}
          users={users}
          plansConfig={plansConfig}
          paymentAccounts={paymentAccounts}
          onCreateInvoice={handleCreateInvoice}
          onMarkPaid={handleMarkInvoicePaid}
        />
      )}

      {activeTab === 'ledgers' && (
        <DuesAndAdvancesTab
          ledgers={ledgers}
          users={users}
          onAdjustLedger={handleAdjustLedger}
        />
      )}

      {activeTab === 'subscriptions' && (
        <SubscriptionsPlansTab
          plansConfig={plansConfig}
          users={users}
          onSavePlanConfig={onSavePlanConfig}
          onAssignUserPlan={onAssignUserPlan}
        />
      )}

      {activeTab === 'accounts' && (
        <PaymentAccountsTab
          paymentAccounts={paymentAccounts}
          onSaveAccount={onSaveAccount}
          onDeleteAccount={onDeleteAccount}
        />
      )}
    </div>
  );
};
