export type InvoiceStatus = 'paid' | 'unpaid' | 'overdue' | 'cancelled';

export interface InvoiceItem {
  id: string;
  description: string;
  quantity: number;
  unitPrice: number;
  total: number;
}

export interface Invoice {
  id: string;
  invoiceNumber: string; // e.g. INV-2026-0001
  userId: string;
  userEmail: string;
  userName: string;
  amount: number;
  taxAmount?: number;
  discountAmount?: number;
  finalAmount: number;
  currency: string; // e.g. PKR, USD
  exchangeRate?: number; // e.g. 280 (1 USD = 280 PKR)
  status: InvoiceStatus;
  issuedAt: string; // ISO String
  dueDate: string;  // ISO String
  paidAt?: string;  // ISO String
  paymentMethod?: string;
  paymentRequestId?: string;
  transactionId?: string;
  items: InvoiceItem[];
  notes?: string;
  pdfUrl?: string;
  createdFrom?: 'manual' | 'verification' | 'recurring';
}

export interface LedgerTransaction {
  id: string;
  type: 'advance_credit' | 'due_recorded' | 'invoice_payment' | 'adjustment';
  amount: number;
  currency: string;
  description: string;
  referenceId?: string; // invoiceId or paymentRequestId
  performedBy: string; // admin email or 'system'
  timestamp: string;
}

export interface UserLedger {
  userId: string;
  userEmail: string;
  userName: string;
  advanceCredit: number;   // Money paid in advance / positive balance
  outstandingDues: number; // Unpaid dues owed by user
  currency: string;
  lastUpdated: string;
  history: LedgerTransaction[];
}

export interface PaymentRequest {
  id: string;
  userId: string;
  userName: string;
  userEmail: string;
  selectedPlan: string;
  paymentMethod: string;
  amount: number;
  currency: string;
  transactionId: string;
  screenshotUrl?: string;
  notes?: string;
  status: 'pending' | 'approved' | 'rejected';
  rejectionReason?: string;
  userCoords?: { lat: number; lng: number };
  submittedFromIP?: string;
  submittedAt: string;
  verifiedAt?: string;
}

export interface PaymentAccount {
  id: string;
  method: string;
  holderName: string;
  accountNumber: string;
  iban?: string;
  instructions?: string;
  isActive: boolean;
  displayOrder: number;
  qrCodeUrl?: string;
}

export interface PlanConfig {
  id: string;
  name: string;
  price: number;
  currency: string;
  billingCycle: 'monthly' | 'yearly' | 'forever';
  features: string[];
  limits: {
    aiCallsPerDay: number;
    maxTransactions: number;
    maxUploadsPerDay: number;
  };
  badgeIcon: string;
  badgeColor: string;
  displayOrder: number;
}
