import React, { useState } from 'react';
import type { PaymentAccount } from '../../../types/payments';
import { Badge } from '../../ui/Badge';
import { Button } from '../../ui/Button';
import { CreditCard, PlusCircle, Edit, Trash2 } from 'lucide-react';
import { toast } from 'sonner';

interface PaymentAccountsTabProps {
  paymentAccounts: PaymentAccount[];
  onSaveAccount: (account: PaymentAccount) => Promise<void>;
  onDeleteAccount: (accountId: string) => Promise<void>;
}

export const PaymentAccountsTab: React.FC<PaymentAccountsTabProps> = ({
  paymentAccounts,
  onSaveAccount,
  onDeleteAccount
}) => {
  const [showModal, setShowModal] = useState(false);
  const [accountForm, setAccountForm] = useState<PaymentAccount>({
    id: '',
    method: 'SadaPay',
    holderName: '',
    accountNumber: '',
    iban: '',
    instructions: '',
    isActive: true,
    displayOrder: paymentAccounts.length + 1,
    qrCodeUrl: ''
  });

  const handleOpenAddModal = () => {
    setAccountForm({
      id: '',
      method: 'SadaPay',
      holderName: '',
      accountNumber: '',
      iban: '',
      instructions: '',
      isActive: true,
      displayOrder: paymentAccounts.length + 1,
      qrCodeUrl: ''
    });
    setShowModal(true);
  };

  const handleOpenEditModal = (acc: PaymentAccount) => {
    setAccountForm({ ...acc });
    setShowModal(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!accountForm.holderName.trim() || !accountForm.accountNumber.trim()) {
      toast.error('Holder name and account number are required.');
      return;
    }

    const accToSave: PaymentAccount = {
      ...accountForm,
      id: accountForm.id || `account_${Date.now()}`
    };

    try {
      await onSaveAccount(accToSave);
      toast.success(accountForm.id ? 'Payment account updated.' : 'Payment account added.');
      setShowModal(false);
    } catch (e: any) {
      toast.error('Failed to save payment account: ' + (e.message || e));
    }
  };

  return (
    <div className="space-y-6 text-left">
      <div className="bg-card border border-border rounded-3xl p-5 shadow-sm space-y-4">
        <div className="flex items-center justify-between gap-3 border-b border-border/40 pb-4">
          <div className="flex items-center gap-2">
            <CreditCard className="text-primary" size={18} />
            <h3 className="font-extrabold text-sm text-foreground">Manual Payment Accounts Setup</h3>
          </div>
          <Button
            variant="primary"
            size="sm"
            onClick={handleOpenAddModal}
            leftIcon={<PlusCircle size={14} />}
          >
            Add Payment Method
          </Button>
        </div>

        {paymentAccounts.length === 0 ? (
          <div className="py-12 text-center text-xs text-muted-foreground italic">
            No payment accounts configured yet. Users will see a fallback message on checkout.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {paymentAccounts.map((acc) => (
              <div
                key={acc.id}
                className="border border-border/60 bg-muted/10 rounded-2xl p-4 flex justify-between items-start gap-4 transition-colors hover:bg-muted/20"
              >
                <div className="space-y-2 text-xs">
                  <div className="flex items-center gap-2">
                    <h4 className="font-extrabold text-foreground">{acc.method}</h4>
                    <Badge variant={acc.isActive ? 'success' : 'outline'} size="sm">
                      {acc.isActive ? 'Active' : 'Disabled'}
                    </Badge>
                  </div>
                  <div className="space-y-0.5 text-muted-foreground leading-normal">
                    <p>Holder: <strong className="text-foreground">{acc.holderName}</strong></p>
                    <p>Account: <strong className="text-foreground font-mono font-semibold">{acc.accountNumber}</strong></p>
                    {acc.iban && <p>IBAN: <strong className="text-foreground font-mono">{acc.iban}</strong></p>}
                    {acc.instructions && <p className="italic text-[10px] text-foreground/80 mt-1">"{acc.instructions}"</p>}
                  </div>
                </div>

                <div className="flex items-center gap-1 shrink-0">
                  <button
                    onClick={() => handleOpenEditModal(acc)}
                    className="p-1.5 hover:bg-muted rounded-lg text-slate-400 hover:text-foreground transition-colors"
                    title="Edit"
                  >
                    <Edit size={16} />
                  </button>
                  <button
                    onClick={() => onDeleteAccount(acc.id)}
                    className="p-1.5 hover:bg-destructive/10 rounded-lg text-destructive transition-colors"
                    title="Delete"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Save Account Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 bg-background/80 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-card border border-border rounded-3xl p-6 max-w-md w-full space-y-4 shadow-2xl text-left">
            <h3 className="font-extrabold text-sm text-foreground">
              {accountForm.id ? 'Edit Payment Account' : 'Add New Payment Account'}
            </h3>

            <form onSubmit={handleSubmit} className="space-y-3 text-xs">
              <div>
                <label className="font-semibold block mb-1">Method Type *</label>
                <input
                  type="text"
                  required
                  value={accountForm.method}
                  onChange={(e) => setAccountForm({ ...accountForm, method: e.target.value })}
                  placeholder="e.g. SadaPay, EasyPaisa, Meezan Bank"
                  className="w-full bg-muted/20 border border-border/60 rounded-xl px-3 py-2 text-foreground focus:outline-none"
                />
              </div>

              <div>
                <label className="font-semibold block mb-1">Account Holder Name *</label>
                <input
                  type="text"
                  required
                  value={accountForm.holderName}
                  onChange={(e) => setAccountForm({ ...accountForm, holderName: e.target.value })}
                  placeholder="e.g. Muhammad Khizar"
                  className="w-full bg-muted/20 border border-border/60 rounded-xl px-3 py-2 text-foreground focus:outline-none"
                />
              </div>

              <div>
                <label className="font-semibold block mb-1">Account Number / Phone *</label>
                <input
                  type="text"
                  required
                  value={accountForm.accountNumber}
                  onChange={(e) => setAccountForm({ ...accountForm, accountNumber: e.target.value })}
                  placeholder="03001234567"
                  className="w-full bg-muted/20 border border-border/60 rounded-xl px-3 py-2 text-foreground focus:outline-none font-mono"
                />
              </div>

              <div>
                <label className="font-semibold block mb-1">IBAN (Optional)</label>
                <input
                  type="text"
                  value={accountForm.iban || ''}
                  onChange={(e) => setAccountForm({ ...accountForm, iban: e.target.value })}
                  placeholder="PK36SADA000000123456789"
                  className="w-full bg-muted/20 border border-border/60 rounded-xl px-3 py-2 text-foreground focus:outline-none font-mono"
                />
              </div>

              <div>
                <label className="font-semibold block mb-1">Instructions for User</label>
                <textarea
                  value={accountForm.instructions || ''}
                  onChange={(e) => setAccountForm({ ...accountForm, instructions: e.target.value })}
                  placeholder="e.g. Include your email in transfer memo."
                  rows={2}
                  className="w-full bg-muted/20 border border-border/60 rounded-xl p-3 text-foreground focus:outline-none"
                />
              </div>

              <div className="flex items-center gap-2 pt-1">
                <input
                  type="checkbox"
                  id="accountIsActive"
                  checked={accountForm.isActive}
                  onChange={(e) => setAccountForm({ ...accountForm, isActive: e.target.checked })}
                />
                <label htmlFor="accountIsActive" className="font-semibold cursor-pointer">
                  Active (Visible on checkout)
                </label>
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <Button variant="ghost" size="sm" onClick={() => setShowModal(false)}>Cancel</Button>
                <Button variant="primary" size="sm" type="submit">Save Account</Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
