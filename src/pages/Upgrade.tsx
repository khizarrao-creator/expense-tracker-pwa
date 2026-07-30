import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApp } from '../contexts/AppContext';
import { supabase, isSupabaseConfigured } from '../supabase';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Badge } from '../components/ui/Badge';
import { FileUpload } from '../components/ui/FileUpload';
import { PlanBadge } from '../components/ui/PlanBadge';
import { getApiUrl } from '../services/whatsappService';
import { uploadToCloudinary } from '../services/cloudinaryService';
import { auth } from '../firebase';
import { Check, Shield, Zap, Crown, ArrowRight, ArrowLeft, Loader2, QrCode, AlertTriangle, Info } from 'lucide-react';
import { toast } from 'sonner';

export const Upgrade: React.FC = () => {
  const navigate = useNavigate();
  const { userPlan, plansConfig, config } = useApp();
  const exchangeRate = config.exchangeRate || 280; // 1 USD = 280 PKR default

  // Steps: 1 = Plan Selection, 2 = Payment Method, 3 = Submit Proof
  const [step, setStep] = useState<number>(1);
  const [selectedPlanId, setSelectedPlanId] = useState<string>('pro');
  
  // Payment accounts load
  const [paymentAccounts, setPaymentAccounts] = useState<any[]>([]);
  const [selectedAccountId, setSelectedAccountId] = useState<string>('');
  const [loadingAccounts, setLoadingAccounts] = useState<boolean>(false);

  // Form inputs
  const [txId, setTxId] = useState<string>('');
  const [amountPaid, setAmountPaid] = useState<string>('');
  const [notes, setNotes] = useState<string>('');
  const [screenshotFile, setScreenshotFile] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);

  // Load active payment accounts from Supabase
  const loadPaymentAccounts = async () => {
    setLoadingAccounts(true);
    try {
      if (isSupabaseConfigured) {
        const { data } = await supabase.from('payment_accounts').select('*').eq('is_active', true).order('display_order', { ascending: true });
        const active = (data || []).map((acc: any) => ({
          id: acc.id,
          method: acc.method,
          holderName: acc.holder_name,
          accountNumber: acc.account_number,
          iban: acc.iban,
          qrCodeUrl: acc.qr_code_url,
          instructions: acc.instructions
        }));
        setPaymentAccounts(active);
        if (active.length > 0) {
          setSelectedAccountId(active[0].id);
        }
      }
    } catch (e) {
      console.error('Failed to load payment accounts:', e);
      toast.error('Could not load payment account details.');
    } finally {
      setLoadingAccounts(false);
    }
  };

  useEffect(() => {
    loadPaymentAccounts();
    
    // Request geolocation coordinates on load (with consent)
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          setCoords({
            lat: position.coords.latitude,
            lng: position.coords.longitude
          });
        },
        (error) => {
          console.warn('Geolocation consent denied or failed:', error.message);
        }
      );
    }
  }, []);

  const getPlanUSDPrice = (planKey: string) => {
    const plan = plansConfig[planKey];
    if (!plan || plan.price === 0) return '$0.00';
    // Convert local price (PKR) to USD using exchange rate
    return `$${(plan.price / exchangeRate).toFixed(2)}`;
  };

  const selectedPlanDetails = plansConfig[selectedPlanId];
  const selectedAccount = paymentAccounts.find(acc => acc.id === selectedAccountId);

  // Proceed to step 2
  const handleSelectPlan = (planId: string) => {
    if (planId === userPlan) {
      toast.info('You are already subscribed to this plan.');
      return;
    }
    if (planId === 'standard') {
      toast.info('To cancel/downgrade your active plan, please contact the administrator.');
      return;
    }
    setSelectedPlanId(planId);
    
    // Auto-fill price in form
    const plan = plansConfig[planId];
    if (plan) {
      setAmountPaid(plan.price.toString()); // default amount in PKR
    }
    
    setStep(2);
  };

  // Submit payment request
  const handleSubmitProof = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!txId.trim()) {
      toast.error('Transaction ID is required.');
      return;
    }
    if (!amountPaid || parseFloat(amountPaid) <= 0) {
      toast.error('Valid Amount Paid is required.');
      return;
    }
    if (!screenshotFile) {
      toast.error('Please upload a screenshot of your payment receipt.');
      return;
    }

    setSubmitting(true);
    toast.loading('Uploading transaction proof...', { id: 'submit-proof' });

    try {
      // 1. Upload screenshot securely using signed API gateway endpoint
      const screenshotUrl = await uploadToCloudinary(screenshotFile, 'payment_proofs');
      
      // 2. Submit payment metadata to the server
      const idToken = auth.currentUser ? await auth.currentUser.getIdToken() : '';
      const response = await fetch(getApiUrl('/api/payments/submit'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${idToken}`
        },
        body: JSON.stringify({
          selectedPlan: selectedPlanId,
          paymentMethod: selectedAccount?.method || 'Manual',
          amount: parseFloat(amountPaid),
          currency: 'PKR',
          transactionId: txId.trim(),
          screenshotUrl,
          notes,
          userCoords: coords
        })
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || 'Failed to submit payment verification request.');
      }

      toast.success('Verification request submitted successfully!', { id: 'submit-proof' });
      navigate('/subscription'); // Redirect to user billing/timeline screen
    } catch (err: any) {
      console.error('[Proof Submit Error]:', err);
      toast.error(err.message || 'Payment submission failed. Check console.', { id: 'submit-proof' });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6 text-left py-4 px-2">
      {/* Header */}
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold tracking-tight">Upgrade Subscription</h1>
        <p className="text-xs text-muted-foreground">Select a premium plan and unlock advanced financial capabilities.</p>
      </div>

      {/* STEP 1: Plan Selection */}
      {step === 1 && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {Object.entries(plansConfig)
            .sort((a, b) => (a[1].displayOrder || 0) - (b[1].displayOrder || 0))
            .map(([planId, details]) => {
              const isCurrent = userPlan === planId;
              const isMax = planId === 'max';
              const isPro = planId === 'pro';
              const isFree = details.price === 0;

              return (
                <Card
                  key={planId}
                  variant={isCurrent ? 'elevated' : 'default'}
                  className={`flex flex-col justify-between h-full border ${
                    isCurrent ? 'border-primary shadow-lg ring-1 ring-primary' : 'border-border/80'
                  } p-6 relative`}
                >
                  {isCurrent && (
                    <Badge variant="info" className="absolute top-4 right-4" size="sm" dot pulse>
                      Active Plan
                    </Badge>
                  )}

                  <div className="space-y-4">
                    <div className="space-y-1.5">
                      <div className="flex items-center gap-2">
                        {isMax ? <Crown size={20} className="text-warning" /> : isPro ? <Zap size={20} className="text-brand" /> : <Shield size={20} className="text-muted-foreground" />}
                        <h3 className="font-extrabold text-lg text-foreground">{details.name}</h3>
                      </div>
                      <p className="text-[10px] text-muted-foreground leading-normal">
                        {isFree ? 'Essential tools for budgeting' : isPro ? 'Advanced tracking and smart AI insights' : 'Unlimited operations and cross-channel sync'}
                      </p>
                    </div>

                    <div className="py-2 border-y border-border/40">
                      <span className="text-3xl font-black text-foreground">
                        {getPlanUSDPrice(planId)}
                      </span>
                      <span className="text-xs text-muted-foreground font-semibold">
                        /{details.billingCycle === 'monthly' ? 'mo' : details.billingCycle}
                      </span>
                      {!isFree && (
                        <p className="text-[10px] text-muted-foreground font-semibold mt-1">
                          Approx. {details.price} PKR / month (Exchange Rate: ${exchangeRate})
                        </p>
                      )}
                    </div>

                    <ul className="space-y-2.5 text-xs text-foreground/80">
                      {details.features.includes('transactions') && (
                        <li className="flex items-start gap-2">
                          <Check size={14} className="text-success shrink-0 mt-0.5" />
                          <span>Core Ledger (Transactions, Categories)</span>
                        </li>
                      )}
                      <li className="flex items-start gap-2">
                        <Check size={14} className="text-success shrink-0 mt-0.5" />
                        <span>
                          {details.limits.maxTransactions === -1 
                            ? 'Unlimited Local Transactions' 
                            : `Up to ${details.limits.maxTransactions.toLocaleString()} txs`}
                        </span>
                      </li>
                      <li className="flex items-start gap-2">
                        <Check size={14} className="text-success shrink-0 mt-0.5" />
                        <span>Savings Goals & Reminders</span>
                      </li>
                      <li className="flex items-start gap-2">
                        <Check size={14} className="text-success shrink-0 mt-0.5" />
                        <span>Dynamic Spending Heatmap</span>
                      </li>
                      {details.features.includes('ai-chat') ? (
                        <li className="flex items-start gap-2 font-bold text-brand">
                          <Zap size={14} className="text-brand shrink-0 mt-0.5 fill-brand/10" />
                          <span>AI Financial Copilot ({details.limits.aiCallsPerDay} calls/day)</span>
                        </li>
                      ) : (
                        <li className="flex items-start gap-2 opacity-40 line-through">
                          <Check size={14} className="shrink-0 mt-0.5" />
                          <span>AI Financial Copilot</span>
                        </li>
                      )}
                      {details.features.includes('whatsapp') ? (
                        <li className="flex items-start gap-2 font-bold text-warning">
                          <Crown size={14} className="text-warning shrink-0 mt-0.5 fill-warning/10" />
                          <span>WhatsApp Copilot Link</span>
                        </li>
                      ) : (
                        <li className="flex items-start gap-2 opacity-40 line-through">
                          <Check size={14} className="shrink-0 mt-0.5" />
                          <span>WhatsApp Copilot Link</span>
                        </li>
                      )}
                      {details.features.includes('investments') ? (
                        <li className="flex items-start gap-2 font-bold text-warning">
                          <Crown size={14} className="text-warning shrink-0 mt-0.5 fill-warning/10" />
                          <span>MEXC Crypto Portfolio Integration</span>
                        </li>
                      ) : (
                        <li className="flex items-start gap-2 opacity-40 line-through">
                          <Check size={14} className="shrink-0 mt-0.5" />
                          <span>MEXC Crypto Integration</span>
                        </li>
                      )}
                    </ul>
                  </div>

                  <div className="pt-6 mt-6 border-t border-border/40">
                    {isCurrent ? (
                      <Button variant="outline" fullWidth disabled>
                        Currently Subscribed
                      </Button>
                    ) : isFree ? (
                      <Button variant="outline" fullWidth disabled>
                        Free Tier
                      </Button>
                    ) : (
                      <Button
                        variant={isMax ? 'primary' : 'outline'}
                        fullWidth
                        onClick={() => handleSelectPlan(planId)}
                        rightIcon={<ArrowRight size={14} />}
                      >
                        Select {details.name}
                      </Button>
                    )}
                  </div>
                </Card>
              );
            })}
        </div>
      )}

      {/* STEP 2 & 3: Selection and Proof Submission */}
      {step > 1 && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
          {/* Main payment form (Step 2 and 3) */}
          <div className="lg:col-span-2 space-y-6">
            <Card variant="default" className="p-6 border border-border/80 shadow-sm space-y-6">
              {/* Navigation Back */}
              <button
                onClick={() => setStep(step - 1)}
                className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1.5 font-bold uppercase tracking-wider"
              >
                <ArrowLeft size={14} /> Back to {step === 2 ? 'Plans' : 'Payment Account'}
              </button>

              <div className="flex items-center justify-between gap-4 border-b border-border/40 pb-4">
                <div className="space-y-1">
                  <h2 className="text-base font-extrabold text-foreground">
                    {step === 2 ? 'Select Payment Method' : 'Submit Transaction Proof'}
                  </h2>
                  <p className="text-xs text-muted-foreground">
                    Plan: <strong className="text-foreground">{selectedPlanDetails?.name}</strong> • Amount: <strong className="text-foreground">{getPlanUSDPrice(selectedPlanId)} ({selectedPlanDetails?.price} PKR)</strong>
                  </p>
                </div>
                <PlanBadge plan={selectedPlanId as any} />
              </div>

              {step === 2 && (
                <div className="space-y-6">
                  {loadingAccounts ? (
                    <div className="py-12 flex flex-col items-center justify-center gap-2">
                      <Loader2 className="animate-spin text-primary" size={24} />
                      <span className="text-xs text-muted-foreground font-medium">Loading payment accounts...</span>
                    </div>
                  ) : paymentAccounts.length === 0 ? (
                    <div className="py-12 text-center border border-dashed border-border rounded-2xl p-6 bg-muted/10 space-y-2">
                      <AlertTriangle className="text-warning mx-auto" size={28} />
                      <h4 className="text-sm font-bold text-foreground">No Payment Accounts Configured</h4>
                      <p className="text-xs text-muted-foreground max-w-xs mx-auto">
                        The administrator has not configured any payment options. Please check back later.
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        {paymentAccounts.map((acc) => (
                          <div
                            key={acc.id}
                            onClick={() => setSelectedAccountId(acc.id)}
                            className={`border rounded-2xl p-4 cursor-pointer transition-all duration-200 text-left flex flex-col gap-2 relative ${
                              selectedAccountId === acc.id
                                ? 'border-primary bg-primary/5 shadow-sm'
                                : 'border-border hover:border-primary/40 bg-card'
                            }`}
                          >
                            {selectedAccountId === acc.id && (
                              <div className="absolute top-3 right-3 h-5 w-5 rounded-full bg-primary text-primary-foreground flex items-center justify-center border border-primary">
                                <Check size={10} className="stroke-[3]" />
                              </div>
                            )}
                            <h4 className="font-extrabold text-sm text-foreground flex items-center gap-2">
                              {acc.method}
                            </h4>
                            <div className="space-y-0.5 text-xs text-muted-foreground leading-normal">
                              <p>Holder: <strong className="text-foreground/80 font-medium">{acc.holderName}</strong></p>
                              <p>Account: <strong className="text-foreground/80 font-semibold">{acc.accountNumber}</strong></p>
                              {acc.iban && <p className="truncate">IBAN: <strong className="text-foreground/80 font-mono font-medium">{acc.iban}</strong></p>}
                            </div>
                          </div>
                        ))}
                      </div>

                      {/* Display Selected Account Instructions */}
                      {selectedAccount && (
                        <div className="border border-border/80 bg-muted/20 p-5 rounded-2xl space-y-4 animate-in fade-in duration-200">
                          <h4 className="text-xs font-bold text-foreground uppercase tracking-wider">
                            Payment Instructions
                          </h4>
                          <div className="flex flex-col sm:flex-row gap-5 items-start">
                            {selectedAccount.qrCodeUrl && (
                              <div className="bg-white p-2.5 rounded-xl border border-border shrink-0 flex flex-col items-center gap-1.5 shadow-sm">
                                <img
                                  src={selectedAccount.qrCodeUrl}
                                  alt="QR Code"
                                  className="w-28 h-28 object-contain"
                                />
                                <span className="text-[9px] font-bold text-slate-500 uppercase tracking-widest flex items-center gap-1">
                                  <QrCode size={10} /> Scan QR
                                </span>
                              </div>
                            )}
                            <div className="space-y-3 flex-1 text-xs">
                              <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-2 leading-relaxed">
                                <p className="text-muted-foreground">Account Holder: <strong className="text-foreground block">{selectedAccount.holderName}</strong></p>
                                <p className="text-muted-foreground">Account Number: <strong className="text-foreground block font-semibold">{selectedAccount.accountNumber}</strong></p>
                                {selectedAccount.iban && (
                                  <p className="text-muted-foreground sm:col-span-2">IBAN / Bank Code: <strong className="text-foreground block font-mono font-semibold">{selectedAccount.iban}</strong></p>
                                )}
                                <p className="text-muted-foreground sm:col-span-2">Amount to Transfer: <strong className="text-foreground block text-sm font-black">{selectedPlanDetails?.price} PKR</strong></p>
                              </div>
                              {selectedAccount.instructions && (
                                <div className="pt-3 border-t border-border/40 text-[11px] text-muted-foreground whitespace-pre-wrap leading-relaxed italic">
                                  "{selectedAccount.instructions}"
                                </div>
                              )}
                            </div>
                          </div>
                          <Button
                            variant="primary"
                            fullWidth
                            onClick={() => setStep(3)}
                            rightIcon={<ArrowRight size={14} />}
                          >
                            I Have Transferred the Money
                          </Button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

              {step === 3 && (
                <form onSubmit={handleSubmitProof} className="space-y-5">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <Input
                      label="Transaction ID (Required)"
                      placeholder="e.g. SDA29382939"
                      value={txId}
                      onChange={e => setTxId(e.target.value)}
                      required
                      helperText="Please input the precise Transaction ID provided in your payment receipt."
                    />
                    <Input
                      label="Amount Transferred (PKR)"
                      type="number"
                      value={amountPaid}
                      onChange={e => setAmountPaid(e.target.value)}
                      required
                      disabled // Lock to exact plan pricing to prevent manual mismatch
                      helperText="Amount is locked to the selected subscription price."
                    />
                  </div>

                  <Input
                    as="textarea"
                    label="Notes (Optional)"
                    placeholder="Provide any additional transaction details or references..."
                    value={notes}
                    onChange={e => setNotes(e.target.value)}
                    rows={2}
                  />

                  <FileUpload
                    label="Upload Receipt Screenshot (Required)"
                    onFileSelect={setScreenshotFile}
                  />

                  <div className="bg-amber-500/10 border border-warning/20 p-4 rounded-xl flex items-start gap-3">
                    <Info className="text-warning shrink-0" size={16} />
                    <p className="text-[10px] text-warning-foreground leading-normal font-medium">
                      Verification requests are reviewed manually. Submitting fake receipts, duplicate transaction IDs, or mismatched details will result in account suspension.
                    </p>
                  </div>

                  <div className="pt-3 border-t border-border/40 flex items-center justify-end gap-3">
                    <Button
                      variant="outline"
                      onClick={() => setStep(2)}
                      disabled={submitting}
                    >
                      Back
                    </Button>
                    <Button
                      type="submit"
                      variant="primary"
                      loading={submitting}
                    >
                      Submit Verification
                    </Button>
                  </div>
                </form>
              )}
            </Card>
          </div>

          {/* Pricing Info Side Panel */}
          <div className="space-y-6">
            <Card variant="default" className="p-6 border border-border/80 shadow-sm space-y-4">
              <h3 className="font-extrabold text-sm text-foreground uppercase tracking-wider">
                Summary
              </h3>
              
              <div className="space-y-3 text-xs leading-normal">
                <div className="flex justify-between border-b border-border/40 pb-2.5">
                  <span className="text-muted-foreground">Plan</span>
                  <span className="font-bold text-foreground">{selectedPlanDetails?.name}</span>
                </div>
                <div className="flex justify-between border-b border-border/40 pb-2.5">
                  <span className="text-muted-foreground">Billing Cycle</span>
                  <span className="font-bold text-foreground uppercase tracking-wider text-[10px]">{selectedPlanDetails?.billingCycle}</span>
                </div>
                <div className="flex justify-between border-b border-border/40 pb-2.5">
                  <span className="text-muted-foreground">Original Price (PKR)</span>
                  <span className="font-bold text-foreground">{selectedPlanDetails?.price} PKR</span>
                </div>
                <div className="flex justify-between border-b border-border/40 pb-2.5">
                  <span className="text-muted-foreground">Exchange Rate</span>
                  <span className="font-bold text-foreground font-mono">1 USD = {exchangeRate} PKR</span>
                </div>
                <div className="flex justify-between text-sm pt-1">
                  <span className="font-extrabold text-foreground">Total Display Price</span>
                  <span className="font-black text-brand text-base">
                    {getPlanUSDPrice(selectedPlanId)}
                  </span>
                </div>
              </div>
            </Card>

            <Card variant="default" className="p-6 border border-border/80 shadow-sm bg-muted/20 space-y-3">
              <h4 className="font-bold text-xs text-foreground uppercase tracking-wider">
                Manual Verification FAQ
              </h4>
              <div className="space-y-2.5 text-xs text-muted-foreground leading-normal">
                <p>
                  <strong>How long does it take?</strong><br />
                  Review processes take between 2 to 24 hours. You will receive an in-app notification upon approval or rejection.
                </p>
                <p>
                  <strong>Can I use any bank account?</strong><br />
                  Yes! You can transfer from any mobile wallet or bank to the configured SadaPay/Easypaisa accounts shown.
                </p>
              </div>
            </Card>
          </div>
        </div>
      )}
    </div>
  );
};
