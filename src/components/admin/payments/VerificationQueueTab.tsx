import React, { useState } from 'react';
import type { PaymentRequest } from '../../../types/payments';
import { Badge } from '../../ui/Badge';
import { Button } from '../../ui/Button';
import { PlanBadge } from '../../ui/PlanBadge';
import { Clock, CheckCircle2, XCircle, Eye, MapPin, Search, Filter } from 'lucide-react';
import { toast } from 'sonner';

interface VerificationQueueTabProps {
  paymentRequests: PaymentRequest[];
  onApprove: (req: PaymentRequest, expiryDate: string, notes?: string) => Promise<void>;
  onReject: (req: PaymentRequest, reason: string) => Promise<void>;
  isLoading: boolean;
}

export const VerificationQueueTab: React.FC<VerificationQueueTabProps> = ({
  paymentRequests,
  onApprove,
  onReject,
  isLoading
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'pending' | 'approved' | 'rejected'>('all');
  const [selectedRequest, setSelectedRequest] = useState<PaymentRequest | null>(null);
  
  const [showApprovalModal, setShowApprovalModal] = useState(false);
  const [showRejectionModal, setShowRejectionModal] = useState(false);
  const [rejectionReason, setRejectionReason] = useState('');
  const [internalNotes, setInternalNotes] = useState('');
  const [customExpiryDate, setCustomExpiryDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() + 30);
    return d.toISOString().split('T')[0];
  });

  const filteredRequests = paymentRequests.filter(req => {
    const matchesSearch = 
      (req.userName || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
      (req.userEmail || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
      (req.transactionId || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
      (req.selectedPlan || '').toLowerCase().includes(searchQuery.toLowerCase());

    const matchesStatus = statusFilter === 'all' || req.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const handleConfirmApproval = async () => {
    if (!selectedRequest) return;
    try {
      await onApprove(selectedRequest, customExpiryDate, internalNotes);
      setShowApprovalModal(false);
      setSelectedRequest(null);
      setInternalNotes('');
    } catch (e: any) {
      toast.error('Approval failed: ' + (e.message || e));
    }
  };

  const handleConfirmRejection = async () => {
    if (!selectedRequest || !rejectionReason.trim()) {
      toast.error('Please enter a rejection reason.');
      return;
    }
    try {
      await onReject(selectedRequest, rejectionReason.trim());
      setShowRejectionModal(false);
      setSelectedRequest(null);
      setRejectionReason('');
    } catch (e: any) {
      toast.error('Rejection failed: ' + (e.message || e));
    }
  };

  return (
    <div className="space-y-6 text-left">
      {/* Top Filter Bar */}
      <div className="flex flex-col sm:flex-row justify-between items-stretch sm:items-center gap-4 bg-card border border-border/80 rounded-3xl p-4 shadow-sm">
        <div className="relative flex-1">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground" size={16} />
          <input
            type="text"
            placeholder="Search by User, Email, Transaction ID, Plan..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2 bg-muted/20 border border-border/60 rounded-2xl text-xs focus:outline-none focus:ring-2 focus:ring-primary/40"
          />
        </div>

        <div className="flex items-center gap-2">
          <Filter className="text-muted-foreground shrink-0" size={14} />
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as any)}
            className="bg-muted/20 border border-border/60 rounded-2xl px-3 py-2 text-xs font-semibold text-foreground focus:outline-none"
          >
            <option value="all">All Statuses ({paymentRequests.length})</option>
            <option value="pending">Pending ({paymentRequests.filter(r => r.status === 'pending').length})</option>
            <option value="approved">Approved ({paymentRequests.filter(r => r.status === 'approved').length})</option>
            <option value="rejected">Rejected ({paymentRequests.filter(r => r.status === 'rejected').length})</option>
          </select>
        </div>
      </div>

      {/* Main Table */}
      <div className="bg-card border border-border rounded-3xl p-5 shadow-sm space-y-4">
        <div className="flex items-center justify-between gap-3 border-b border-border/40 pb-4">
          <div className="flex items-center gap-2">
            <Clock className="text-primary" size={18} />
            <h3 className="font-extrabold text-sm text-foreground">Pending Verification Queue</h3>
          </div>
          <Badge variant="info" size="sm">
            {paymentRequests.filter(r => r.status === 'pending').length} Pending
          </Badge>
        </div>

        {filteredRequests.length === 0 ? (
          <div className="py-12 text-center text-xs text-muted-foreground italic">
            No payment verification requests found matching your filters.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-border/40 text-muted-foreground font-semibold">
                  <th className="py-3 px-2">User</th>
                  <th className="py-3 px-2">Plan</th>
                  <th className="py-3 px-2">Method</th>
                  <th className="py-3 px-2">Tx ID</th>
                  <th className="py-3 px-2">Amount</th>
                  <th className="py-3 px-2">Submitted</th>
                  <th className="py-3 px-2">IP / Geotag</th>
                  <th className="py-3 px-2">Status</th>
                  <th className="py-3 px-2 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/30">
                {filteredRequests.map((req) => (
                  <tr key={req.id} className="hover:bg-muted/10 transition-colors">
                    <td className="py-3 px-2">
                      <p className="font-bold text-foreground truncate max-w-[140px]">
                        {req.userName || req.userEmail.split('@')[0]}
                      </p>
                      <p className="text-[10px] text-muted-foreground truncate max-w-[160px]">
                        {req.userEmail || req.userId}
                      </p>
                    </td>
                    <td className="py-3 px-2">
                      <PlanBadge plan={req.selectedPlan as any} size="sm" />
                    </td>
                    <td className="py-3 px-2 font-medium text-foreground">{req.paymentMethod}</td>
                    <td className="py-3 px-2 font-mono font-medium">{req.transactionId}</td>
                    <td className="py-3 px-2 font-bold text-foreground">{req.currency || 'PKR'} {req.amount}</td>
                    <td className="py-3 px-2 text-muted-foreground text-[10px]">
                      {new Date(req.submittedAt).toLocaleString()}
                    </td>
                    <td className="py-3 px-2 space-y-0.5">
                      <p className="font-mono text-[9px] text-muted-foreground">{req.submittedFromIP || '---'}</p>
                      {req.userCoords && (
                        <a
                          href={`https://www.google.com/maps?q=${req.userCoords.lat},${req.userCoords.lng}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-0.5 text-[9px] text-brand hover:underline font-bold"
                        >
                          <MapPin size={10} /> View Map
                        </a>
                      )}
                    </td>
                    <td className="py-3 px-2">
                      <Badge
                        variant={
                          req.status === 'approved' ? 'success' :
                          req.status === 'rejected' ? 'danger' : 'warning'
                        }
                        size="sm"
                      >
                        {req.status}
                      </Badge>
                    </td>
                    <td className="py-3 px-2 text-right space-x-2 shrink-0">
                      {req.screenshotUrl && (
                        <button
                          onClick={() => setSelectedRequest(req)}
                          className="p-1.5 hover:bg-muted rounded-lg text-primary transition-colors inline-flex"
                          title="View Receipt"
                        >
                          <Eye size={16} />
                        </button>
                      )}
                      {req.status === 'pending' && (
                        <>
                          <button
                            onClick={() => {
                              setSelectedRequest(req);
                              setShowApprovalModal(true);
                            }}
                            className="p-1.5 hover:bg-success/10 rounded-lg text-success transition-colors inline-flex"
                            title="Approve"
                          >
                            <CheckCircle2 size={16} />
                          </button>
                          <button
                            onClick={() => {
                              setSelectedRequest(req);
                              setShowRejectionModal(true);
                            }}
                            className="p-1.5 hover:bg-destructive/10 rounded-lg text-destructive transition-colors inline-flex"
                            title="Reject"
                          >
                            <XCircle size={16} />
                          </button>
                        </>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Lightbox Modal for Receipt Screenshot */}
      {selectedRequest && !showApprovalModal && !showRejectionModal && (
        <div className="fixed inset-0 z-50 bg-background/80 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-card border border-border rounded-3xl p-6 max-w-lg w-full space-y-4 shadow-2xl">
            <div className="flex justify-between items-center border-b border-border/40 pb-3">
              <h3 className="font-extrabold text-sm text-foreground">Payment Proof Receipt</h3>
              <button onClick={() => setSelectedRequest(null)} className="text-muted-foreground hover:text-foreground">✕</button>
            </div>
            
            {selectedRequest.screenshotUrl ? (
              <div className="max-h-[350px] overflow-auto rounded-2xl border border-border/40 bg-black/40 flex items-center justify-center p-2">
                <img src={selectedRequest.screenshotUrl} alt="Receipt proof" className="max-w-full h-auto rounded-xl object-contain" />
              </div>
            ) : (
              <p className="text-xs text-muted-foreground py-4 text-center">No screenshot uploaded.</p>
            )}

            <div className="text-xs space-y-1 bg-muted/20 p-3 rounded-2xl text-left border border-border/40">
              <p><strong>User:</strong> {selectedRequest.userName} ({selectedRequest.userEmail})</p>
              <p><strong>Tx ID:</strong> {selectedRequest.transactionId}</p>
              <p><strong>Amount:</strong> {selectedRequest.currency || 'PKR'} {selectedRequest.amount}</p>
              {selectedRequest.notes && <p><strong>User Notes:</strong> "{selectedRequest.notes}"</p>}
            </div>

            <div className="flex justify-end gap-2 pt-2">
              {selectedRequest.status === 'pending' && (
                <>
                  <Button variant="outline" size="sm" onClick={() => setShowRejectionModal(true)}>Reject</Button>
                  <Button variant="primary" size="sm" onClick={() => setShowApprovalModal(true)}>Approve Request</Button>
                </>
              )}
              <Button variant="ghost" size="sm" onClick={() => setSelectedRequest(null)}>Close</Button>
            </div>
          </div>
        </div>
      )}

      {/* Approval Confirmation Modal */}
      {showApprovalModal && selectedRequest && (
        <div className="fixed inset-0 z-50 bg-background/80 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-card border border-border rounded-3xl p-6 max-w-md w-full space-y-4 shadow-2xl text-left">
            <h3 className="font-extrabold text-sm text-foreground">Approve Subscription & Generate Invoice</h3>
            <p className="text-xs text-muted-foreground">
              This will activate the <strong>{selectedRequest.selectedPlan.toUpperCase()}</strong> plan for {selectedRequest.userEmail} and generate an official Paid Invoice.
            </p>

            <div className="space-y-3">
              <div>
                <label className="text-xs font-semibold text-foreground block mb-1">Set Expiry Date:</label>
                <input
                  type="date"
                  value={customExpiryDate}
                  onChange={(e) => setCustomExpiryDate(e.target.value)}
                  className="w-full bg-muted/20 border border-border/60 rounded-xl px-3 py-2 text-xs text-foreground focus:outline-none"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-foreground block mb-1">Internal Notes (Optional):</label>
                <textarea
                  value={internalNotes}
                  onChange={(e) => setInternalNotes(e.target.value)}
                  placeholder="Banking reference, promo notes, etc."
                  rows={2}
                  className="w-full bg-muted/20 border border-border/60 rounded-xl p-3 text-xs text-foreground focus:outline-none"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button variant="ghost" size="sm" onClick={() => setShowApprovalModal(false)}>Cancel</Button>
              <Button variant="primary" size="sm" onClick={handleConfirmApproval} loading={isLoading}>Confirm & Activate</Button>
            </div>
          </div>
        </div>
      )}

      {/* Rejection Modal */}
      {showRejectionModal && selectedRequest && (
        <div className="fixed inset-0 z-50 bg-background/80 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-card border border-border rounded-3xl p-6 max-w-md w-full space-y-4 shadow-2xl text-left">
            <h3 className="font-extrabold text-sm text-destructive">Reject Payment Request</h3>
            <p className="text-xs text-muted-foreground">
              Please specify the reason for rejection. This will be sent as a notification to the user.
            </p>

            <div>
              <textarea
                value={rejectionReason}
                onChange={(e) => setRejectionReason(e.target.value)}
                placeholder="e.g. Transaction ID not found on bank statement / Invalid screenshot."
                rows={3}
                className="w-full bg-muted/20 border border-border/60 rounded-xl p-3 text-xs text-foreground focus:outline-none"
              />
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button variant="ghost" size="sm" onClick={() => setShowRejectionModal(false)}>Cancel</Button>
              <Button variant="destructive" size="sm" onClick={handleConfirmRejection} loading={isLoading}>Reject Payment</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
