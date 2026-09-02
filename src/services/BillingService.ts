import { db } from '../firebase';
import { collection, getDocs, doc, setDoc, query, orderBy } from 'firebase/firestore';
import { supabase, isSupabaseConfigured } from '../supabase';
import type { Invoice, UserLedger, LedgerTransaction } from '../types/payments';

class BillingService {
  /**
   * Fetch all invoices from Supabase & Firestore with deduplication
   */
  public async getInvoices(): Promise<Invoice[]> {
    const invoicesMap = new Map<string, Invoice>();

    // 1. Fetch from Supabase
    if (isSupabaseConfigured) {
      try {
        const { data, error } = await supabase
          .from('invoices')
          .select('*')
          .order('issued_at', { ascending: false });

        if (!error && data) {
          data.forEach((row: any) => {
            let itemsArray = [];
            try {
              itemsArray = typeof row.items === 'string' ? JSON.parse(row.items) : (row.items || []);
            } catch (e) {
              itemsArray = [];
            }

            const inv: Invoice = {
              id: row.id,
              invoiceNumber: row.invoice_number || `INV-${row.id.substring(0, 6)}`,
              userId: row.user_id,
              userEmail: row.user_email || '',
              userName: row.user_name || 'Customer',
              amount: Number(row.amount || 0),
              taxAmount: Number(row.tax_amount || 0),
              discountAmount: Number(row.discount_amount || 0),
              finalAmount: Number(row.final_amount || row.amount || 0),
              currency: row.currency || 'PKR',
              exchangeRate: row.exchange_rate ? Number(row.exchange_rate) : (row.exchangeRate ? Number(row.exchangeRate) : undefined),
              status: row.status || 'unpaid',
              issuedAt: row.issued_at || new Date().toISOString(),
              dueDate: row.due_date || new Date().toISOString(),
              paidAt: row.paid_at,
              paymentMethod: row.payment_method,
              paymentRequestId: row.payment_request_id,
              transactionId: row.transaction_id,
              items: itemsArray,
              notes: row.notes,
              pdfUrl: row.pdf_url,
              createdFrom: row.created_from || 'manual'
            };
            invoicesMap.set(inv.id, inv);
          });
        }
      } catch (err) {
        console.warn('[BillingService] Supabase invoices read warning:', err);
      }
    }

    // 2. Fetch from Firestore fallback
    if (db) {
      try {
        const snap = await getDocs(query(collection(db, 'invoices'), orderBy('issuedAt', 'desc')));
        snap.docs.forEach(docSnap => {
          if (!invoicesMap.has(docSnap.id)) {
            const data = docSnap.data();
            const inv: Invoice = {
              id: docSnap.id,
              invoiceNumber: data.invoiceNumber || `INV-${docSnap.id.substring(0, 6)}`,
              userId: data.userId || data.user_id || '',
              userEmail: data.userEmail || data.user_email || '',
              userName: data.userName || data.user_name || 'Customer',
              amount: Number(data.amount || 0),
              taxAmount: Number(data.taxAmount || 0),
              discountAmount: Number(data.discountAmount || 0),
              finalAmount: Number(data.finalAmount || data.amount || 0),
              currency: data.currency || 'PKR',
              exchangeRate: data.exchangeRate ? Number(data.exchangeRate) : (data.exchange_rate ? Number(data.exchange_rate) : undefined),
              status: data.status || 'unpaid',
              issuedAt: data.issuedAt || new Date().toISOString(),
              dueDate: data.dueDate || new Date().toISOString(),
              paidAt: data.paidAt,
              paymentMethod: data.paymentMethod,
              paymentRequestId: data.paymentRequestId,
              transactionId: data.transactionId,
              items: data.items || [],
              notes: data.notes,
              pdfUrl: data.pdfUrl,
              createdFrom: data.createdFrom || 'manual'
            };
            invoicesMap.set(inv.id, inv);
          }
        });
      } catch (err) {
        console.warn('[BillingService] Firestore invoices read warning:', err);
      }
    }

    return Array.from(invoicesMap.values());
  }

  /**
   * Save or Update an Invoice (Dual-sync)
   */
  public async saveInvoice(invoice: Invoice): Promise<void> {
    // Write to Firestore
    if (db) {
      try {
        await setDoc(doc(db, 'invoices', invoice.id), {
          ...invoice,
          updatedAt: new Date().toISOString()
        }, { merge: true });
      } catch (err) {
        console.warn('[BillingService] Firestore invoice write warning:', err);
      }
    }

    // Write to Supabase
    if (isSupabaseConfigured) {
      try {
        await supabase.from('invoices').upsert({
          id: invoice.id,
          invoice_number: invoice.invoiceNumber,
          user_id: invoice.userId,
          user_email: invoice.userEmail,
          user_name: invoice.userName,
          amount: invoice.amount,
          tax_amount: invoice.taxAmount || 0,
          discount_amount: invoice.discountAmount || 0,
          final_amount: invoice.finalAmount,
          currency: invoice.currency,
          exchange_rate: invoice.exchangeRate || null,
          status: invoice.status,
          issued_at: invoice.issuedAt,
          due_date: invoice.dueDate,
          paid_at: invoice.paidAt,
          payment_method: invoice.paymentMethod,
          payment_request_id: invoice.paymentRequestId,
          transaction_id: invoice.transactionId,
          items: JSON.stringify(invoice.items || []),
          notes: invoice.notes,
          pdf_url: invoice.pdfUrl,
          created_from: invoice.createdFrom,
          updated_at: new Date().toISOString()
        });
      } catch (err) {
        console.warn('[BillingService] Supabase invoice write warning:', err);
      }
    }
  }

