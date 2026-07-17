import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApp } from '../contexts/AppContext';
import { useAuth } from '../contexts/AuthContext';
import { collection, query, where, orderBy, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Badge } from '../components/ui/Badge';
import { PlanBadge } from '../components/ui/PlanBadge';
import { Timeline } from '../components/ui/Timeline';
import { Clock, Calendar, CheckCircle2, AlertCircle, FileText, ArrowRight, Loader2 } from 'lucide-react';

export const Subscription: React.FC = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { userPlan, planExpiresAt, plansConfig } = useApp();

  const [paymentHistory, setPaymentHistory] = useState<any[]>([]);
  const [loadingHistory, setLoadingHistory] = useState<boolean>(true);
  const [latestRequest, setLatestRequest] = useState<any | null>(null);

  // Load user's billing/payment requests
  useEffect(() => {
    if (!user) return;

    // Real-time listener for the latest payment request to watch status updates
    const qLatest = query(
      collection(db, 'payment_requests'),
      where('userId', '==', user.uid),
      orderBy('submittedAt', 'desc')
    );

    const unsubLatest = onSnapshot(qLatest, (snapshot) => {
      const docs: any[] = [];
      snapshot.forEach((docSnap) => {
        docs.push({ id: docSnap.id, ...docSnap.data() });
      });
      setPaymentHistory(docs);
      if (docs.length > 0) {
        setLatestRequest(docs[0]);
      } else {
        setLatestRequest(null);
      }
      setLoadingHistory(false);
    }, (err) => {
      console.error('Failed to listen to payment requests:', err);
      setLoadingHistory(false);
    });

    return () => unsubLatest();
  }, [user]);

  const currentPlanDetails = plansConfig[userPlan];
  const isFree = userPlan === 'standard';

  // Construct timeline steps based on latest request status
  const getTimelineSteps = () => {
    if (!latestRequest) return [];

    const submittedTime = latestRequest.submittedAt?.toDate
      ? latestRequest.submittedAt.toDate().toLocaleString()
      : new Date(latestRequest.submittedAt).toLocaleString();

    const verifiedTime = latestRequest.verifiedAt?.toDate
      ? latestRequest.verifiedAt.toDate().toLocaleString()
      : latestRequest.verifiedAt
        ? new Date(latestRequest.verifiedAt).toLocaleString()
        : '';

    const steps = [
      {
        label: 'Payment Submitted',
        description: `Proof of payment sent. Tx ID: ${latestRequest.transactionId} (${latestRequest.paymentMethod})`,
        status: 'success' as const,
        timestamp: submittedTime,
      },
      {
        label: 'Under Verification',
        description: latestRequest.status === 'pending'
          ? 'Administrator is verifying the receipt amount on our banking panel.'
          : 'Receipt verification complete.',
        status: latestRequest.status === 'pending' ? ('pending' as const) : ('success' as const),
      },
      {
        label: latestRequest.status === 'rejected' ? 'Verification Rejected' : 'Plan Activated',
        description: latestRequest.status === 'rejected'
          ? `Reason: ${latestRequest.rejectionReason || 'Incorrect transaction ID or invalid screenshot.'}`
          : latestRequest.status === 'approved'
            ? `Your ${latestRequest.selectedPlan.toUpperCase()} subscription is fully active.`
            : 'Pending approval.',
        status: latestRequest.status === 'approved'
          ? ('success' as const)
          : latestRequest.status === 'rejected'
            ? ('error' as const)
            : ('upcoming' as const),
        timestamp: verifiedTime || undefined,
      },
    ];

    return steps;
  };

  const getDaysRemaining = () => {
    if (!planExpiresAt) return null;
    const diffTime = planExpiresAt.getTime() - Date.now();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return diffDays > 0 ? diffDays : 0;
  };

  const daysRemaining = getDaysRemaining();

  return (
    <div className="max-w-4xl mx-auto space-y-6 text-left py-4 px-2">
      {/* Header */}
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold tracking-tight">My Subscription</h1>
        <p className="text-xs text-muted-foreground">Manage your subscription details, check manual payments status, and see billing histories.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 items-start">
        {/* Main Details Panel */}
        <div className="md:col-span-2 space-y-6">
          {/* Plan Info Card */}
          <Card variant="default" className="p-6 border border-border/80 shadow-sm relative overflow-hidden bg-card">
            {/* Glow accent */}
            <div className="absolute -top-24 -left-24 w-48 h-48 rounded-full bg-brand/5 blur-3xl pointer-events-none" />

            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-b border-border/40 pb-5">
              <div className="space-y-1">
                <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">
                  Current Level
                </span>
                <div className="flex items-center gap-3">
                  <h2 className="text-2xl font-extrabold text-foreground tracking-tight">
                    {currentPlanDetails?.name || 'Standard'}
                  </h2>
                  <PlanBadge plan={userPlan as any} size="md" pulse={latestRequest?.status === 'pending'} />
                </div>
              </div>
              
              {!isFree && daysRemaining !== null && (
                <div className="bg-muted px-4 py-2 rounded-2xl border border-border text-center shrink-0">
                  <span className="block text-[9px] font-bold text-muted-foreground uppercase tracking-wider">
                    Time Remaining
                  </span>
                  <span className="text-lg font-black text-foreground">
                    {daysRemaining} Days
                  </span>
                </div>
              )}
            </div>

            <div className="py-5 grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
              <div className="space-y-1">
                <span className="text-muted-foreground font-semibold">Features Included:</span>
                <ul className="space-y-1.5 leading-relaxed text-foreground/80">
                  <li className="flex items-center gap-1.5">
                    <CheckCircle2 size={12} className="text-success" />
                    Core Ledger (Expenses, Accounts)
                  </li>
                  <li className="flex items-center gap-1.5">
                    <CheckCircle2 size={12} className="text-success" />
                    Savings Goals & Reminders
                  </li>
                  {currentPlanDetails?.features.includes('ai-chat') && (
                    <li className="flex items-center gap-1.5 font-semibold text-brand">
                      <CheckCircle2 size={12} className="text-brand" />
                      AI Financial Copilot ({currentPlanDetails.limits.aiCallsPerDay} calls/day)
                    </li>
                  )}
                  {currentPlanDetails?.features.includes('whatsapp') && (
                    <li className="flex items-center gap-1.5 font-semibold text-warning">
                      <CheckCircle2 size={12} className="text-warning" />
                      WhatsApp Copilot Bridge
                    </li>
                  )}
                </ul>
              </div>

              <div className="space-y-1.5 sm:border-l border-border/40 sm:pl-6">
                <div className="flex items-center gap-1.5 text-muted-foreground">
                  <Calendar size={14} className="shrink-0" />
                  <span>
                    Expires: <strong className="text-foreground">{planExpiresAt ? planExpiresAt.toLocaleDateString() : 'Never (Forever)'}</strong>
                  </span>
                </div>
                <div className="flex items-center gap-1.5 text-muted-foreground">
                  <Clock size={14} className="shrink-0" />
                  <span>
                    Status: <strong className="text-foreground capitalize">{isFree ? 'Free Forever' : 'Active'}</strong>
                  </span>
                </div>
              </div>
            </div>

            <div className="pt-5 border-t border-border/40 flex flex-wrap items-center gap-3">
              <Button
                variant="primary"
                onClick={() => navigate('/upgrade')}
                rightIcon={<ArrowRight size={14} />}
              >
                {isFree ? 'Upgrade Plan' : 'Change Plan'}
              </Button>
              <Button
                variant="ghost"
                onClick={() => navigate('/more')}
                size="sm"
              >
                Return to Tools
              </Button>
            </div>
          </Card>

          {/* Verification Timeline Card */}
          {latestRequest && latestRequest.status === 'pending' && (
            <Card variant="default" className="p-6 border border-warning/20 bg-warning/5 rounded-3xl space-y-4">
              <div className="flex items-start gap-3">
                <Clock className="text-warning shrink-0 mt-0.5" size={20} />
                <div className="space-y-1 flex-1">
                  <h3 className="text-sm font-bold text-foreground">
                    Manual Verification Pending
                  </h3>
                  <p className="text-xs text-muted-foreground leading-normal">
                    We have received your verification request for the <strong>{latestRequest.selectedPlan.toUpperCase()}</strong> plan. Our staff is verifying Transaction ID <code>{latestRequest.transactionId}</code>.
                  </p>
                </div>
              </div>
              <div className="border-t border-warning/10 pt-4 pl-2">
                <Timeline steps={getTimelineSteps()} />
              </div>
            </Card>
          )}

          {latestRequest && latestRequest.status === 'rejected' && (
            <Card variant="default" className="p-6 border border-destructive/20 bg-destructive/5 rounded-3xl space-y-3">
              <div className="flex items-start gap-3">
                <AlertCircle className="text-destructive shrink-0 mt-0.5" size={20} />
                <div className="space-y-1 flex-1">
                  <h3 className="text-sm font-bold text-destructive">
                    Verification Rejected
                  </h3>
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    Reason: <strong className="text-foreground">{latestRequest.rejectionReason || 'Incorrect details.'}</strong>
                  </p>
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    Please double check your Transaction ID and upload a valid receipt image showing transaction date, amount, and reference details.
                  </p>
                </div>
              </div>
              <div className="pt-2 flex justify-start pl-8">
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={() => navigate('/upgrade')}
                >
                  Try Again
                </Button>
              </div>
            </Card>
          )}
        </div>

        {/* Payment History Side Panel */}
        <div className="space-y-6">
          <Card variant="default" className="p-6 border border-border/80 shadow-sm space-y-4 h-full">
            <h3 className="font-extrabold text-sm text-foreground uppercase tracking-wider flex items-center gap-1.5">
              <FileText size={16} /> Billing History
            </h3>

            {loadingHistory ? (
              <div className="py-8 flex flex-col items-center justify-center gap-2">
                <Loader2 className="animate-spin text-primary" size={20} />
                <span className="text-[10px] text-muted-foreground">Loading bills...</span>
              </div>
            ) : paymentHistory.length === 0 ? (
              <div className="py-8 text-center text-xs text-muted-foreground leading-normal">
                No billing transactions recorded.
              </div>
            ) : (
              <div className="space-y-3 max-h-[350px] overflow-y-auto pr-1">
                {paymentHistory.map((item) => {
                  const dateStr = item.submittedAt?.toDate
                    ? item.submittedAt.toDate().toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
                    : new Date(item.submittedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });

                  return (
                    <div
                      key={item.id}
                      className="border border-border/60 bg-muted/10 hover:bg-muted/20 p-3 rounded-2xl space-y-1.5 text-xs text-left transition-colors"
                    >
                      <div className="flex justify-between items-center">
                        <span className="font-bold text-foreground capitalize">
                          {item.selectedPlan} Plan
                        </span>
                        <Badge
                          variant={
                            item.status === 'approved' ? 'success' :
                            item.status === 'rejected' ? 'danger' : 'warning'
                          }
                          size="sm"
                        >
                          {item.status}
                        </Badge>
                      </div>
                      
                      <div className="flex justify-between items-center text-[10px] text-muted-foreground font-semibold">
                        <span>{dateStr}</span>
                        <span>PKR {item.amount}</span>
                      </div>
                      
                      <div className="text-[9px] font-mono text-muted-foreground truncate border-t border-border/30 pt-1 flex justify-between items-center">
                        <span>ID: {item.transactionId}</span>
                        {item.screenshotUrl && (
                          <a
                            href={item.screenshotUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-primary underline font-sans font-bold hover:text-primary/80 transition-colors"
                          >
                            Receipt
                          </a>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
};
