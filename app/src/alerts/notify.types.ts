/** Platform notification layer for price alerts: native in notify.native.ts, none on the web (notify.ts). */
export type NotificationPermission = 'granted' | 'denied' | 'undetermined' | 'unsupported';

export interface AlertNotification {
  /** Alert id: a newer notification for the same alert replaces the older one. */
  id: string;
  title: string;
  body: string;
  productId: string;
}

export interface Notifier {
  /** False where we never show system notifications (the web). */
  supported: boolean;
  getPermission(): Promise<NotificationPermission>;
  /** Shows the system prompt. `channelName` names the Android notification channel. */
  requestPermission(channelName: string): Promise<NotificationPermission>;
  /** Shows local notifications now; does nothing without permission. */
  show(items: AlertNotification[], channelName: string): Promise<void>;
  /** Opens the app's page in the phone settings, to turn notifications back on. */
  openSettings(): void;
  /** React hook: calls `open` with the product id when the user taps an alert notification. */
  useTaps(open: (productId: string) => void): void;
}