  /**
   * Fetch User Ledgers (Advance & Outstanding Dues)
   */
  public async getUserLedgers(): Promise<UserLedger[]> {
    const ledgersMap = new Map<string, UserLedger>();

    // 1. Fetch from Supabase
    if (isSupabaseConfigured) {
      try {
        const { data, error } = await supabase.from('user_ledgers').select('*');
        if (!error && data) {
          data.forEach((row: any) => {
            let hist = [];
            try {
              hist = typeof row.history === 'string' ? JSON.parse(row.history) : (row.history || []);
            } catch (e) { hist = []; }

            ledgersMap.set(row.user_id, {
              userId: row.user_id,
              userEmail: row.user_email || '',
              userName: row.user_name || 'User',
              advanceCredit: Number(row.advance_credit || 0),
              outstandingDues: Number(row.outstanding_dues || 0),
              currency: row.currency || 'PKR',
              lastUpdated: row.last_updated || new Date().toISOString(),
              history: hist
            });
          });
        }
      } catch (err) {
        console.warn('[BillingService] Supabase user_ledgers read warning:', err);
      }
    }

    // 2. Fetch from Firestore fallback
    if (db) {
      try {
        const snap = await getDocs(collection(db, 'user_ledgers'));
        snap.docs.forEach(docSnap => {
          if (!ledgersMap.has(docSnap.id)) {
            const d = docSnap.data();
            ledgersMap.set(docSnap.id, {
              userId: docSnap.id,
              userEmail: d.userEmail || d.user_email || '',
              userName: d.userName || d.user_name || 'User',
              advanceCredit: Number(d.advanceCredit || 0),
              outstandingDues: Number(d.outstandingDues || 0),
              currency: d.currency || 'PKR',
              lastUpdated: d.lastUpdated || new Date().toISOString(),
              history: d.history || []
            });
          }
        });
      } catch (err) {
        console.warn('[BillingService] Firestore user_ledgers read warning:', err);
      }
    }

    return Array.from(ledgersMap.values());
  }

  /**
   * Save / Update a User Ledger Entry
   */
  public async saveUserLedger(ledger: UserLedger): Promise<void> {
    if (db) {
      try {
        await setDoc(doc(db, 'user_ledgers', ledger.userId), {
          ...ledger,
          lastUpdated: new Date().toISOString()
        }, { merge: true });
      } catch (err) {
        console.warn('[BillingService] Firestore user_ledger write warning:', err);
      }
    }

    if (isSupabaseConfigured) {
      try {
        await supabase.from('user_ledgers').upsert({
          user_id: ledger.userId,
          user_email: ledger.userEmail,
          user_name: ledger.userName,
          advance_credit: ledger.advanceCredit,
          outstanding_dues: ledger.outstandingDues,
          currency: ledger.currency,
          last_updated: new Date().toISOString(),
          history: JSON.stringify(ledger.history || [])
        });
      } catch (err) {
        console.warn('[BillingService] Supabase user_ledger write warning:', err);
      }
    }
  }

  /**
   * Record a Ledger Transaction (Advance Credit or Outstanding Due Adjustment)
   */
  public async adjustUserLedger(
    userId: string,
    userEmail: string,
    userName: string,
    type: 'advance_credit' | 'due_recorded' | 'invoice_payment' | 'adjustment',
    amount: number,
    description: string,
    adminEmail: string = 'admin',
    referenceId?: string
  ): Promise<UserLedger> {
    const allLedgers = await this.getUserLedgers();
    let ledger = allLedgers.find(l => l.userId === userId);

    if (!ledger) {
      ledger = {
        userId,
        userEmail,
        userName,
        advanceCredit: 0,
        outstandingDues: 0,
        currency: 'PKR',
        lastUpdated: new Date().toISOString(),
        history: []
      };
    }

    const tx: LedgerTransaction = {
      id: `tx_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`,
      type,
      amount,
      currency: ledger.currency || 'PKR',
      description,
      performedBy: adminEmail,
      referenceId,
      timestamp: new Date().toISOString()
    };

    if (type === 'advance_credit') {
      ledger.advanceCredit += amount;
    } else if (type === 'due_recorded') {
      ledger.outstandingDues += amount;
    } else if (type === 'invoice_payment') {
      if (ledger.outstandingDues > 0) {
        const remainingDues = Math.max(0, ledger.outstandingDues - amount);
        const overflow = amount - (ledger.outstandingDues - remainingDues);
        ledger.outstandingDues = remainingDues;
        if (overflow > 0) {
          ledger.advanceCredit += overflow;
        }
      } else {
        ledger.advanceCredit += amount;
      }
    } else if (type === 'adjustment') {
      // Direct adjustment
    }

    ledger.history.unshift(tx);
    ledger.lastUpdated = new Date().toISOString();

    await this.saveUserLedger(ledger);
    return ledger;
  }

  /**
   * Helper to generate auto-increment invoice numbers (INV-YYYY-XXXX)
   */
  public generateInvoiceNumber(seq: number): string {
    const year = new Date().getFullYear();
    const formattedSeq = String(seq).padStart(4, '0');
    return `INV-${year}-${formattedSeq}`;
  }
}

export const billingService = new BillingService();
