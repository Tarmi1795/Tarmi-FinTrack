// Local (device) notifications for due receivables/payables. Fire at most once per day.
// No service worker required — uses the plain Notification constructor.

const LAST_DUE_NOTIFY_KEY = 'fintrack_last_due_notify';

export interface DueNotificationItem {
  party: string;
  amount: number;
  currency: string;
  daysOverdue: number;
  type: 'receivable' | 'payable';
}

// Local-time YYYY-MM-DD key (avoids toISOString UTC off-by-one at month boundaries)
const getTodayKey = (): string => {
  const d = new Date();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${month}-${day}`;
};

export const notifications = {
  isSupported(): boolean {
    return typeof window !== 'undefined' && 'Notification' in window;
  },

  permission(): NotificationPermission | 'unsupported' {
    if (!this.isSupported()) return 'unsupported';
    return Notification.permission;
  },

  async requestPermission(): Promise<NotificationPermission> {
    if (!this.isSupported()) return 'denied';
    try {
      return await Notification.requestPermission();
    } catch {
      return 'denied';
    }
  },

  /**
   * Builds and shows ONE summary notification for the given due items.
   * Returns false if notifications are unsupported/denied, if there is nothing
   * to send, or if a notification was already fired today (once-per-day guard).
   */
  async notifyDueItems(items: DueNotificationItem[]): Promise<boolean> {
    if (!this.isSupported() || items.length === 0) return false;
    if (Notification.permission !== 'granted') return false;

    try {
      const todayKey = getTodayKey();

      // Guard: fire at most once per day
      if (localStorage.getItem(LAST_DUE_NOTIFY_KEY) === todayKey) return false;

      const title = `Tarmi: ${items.length} item(s) need attention`;
      const body = items
        .slice(0, 3)
        .map(i =>
          `${i.type === 'receivable' ? 'RECEIVABLE' : 'PAYABLE'} ${i.party} — ${i.currency} ${i.amount.toLocaleString()} (${Math.max(0, i.daysOverdue)}d overdue)`
        )
        .join('\n');

      new Notification(title, { body, tag: 'tarmi-due' });

      localStorage.setItem(LAST_DUE_NOTIFY_KEY, todayKey);
      return true;
    } catch {
      return false;
    }
  },
};
