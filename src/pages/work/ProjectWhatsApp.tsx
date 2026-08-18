import React, { useState, useEffect } from 'react';
import { useWork } from '../../contexts/WorkContext';
import { MessageSquare, Send, Smartphone, Loader2, CheckCheck } from 'lucide-react';
import { getWhatsAppStatus, sendWhatsAppMessage } from '../../services/whatsappService';
import { toast } from 'sonner';

export const ProjectWhatsApp: React.FC = () => {
  const { selectedProject } = useWork();

  const [status, setStatus] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [recipient, setRecipient] = useState('');
  const [message, setMessage] = useState('');
  const [isSending, setIsSending] = useState(false);

  useEffect(() => {
    if (selectedProject) {
      getWhatsAppStatus()
        .then(res => setStatus(res))
        .catch(() => setStatus({ success: false, connected: false }))
        .finally(() => setLoading(false));
    }
  }, [selectedProject]);

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!recipient.trim() || !message.trim()) return;
    setIsSending(true);

    try {
      await sendWhatsAppMessage('account1', recipient.trim(), message.trim());
      toast.success('WhatsApp message dispatched!');
      setMessage('');
    } catch (e) {
      toast.error('Failed to send WhatsApp message');
    } finally {
      setIsSending(false);
    }
  };

  if (!selectedProject) return null;

  return (
    <div className="space-y-6 animate-in fade-in duration-200">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-extrabold text-foreground flex items-center gap-2">
            <MessageSquare className="text-primary" size={20} /> Project WhatsApp Channel
          </h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            Send client updates and team alerts directly via WhatsApp.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Status Card */}
        <div className="bg-card border border-border p-6 rounded-3xl space-y-4">
          <h3 className="font-bold text-sm flex items-center gap-2">
            <Smartphone size={16} className="text-primary" /> Connection Status
          </h3>

          {loading ? (
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Loader2 size={14} className="animate-spin" /> Checking WhatsApp server...
            </div>
          ) : status?.connected ? (
            <div className="p-3 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-500 text-xs font-bold flex items-center gap-2">
              <CheckCheck size={16} /> WhatsApp Online & Ready
            </div>
          ) : (
            <div className="p-3 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-amber-500 text-xs font-bold">
              WhatsApp Server Offline / Scan QR required in WhatsApp module.
            </div>
          )}
        </div>

        {/* Dispatch Form */}
        <div className="md:col-span-2 bg-card border border-border p-6 rounded-3xl space-y-4">
          <h3 className="font-bold text-sm">Send Project Update</h3>

          <form onSubmit={handleSend} className="space-y-3">
            <div>
              <label className="block text-xs font-bold mb-1">Phone Number (with country code)</label>
              <input
                type="text"
                required
                placeholder="e.g., +923001234567"
                value={recipient}
                onChange={e => setRecipient(e.target.value)}
                className="w-full bg-muted border border-border rounded-xl px-3 py-2 text-xs outline-none focus:ring-2 focus:ring-primary"
              />
            </div>

            <div>
              <label className="block text-xs font-bold mb-1">Message</label>
              <textarea
                required
                placeholder={`Hello! Update regarding ${selectedProject.name}...`}
                value={message}
                onChange={e => setMessage(e.target.value)}
                className="w-full bg-muted border border-border rounded-xl px-3 py-2 text-xs outline-none focus:ring-2 focus:ring-primary resize-none h-24"
              />
            </div>

            <div className="flex justify-end">
              <button
                type="submit"
                disabled={isSending}
                className="bg-primary text-primary-foreground px-5 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 disabled:opacity-50"
              >
                {isSending ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />} Send Message
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};
