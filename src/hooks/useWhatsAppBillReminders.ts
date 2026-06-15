import { useEffect } from 'react';
import { getReminders, updateReminder, getConfig } from '../db/queries';
import { getWhatsAppStatus, sendWhatsAppMessage } from '../services/whatsappService';
import { useCurrency } from '../contexts/CurrencyContext';
import { toast } from 'sonner';
import { parseISO, format } from 'date-fns';

export const useWhatsAppBillReminders = () => {
  const { formatAmount } = useCurrency();

  useEffect(() => {
    const checkScheduledReminders = async () => {
      try {
        const reminders = await getReminders();
        const pendingReminders = reminders.filter(
          r => r.status === 'pending' &&
               (!r.whatsapp_sent || r.whatsapp_sent === 0) &&
               r.whatsapp_phone &&
               r.whatsapp_date &&
               r.whatsapp_time
        );

        if (pendingReminders.length === 0) return;

        const now = new Date();

        // 1. Get WhatsApp status to see if any accounts are connected
        const statusRes = await getWhatsAppStatus();
        const connectedAccounts = (statusRes.accounts || []).filter(a => a.status === 'connected');

        for (const rem of pendingReminders) {
          const scheduleDateTimeStr = `${rem.whatsapp_date}T${rem.whatsapp_time}`;
          const scheduleDateTime = new Date(scheduleDateTimeStr);

          if (isNaN(scheduleDateTime.getTime())) continue;

          // If current time is past or equal to the scheduled time
          if (now >= scheduleDateTime) {
            if (connectedAccounts.length === 0) {
              console.warn(`[WhatsApp Reminders] Scheduled reminder due for "${rem.title}", but no WhatsApp device is connected.`);
              continue;
            }

            // Pick first connected account or default if available
            const defaultAccountId = await getConfig('whatsapp_default_account') || connectedAccounts[0].id;
            const activeAccountId = connectedAccounts.find(a => a.id === defaultAccountId)?.id || connectedAccounts[0].id;

            const cleanPhone = rem.whatsapp_phone!.replace(/\D/g, '');
            const formattedAmt = formatAmount(rem.amount);
            const dueDateStr = format(parseISO(rem.due_date), 'MMM dd, yyyy');

            const message = `Hi ${rem.whatsapp_name || 'there'},\n\nThis is a friendly reminder to pay the *${rem.title}* bill of *${formattedAmt}*.\n\nDue Date: ${dueDateStr}\n\nThank you!\n\n_Sent automatically via Ledger PWA_`;

            console.log(`[WhatsApp Reminders] Auto-sending scheduled reminder for "${rem.title}" to ${rem.whatsapp_name} (${cleanPhone})`);

            const res = await sendWhatsAppMessage(activeAccountId, cleanPhone, message);
            if (res.success) {
              await updateReminder(rem.id, { whatsapp_sent: 1 });
              toast.success(`Sent WhatsApp reminder to ${rem.whatsapp_name} for "${rem.title}" bill.`);
              window.dispatchEvent(new CustomEvent('app-sync-complete'));
            } else {
              console.error(`[WhatsApp Reminders] Failed to auto-send scheduled reminder:`, res.error);
            }
          }
        }
      } catch (e) {
        console.error('[WhatsApp Reminders] Error checking scheduled reminders:', e);
      }
    };

    // Run check once on load, then every 30 seconds
    checkScheduledReminders();
    const interval = setInterval(checkScheduledReminders, 30000);

    return () => clearInterval(interval);
  }, [formatAmount]);
};
