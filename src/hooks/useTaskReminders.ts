import { useEffect } from 'react';
import { getTasks, updateTask } from '../db/queries';

export const useTaskReminders = () => {
  useEffect(() => {
    // Determine notification permission on mount
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission();
    }

    const checkReminders = async () => {
      try {
        const tasks = await getTasks();
        const pendingReminders = tasks.filter(
          t => t.status !== 'completed' && 
               t.reminder_enabled === 1 && 
               t.reminder_sent === 0 && 
               t.due_date && 
               t.due_time
        );

        const now = new Date();

        for (const task of pendingReminders) {
          const taskSqlDate = task.due_date!; 
          const taskSqlTime = task.due_time!; 
          // Format as local naive Date
          const taskDateTimeStr = `${taskSqlDate}T${taskSqlTime}`;
          const dueDateTime = new Date(taskDateTimeStr);
          
          if (isNaN(dueDateTime.getTime())) continue;

          // Offset in ms
          const offsetMs = task.reminder_offset * 60 * 1000;
          const reminderTime = new Date(dueDateTime.getTime() - offsetMs);

          // If current time has surpassed the exact reminder time
          if (now >= reminderTime) {
            // Priority 1: Native Web Notification
            if ('Notification' in window && Notification.permission === 'granted') {
              new Notification(`Task Reminder: ${task.title}`, {
                body: task.description || `Due at ${task.due_time}`,
              });
            } else {
              // Priority 2: Fallback Log 
              console.log(`[Email / Push Notification Mock]: Reminder for task: ${task.title}`);
            }

            // Sync the updated state to sqlite (and therefore firestore via SyncManager)
            await updateTask(task.id, { reminder_sent: 1 });
            window.dispatchEvent(new CustomEvent('app-sync-complete'));
          }
        }
      } catch (e) {
        console.error('[Reminders] Failed to check task reminders', e);
      }
    };

    // Run once on load, then every 30 seconds
    checkReminders();
    const interval = setInterval(checkReminders, 30000);

    return () => clearInterval(interval);
  }, []);
};
