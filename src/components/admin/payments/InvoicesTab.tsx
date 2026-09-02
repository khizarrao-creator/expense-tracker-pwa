import React, { useState } from 'react';
import type { Invoice, InvoiceItem, PlanConfig, PaymentAccount } from '../../../types/payments';
import { Badge } from '../../ui/Badge';
import { Button } from '../../ui/Button';
import { FileText, PlusCircle, Printer, Search, CheckCircle2 } from 'lucide-react';
import { toast } from 'sonner';

interface InvoicesTabProps {
  invoices: Invoice[];
  users?: any[];
  plansConfig?: Record<string, PlanConfig>;
  paymentAccounts?: PaymentAccount[];
  onCreateInvoice: (invoice: Invoice) => Promise<void>;
  onMarkPaid: (invoiceId: string) => Promise<void>;
}

export const InvoicesTab: React.FC<InvoicesTabProps> = ({
  invoices,
  users = [],
  plansConfig,
  paymentAccounts = [],
  onCreateInvoice,
  onMarkPaid
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'paid' | 'unpaid' | 'overdue'>('all');
  const [selectedInvoice, setSelectedInvoice] = useState<Invoice | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);

  // Autocomplete state
  const [emailSuggestions, setEmailSuggestions] = useState<any[]>([]);
  const [showEmailSuggestions, setShowEmailSuggestions] = useState(false);

  const formatMoney = (amount: number, curr?: string) => {
    const c = curr || 'USD';
    const symbol = c === 'USD' ? '$' : c === 'EUR' ? '€' : c === 'GBP' ? '£' : 'PKR ';
    const isDecimal = c === 'USD' || c === 'EUR' || c === 'GBP';
    return `${symbol}${amount.toLocaleString(undefined, {
      minimumFractionDigits: isDecimal ? 2 : 0,
      maximumFractionDigits: isDecimal ? 2 : 2
    })}`;
  };

  // New Invoice Form state
  const [customerEmail, setCustomerEmail] = useState('');
  const [customerName, setCustomerName] = useState('');
  const [currency, setCurrency] = useState('USD');
  const [exchangeRate, setExchangeRate] = useState<number>(280);
  const [taxPercent, setTaxPercent] = useState(0);
  const [discountAmount, setDiscountAmount] = useState(0);
  const [dueDate, setDueDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() + 7);
    return d.toISOString().split('T')[0];
  });
  const [lineItems, setLineItems] = useState<InvoiceItem[]>([
    { id: '1', description: 'Pro Monthly Subscription', quantity: 1, unitPrice: 2.14, total: 2.14 }
  ]);
  // Line Item Plan Autocomplete state
  const [activeItemIndex, setActiveItemIndex] = useState<number | null>(null);
  const [itemSuggestions, setItemSuggestions] = useState<{ name: string; price: number }[]>([]);

  const getPlanPresets = (filterVal: string) => {
    let presets: { name: string; price: number }[] = [];
    const convertPrice = (pkrPrice: number) => {
      if (currency === 'USD' || currency === 'EUR') {
        const rate = exchangeRate > 0 ? exchangeRate : 280;
        return Math.round((pkrPrice / rate) * 100) / 100;
      }
      return pkrPrice;
    };

    if (plansConfig && Object.keys(plansConfig).length > 0) {
      Object.values(plansConfig).forEach(p => {
        const calculatedPrice = convertPrice(p.price);
        presets.push({ name: `${p.name} Subscription`, price: calculatedPrice });
        if (p.price > 0) {
          presets.push({ name: `${p.name} Annual Plan`, price: convertPrice(p.price * 10) });
        }
      });
    } else {
      presets = [
        { name: 'Pro Monthly Subscription', price: convertPrice(600) },
        { name: 'Pro Annual Subscription', price: convertPrice(6000) },
        { name: 'Max Monthly Plan', price: convertPrice(1500) },
        { name: 'Max Annual Plan', price: convertPrice(15000) },
        { name: 'Standard Plan', price: 0 },
        { name: 'Custom Setup / Addon Fee', price: convertPrice(1000) }
      ];
    }
    if (!filterVal.trim()) return presets;
    return presets.filter(p => p.name.toLowerCase().includes(filterVal.toLowerCase()));
  };

  const filteredInvoices = invoices.filter(inv => {
    const matchesSearch =
      (inv.invoiceNumber || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
      (inv.userName || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
      (inv.userEmail || '').toLowerCase().includes(searchQuery.toLowerCase());
    const matchesStatus = statusFilter === 'all' || inv.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const handleAddLineItem = () => {
    setLineItems([
      ...lineItems,
      { id: String(Date.now()), description: '', quantity: 1, unitPrice: 0, total: 0 }
    ]);
  };

  const handleUpdateItem = (id: string, field: keyof InvoiceItem, val: any) => {
    setLineItems(lineItems.map(item => {
      if (item.id !== id) return item;
      const updated = { ...item, [field]: val };
      if (field === 'quantity' || field === 'unitPrice') {
        updated.total = Number(updated.quantity || 0) * Number(updated.unitPrice || 0);
      }
      return updated;
    }));
  };

  const handleRemoveItem = (id: string) => {
    if (lineItems.length <= 1) return;
    setLineItems(lineItems.filter(item => item.id !== id));
  };

  const subtotal = lineItems.reduce((sum, item) => sum + (item.total || 0), 0);
  const calculatedTax = (subtotal * (taxPercent || 0)) / 100;
  const finalAmount = Math.max(0, subtotal + calculatedTax - (discountAmount || 0));

  const handleSaveInvoice = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!customerEmail.trim()) {
      toast.error('Customer email is required');
      return;
    }

    const seq = invoices.length + 1;
    const invNum = `INV-${new Date().getFullYear()}-${String(seq).padStart(4, '0')}`;
    const invId = `inv_${Date.now()}`;

    const newInv: Invoice = {
      id: invId,
      invoiceNumber: invNum,
      userId: customerEmail.trim().toLowerCase(),
      userEmail: customerEmail.trim(),
      userName: customerName.trim() || customerEmail.split('@')[0],
      amount: subtotal,
      taxAmount: calculatedTax,
      discountAmount,
      finalAmount,
      currency,
      exchangeRate: currency === 'USD' ? Number(exchangeRate || 280) : undefined,
      status: 'unpaid',
      issuedAt: new Date().toISOString(),
      dueDate: new Date(dueDate).toISOString(),
      items: lineItems,
      createdFrom: 'manual'
    };

    try {
      await onCreateInvoice(newInv);
      toast.success(`Invoice ${invNum} created!`);
      setShowCreateModal(false);
      // Reset form
      setCustomerEmail('');
      setCustomerName('');
      setLineItems([{ id: '1', description: 'Pro Monthly Subscription', quantity: 1, unitPrice: 600, total: 600 }]);
    } catch (e: any) {
      toast.error('Failed to create invoice: ' + (e.message || e));
    }
  };

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="space-y-6 text-left">
      {/* Search & Actions Bar */}
      <div className="flex flex-col sm:flex-row justify-between items-stretch sm:items-center gap-4 bg-card border border-border/80 rounded-3xl p-4 shadow-sm">
        <div className="relative flex-1">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground" size={16} />
          <input
            type="text"
            placeholder="Search by Invoice #, Customer Name, Email..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2 bg-muted/20 border border-border/60 rounded-2xl text-xs focus:outline-none focus:ring-2 focus:ring-primary/40"
          />
        </div>

        <div className="flex items-center gap-3">
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as any)}
            className="bg-muted/20 border border-border/60 rounded-2xl px-3 py-2 text-xs font-semibold text-foreground focus:outline-none"
          >
            <option value="all">All Invoices ({invoices.length})</option>
            <option value="paid">Paid ({invoices.filter(i => i.status === 'paid').length})</option>
            <option value="unpaid">Unpaid ({invoices.filter(i => i.status === 'unpaid').length})</option>
            <option value="overdue">Overdue ({invoices.filter(i => i.status === 'overdue').length})</option>
          </select>

          <Button
            variant="primary"
            size="sm"
            onClick={() => setShowCreateModal(true)}
            leftIcon={<PlusCircle size={14} />}
          >
            Create Invoice
          </Button>
        </div>
      </div>

      {/* Invoices List Card */}
      <div className="bg-card border border-border rounded-3xl p-5 shadow-sm space-y-4">
        <div className="flex items-center justify-between border-b border-border/40 pb-4">
          <div className="flex items-center gap-2">
            <FileText className="text-primary" size={18} />
            <h3 className="font-extrabold text-sm text-foreground">Invoicing Directory</h3>
          </div>
          <Badge variant="outline" size="sm">Total: {invoices.length}</Badge>
        </div>

        {filteredInvoices.length === 0 ? (
          <div className="py-12 text-center text-xs text-muted-foreground italic">
            No invoices recorded. Click "Create Invoice" to generate one.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-border/40 text-muted-foreground font-semibold">
                  <th className="py-3 px-2">Invoice #</th>
                  <th className="py-3 px-2">Customer</th>
                  <th className="py-3 px-2">Issued</th>
                  <th className="py-3 px-2">Due Date</th>
                  <th className="py-3 px-2">Amount</th>
                  <th className="py-3 px-2">Status</th>
                  <th className="py-3 px-2 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/30">
                {filteredInvoices.map((inv) => (
                  <tr key={inv.id} className="hover:bg-muted/10 transition-colors">
                    <td className="py-3 px-2 font-mono font-bold text-foreground">{inv.invoiceNumber}</td>
                    <td className="py-3 px-2">
                      <p className="font-bold text-foreground">{inv.userName}</p>
                      <p className="text-[10px] text-muted-foreground">{inv.userEmail}</p>
                    </td>
                    <td className="py-3 px-2 text-muted-foreground text-[10px]">
                      {new Date(inv.issuedAt).toLocaleDateString()}
                    </td>
                    <td className="py-3 px-2 text-muted-foreground text-[10px]">
                      {new Date(inv.dueDate).toLocaleDateString()}
                    </td>
                    <td className="py-3 px-2 font-bold text-foreground font-mono">
                      {formatMoney(inv.finalAmount || inv.amount, inv.currency)}
                    </td>
                    <td className="py-3 px-2">
                      <Badge
                        variant={
                          inv.status === 'paid' ? 'success' :
                            inv.status === 'overdue' ? 'danger' : 'warning'
                        }
                        size="sm"
                      >
                        {inv.status}
                      </Badge>
                    </td>
                    <td className="py-3 px-2 text-right space-x-2 shrink-0">
                      <button
                        onClick={() => setSelectedInvoice(inv)}
                        className="p-1.5 hover:bg-muted rounded-lg text-primary transition-colors inline-flex"
                        title="View & Print Invoice"
                      >
                        <Printer size={16} />
                      </button>
                      {inv.status !== 'paid' && (
                        <button
                          onClick={() => onMarkPaid(inv.id)}
                          className="p-1.5 hover:bg-success/10 rounded-lg text-success transition-colors inline-flex"
                          title="Mark as Paid"
                        >
                          <CheckCircle2 size={16} />
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Printable Invoice Lightbox */}
      {selectedInvoice && (
        <div className="fixed inset-0 z-50 bg-background/90 backdrop-blur-md flex items-center justify-center p-4 overflow-y-auto printable-modal-overlay">
          {/* Custom Print CSS */}
          <style>{`
            @media print {
              @page {
                size: A4 portrait;
                margin: 0;
              }
              body {
                background: #ffffff !important;
                color: #0f172a !important;
                -webkit-print-color-adjust: exact !important;
                print-color-adjust: exact !important;
                font-family: system-ui, -apple-system, sans-serif !important;
              }
              .printable-modal-overlay {
                position: fixed !important;
                inset: 0 !important;
                background: #ffffff !important;
                padding: 0 !important;
                margin: 0 !important;
                z-index: 99999 !important;
                display: block !important;
                overflow: visible !important;
              }
              .printable-invoice-box {
                border: none !important;
                box-shadow: none !important;
                padding: 36px 48px !important;
                margin: 0 auto !important;
                width: 100% !important;
                max-width: 100% !important;
                color: #0f172a !important;
                background: #ffffff !important;
                border-radius: 0 !important;
              }
              .print-dark-text {
                color: #0f172a !important;
              }
              .print-muted-text {
                color: #64748b !important;
              }
              .print-table-header {
                background-color: #0f172a !important;
                color: #ffffff !important;
              }
              .print-card-bg {
                background-color: #f8fafc !important;
                border-color: #cbd5e1 !important;
              }
            }
          `}</style>

          <div className="bg-card border border-border rounded-3xl p-6 sm:p-8 max-w-2xl w-full space-y-6 shadow-2xl text-left my-8 printable-invoice-box">
            {/* Executive Corporate Header Banner */}
            <div className="flex justify-between items-start border-b border-border/80 pb-6 print:border-slate-300">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <div className="h-8 w-8 rounded-xl bg-brand/20 print:bg-slate-900 text-brand print:text-white flex items-center justify-center font-black text-sm">
                    B
                  </div>
                  <span className="text-base font-black tracking-tight text-foreground print-dark-text">THE BASE WORKSPACE</span>
                </div>
                <p className="text-[11px] text-muted-foreground print-muted-text">
                  Finance & Billing Operations Suite
                </p>
              </div>

              <div className="text-right space-y-1">
                <h2 className="text-2xl font-black text-foreground tracking-tight print-dark-text uppercase">INVOICE</h2>
                <p className="text-xs font-mono font-bold text-primary print-dark-text">{selectedInvoice.invoiceNumber}</p>
                <div className="pt-1">
                  <span className={`inline-block px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-wider ${selectedInvoice.status === 'paid' ? 'bg-emerald-500/10 text-emerald-600 border border-emerald-500/30' :
                    selectedInvoice.status === 'overdue' ? 'bg-rose-500/10 text-rose-600 border border-rose-500/30' :
                      'bg-amber-500/10 text-amber-600 border border-amber-500/30'
                    }`}>
                    STATUS: {selectedInvoice.status}
                  </span>
                </div>
              </div>
            </div>

            {/* Billed To & Dates Card */}
            <div className="grid grid-cols-2 gap-4 text-xs bg-muted/30 print-card-bg p-5 rounded-2xl border border-border/60 print:border-slate-300">
              <div className="space-y-1">
                <span className="text-[10px] font-extrabold uppercase tracking-wider text-muted-foreground print-muted-text block">Billed To</span>
                <p className="font-extrabold text-sm text-foreground print-dark-text">{selectedInvoice.userName}</p>
                <p className="text-muted-foreground print-muted-text">{selectedInvoice.userEmail}</p>
                <p className="text-[10px] text-muted-foreground print-muted-text font-mono">ID: {selectedInvoice.userId}</p>
              </div>
              <div className="text-right space-y-1 self-center">
                <p><strong className="text-muted-foreground print-muted-text">Issued Date:</strong> <span className="font-semibold text-foreground print-dark-text">{new Date(selectedInvoice.issuedAt).toLocaleDateString()}</span></p>
                <p><strong className="text-muted-foreground print-muted-text">Due Date:</strong> <span className="font-semibold text-foreground print-dark-text">{new Date(selectedInvoice.dueDate).toLocaleDateString()}</span></p>
                {selectedInvoice.paidAt && (
                  <p><strong className="text-emerald-600">Paid On:</strong> <span className="font-semibold text-foreground print-dark-text">{new Date(selectedInvoice.paidAt).toLocaleDateString()}</span></p>
                )}
                {selectedInvoice.paymentMethod && (
                  <p><strong className="text-muted-foreground print-muted-text">Payment Method:</strong> <span className="font-bold text-foreground print-dark-text">{selectedInvoice.paymentMethod}</span></p>
                )}
              </div>
            </div>

            {/* Line Items Table */}
            <div className="space-y-2">
              <table className="w-full text-xs text-left border-collapse">
                <thead>
                  <tr className="border-b border-border/80 print-table-header text-muted-foreground print:text-white font-bold uppercase text-[10px]">
                    <th className="py-2.5 px-3 rounded-l-xl print:rounded-none">Item Description</th>
                    <th className="py-2.5 px-3 text-center">Qty</th>
                    <th className="py-2.5 px-3 text-right">Unit Price</th>
                    <th className="py-2.5 px-3 text-right rounded-r-xl print:rounded-none">Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/40 print:divide-slate-200">
                  {(selectedInvoice.items || []).map((item) => (
                    <tr key={item.id} className="hover:bg-muted/10">
                      <td className="py-3 px-3 font-semibold text-foreground print-dark-text">{item.description}</td>
                      <td className="py-3 px-3 text-center font-semibold text-foreground print-dark-text">{item.quantity}</td>
                      <td className="py-3 px-3 text-right font-mono text-foreground print-dark-text">{formatMoney(item.unitPrice, selectedInvoice.currency)}</td>
                      <td className="py-3 px-3 text-right font-extrabold font-mono text-foreground print-dark-text">{formatMoney(item.total, selectedInvoice.currency)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Total Summary & Exchange Rate Note */}
            <div className="border-t border-border/80 print:border-slate-300 pt-4 flex justify-between items-start text-xs">
              <div className="text-[10px] text-muted-foreground print-muted-text max-w-xs space-y-1">
                {selectedInvoice.exchangeRate && (
                  <p className="font-semibold text-foreground print-dark-text">Exchange Rate Applied: 1 USD = {selectedInvoice.exchangeRate} PKR</p>
                )}
                <p className="italic">All figures are official billing records of The Base Workspace.</p>
              </div>

              <div className="w-72 space-y-2 text-right bg-muted/20 print-card-bg p-4 rounded-2xl border border-border/40 print:border-slate-300">
                <div className="flex justify-between">
                  <span className="text-muted-foreground print-muted-text">Subtotal:</span>
                  <span className="font-mono font-bold text-foreground print-dark-text">{formatMoney(selectedInvoice.amount, selectedInvoice.currency)}</span>
                </div>
                {!!selectedInvoice.taxAmount && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground print-muted-text">Tax:</span>
                    <span className="font-mono font-bold text-foreground print-dark-text">+{formatMoney(selectedInvoice.taxAmount, selectedInvoice.currency)}</span>
                  </div>
                )}
                {!!selectedInvoice.discountAmount && (
                  <div className="flex justify-between text-emerald-600">
                    <span>Discount:</span>
                    <span className="font-mono font-bold">-{formatMoney(selectedInvoice.discountAmount, selectedInvoice.currency)}</span>
                  </div>
                )}
                <div className="flex justify-between border-t border-border/60 print:border-slate-300 pt-2 font-black text-base text-foreground print-dark-text">
                  <span>Total Due ({selectedInvoice.currency}):</span>
                  <span className="font-mono text-primary print-dark-text">{formatMoney(selectedInvoice.finalAmount, selectedInvoice.currency)}</span>
                </div>

                {/* Highlighted PKR Equivalent Amount Payable Box */}
                {selectedInvoice.currency === 'USD' && (
                  <div className="border-t border-dashed border-emerald-500/40 pt-2.5 mt-2 space-y-1 bg-emerald-500/10 print-card-bg p-3 rounded-xl text-left">
                    <div className="flex justify-between text-[11px]">
                      <span className="font-medium text-muted-foreground print-muted-text">Exchange Rate:</span>
                      <span className="font-mono font-bold text-foreground print-dark-text">1 USD = {selectedInvoice.exchangeRate || 280} PKR</span>
                    </div>
                    <div className="flex justify-between items-center text-xs font-black text-emerald-600 print-dark-text border-t border-emerald-500/20 pt-1.5">
                      <span>Total Payable in PKR:</span>
                      <span className="font-mono text-sm font-extrabold text-emerald-600 print-dark-text">
                        PKR {((selectedInvoice.finalAmount || selectedInvoice.amount) * (selectedInvoice.exchangeRate || 280)).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </span>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Bank Transfer & Payment Accounts Box for Customer */}
            {paymentAccounts.filter(a => a.isActive).length > 0 && (
              <div className="bg-muted/20 print-card-bg p-4 rounded-2xl border border-border/60 print:border-slate-300 space-y-2 text-xs text-left">
                <div className="flex justify-between items-center border-b border-border/40 print:border-slate-300 pb-2">
                  <h4 className="font-black text-xs uppercase tracking-wider text-foreground print-dark-text">
                    Official Payment Transfer Accounts
                  </h4>
                  {selectedInvoice.currency === 'USD' && (
                    <span className="text-[11px] font-black text-emerald-600 print-dark-text font-mono">
                      Pay Exact: PKR {((selectedInvoice.finalAmount || selectedInvoice.amount) * (selectedInvoice.exchangeRate || 280)).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </span>
                  )}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-[11px]">
                  {paymentAccounts.filter(a => a.isActive).map(acc => (
                    <div key={acc.id} className="p-2.5 bg-card border border-border/40 rounded-xl space-y-0.5 print-card-bg">
                      <p className="font-extrabold text-foreground print-dark-text capitalize">{acc.method}</p>
                      <p className="text-muted-foreground print-muted-text">Account Title: <strong className="text-foreground print-dark-text">{acc.holderName}</strong></p>
                      <p className="text-muted-foreground print-muted-text">Account Number: <strong className="text-foreground print-dark-text font-mono font-bold">{acc.accountNumber}</strong></p>
                      {acc.iban && <p className="text-muted-foreground print-muted-text text-[10px]">IBAN: <span className="font-mono font-semibold">{acc.iban}</span></p>}
                    </div>
                  ))}
                </div>
                <p className="text-[9px] text-muted-foreground print-muted-text italic pt-1">
                  * Transfer the exact PKR amount to any account listed above and include Invoice #{selectedInvoice.invoiceNumber} in transaction memo.
                </p>
              </div>
            )}

            {/* Terms & System Generated Verification Footer */}
            <div className="pt-6 border-t border-border/80 print:border-slate-300 text-[10px] text-muted-foreground print-muted-text flex justify-between items-end gap-4">
              <div className="space-y-0.5 text-left max-w-xs">
                <p className="font-extrabold text-foreground print-dark-text uppercase tracking-wider text-[9px]">Terms & Conditions</p>
                <p>Payment is due according to specified due date. Thank you for your business!</p>
                <p className="font-mono text-[9px]">Support: khizarraoworks@gmail.com</p>
              </div>
              <div className="text-right space-y-1 bg-muted/30 print-card-bg px-4 py-2.5 rounded-2xl border border-border/60 print:border-slate-300 shrink-0">
                <p className="font-black text-[10px] text-foreground print-dark-text tracking-wider uppercase text-right">
                  COMPUTER GENERATED INVOICE
                </p>
                <p className="text-[9px] text-muted-foreground print-muted-text italic text-right max-w-[260px]">
                  This is an electronically generated document. No physical signature is required.
                </p>
              </div>
            </div>

            {/* Action Bar (Hidden on Print) */}
            <div className="flex justify-between items-center pt-4 border-t border-border/40 print:hidden">
              <Button variant="ghost" size="sm" onClick={() => setSelectedInvoice(null)}>Close</Button>
              <div className="flex gap-2">
                <Button variant="primary" size="sm" onClick={handlePrint} leftIcon={<Printer size={14} />}>
                  Print / Export PDF
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Create Invoice Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 bg-background/80 backdrop-blur-md flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-card border border-border rounded-3xl p-6 max-w-xl w-full space-y-4 shadow-2xl text-left my-8">
            <div className="flex justify-between items-center border-b border-border/40 pb-3">
              <h3 className="font-extrabold text-sm text-foreground">Generate New Customer Invoice</h3>
              <button onClick={() => setShowCreateModal(false)} className="text-muted-foreground">✕</button>
            </div>

            <form onSubmit={handleSaveInvoice} className="space-y-4">
              <div className="grid grid-cols-2 gap-3 text-xs">
                <div className="relative">
                  <label className="font-semibold block mb-1">Customer Email *</label>
                  <input
                    type="email"
                    required
                    value={customerEmail}
                    onChange={(e) => {
                      const val = e.target.value;
                      setCustomerEmail(val);
                      if (val.trim()) {
                        const matches = (users || []).filter(u =>
                          (u.email || '').toLowerCase().includes(val.toLowerCase()) ||
                          (u.displayName || '').toLowerCase().includes(val.toLowerCase())
                        ).slice(0, 6);
                        setEmailSuggestions(matches);
                        setShowEmailSuggestions(matches.length > 0);
                      } else {
                        setShowEmailSuggestions(false);
                      }
                    }}
                    onFocus={() => {
                      if (customerEmail.trim()) {
                        const matches = (users || []).filter(u =>
                          (u.email || '').toLowerCase().includes(customerEmail.toLowerCase()) ||
                          (u.displayName || '').toLowerCase().includes(customerEmail.toLowerCase())
                        ).slice(0, 6);
                        setEmailSuggestions(matches);
                        setShowEmailSuggestions(matches.length > 0);
                      }
                    }}
                    onBlur={() => setTimeout(() => setShowEmailSuggestions(false), 200)}
                    placeholder="Start typing email or name..."
                    className="w-full bg-muted/20 border border-border/60 rounded-xl px-3 py-2 text-foreground focus:outline-none"
                  />

                  {showEmailSuggestions && emailSuggestions.length > 0 && (
                    <div className="absolute left-0 right-0 top-full mt-1 bg-card border border-border rounded-2xl shadow-2xl z-50 max-h-48 overflow-y-auto divide-y divide-border/30">
                      {emailSuggestions.map((u) => (
                        <button
                          key={u.id || u.email}
                          type="button"
                          onMouseDown={() => {
                            setCustomerEmail(u.email);
                            setCustomerName(u.displayName || u.email.split('@')[0]);
                            setShowEmailSuggestions(false);
                          }}
                          className="w-full text-left p-2.5 hover:bg-muted/30 transition-colors flex flex-col"
                        >
                          <span className="font-bold text-xs text-foreground">{u.displayName || u.email.split('@')[0]}</span>
                          <span className="text-[10px] text-muted-foreground">{u.email}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                <div>
                  <label className="font-semibold block mb-1">Customer Name</label>
                  <input
                    type="text"
                    value={customerName}
                    onChange={(e) => setCustomerName(e.target.value)}
                    placeholder="John Doe"
                    className="w-full bg-muted/20 border border-border/60 rounded-xl px-3 py-2 text-foreground focus:outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                <div>
                  <label className="font-semibold block mb-1">Currency</label>
                  <select
                    value={currency}
                    onChange={(e) => setCurrency(e.target.value)}
                    className="w-full bg-muted/20 border border-border/60 rounded-xl px-3 py-2 text-foreground focus:outline-none font-extrabold"
                  >
                    <option value="USD">$ USD (US Dollar)</option>
                    <option value="PKR">PKR (Pakistani Rupee)</option>
                    <option value="EUR">€ EUR (Euro)</option>
                    <option value="GBP">£ GBP (British Pound)</option>
                  </select>
                </div>

                {currency === 'USD' && (
                  <div>
                    <label className="font-semibold block mb-1">Ex. Rate (1 USD = ? PKR)</label>
                    <input
                      type="number"
                      value={exchangeRate}
                      onChange={(e) => setExchangeRate(Number(e.target.value) || 280)}
                      placeholder="280"
                      className="w-full bg-muted/20 border border-border/60 rounded-xl px-3 py-2 text-foreground focus:outline-none font-mono font-extrabold"
                    />
                  </div>
                )}

                <div className={currency === 'USD' ? '' : 'sm:col-span-2'}>
                  <label className="font-semibold block mb-1">Due Date</label>
                  <input
                    type="date"
                    value={dueDate}
                    onChange={(e) => setDueDate(e.target.value)}
                    className="w-full bg-muted/20 border border-border/60 rounded-xl px-3 py-2 text-foreground focus:outline-none"
                  />
                </div>
              </div>

              {/* Line Items */}
              <div className="space-y-2 pt-2 border-t border-border/40">
                <div className="flex justify-between items-center">
                  <span className="text-xs font-extrabold uppercase text-muted-foreground">Line Items</span>
                  <button type="button" onClick={handleAddLineItem} className="text-xs text-primary font-bold hover:underline">
                    + Add Item
                  </button>
                </div>

                {lineItems.map((item, index) => (
                  <div key={item.id} className="grid grid-cols-12 gap-2 items-center">
                    <div className="col-span-6 relative">
                      <input
                        type="text"
                        placeholder="Select Plan or type Description..."
                        value={item.description}
                        onChange={(e) => {
                          const val = e.target.value;
                          handleUpdateItem(item.id, 'description', val);
                          const matches = getPlanPresets(val);
                          setItemSuggestions(matches);
                          setActiveItemIndex(index);
                        }}
                        onFocus={() => {
                          const matches = getPlanPresets(item.description);
                          setItemSuggestions(matches);
                          setActiveItemIndex(index);
                        }}
                        onBlur={() => setTimeout(() => setActiveItemIndex(null), 200)}
                        className="w-full bg-muted/20 border border-border/60 rounded-xl px-3 py-1.5 text-xs text-foreground focus:outline-none"
                      />

                      {activeItemIndex === index && itemSuggestions.length > 0 && (
                        <div className="absolute left-0 right-0 top-full mt-1 bg-card border border-border rounded-2xl shadow-2xl z-50 max-h-48 overflow-y-auto divide-y divide-border/30">
                          {itemSuggestions.map((preset, pIdx) => (
                            <button
                              key={pIdx}
                              type="button"
                              onMouseDown={() => {
                                setLineItems(lineItems.map((l, i) => {
                                  if (i !== index) return l;
                                  return {
                                    ...l,
                                    description: preset.name,
                                    unitPrice: preset.price,
                                    total: (l.quantity || 1) * preset.price
                                  };
                                }));
                                setActiveItemIndex(null);
                              }}
                              className="w-full text-left p-2 hover:bg-muted/30 transition-colors flex justify-between items-center text-xs"
                            >
                              <span className="font-bold text-foreground">{preset.name}</span>
                              <span className="font-mono text-[10px] text-brand font-extrabold">{currency} {preset.price}</span>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>

                    <input
                      type="number"
                      min="1"
                      placeholder="Qty"
                      value={item.quantity}
                      onChange={(e) => handleUpdateItem(item.id, 'quantity', Number(e.target.value))}
                      className="col-span-2 bg-muted/20 border border-border/60 rounded-xl px-2 py-1.5 text-xs text-center"
                    />
                    <input
                      type="number"
                      placeholder="Price"
                      value={item.unitPrice}
                      onChange={(e) => handleUpdateItem(item.id, 'unitPrice', Number(e.target.value))}
                      className="col-span-3 bg-muted/20 border border-border/60 rounded-xl px-2 py-1.5 text-xs text-right font-bold font-mono"
                    />
                    <button
                      type="button"
                      onClick={() => handleRemoveItem(item.id)}
                      className="col-span-1 text-destructive hover:font-bold text-center"
                    >
                      ✕
                    </button>
                  </div>
                ))}
              </div>

              {/* Summary */}
              <div className="bg-muted/20 p-3 rounded-2xl border border-border/40 text-xs space-y-1 text-right">
                <p>Subtotal: <strong>{formatMoney(subtotal, currency)}</strong></p>
                <p className="font-bold text-foreground">Final Total: {formatMoney(finalAmount, currency)}</p>
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <Button variant="ghost" size="sm" onClick={() => setShowCreateModal(false)}>Cancel</Button>
                <Button variant="primary" size="sm" type="submit">Generate & Save Invoice</Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
