/** What a notification's `toDatabase` returns, stored as the row's `data` and shown in the bell. */
export interface NotificationMessage {
  title: string;
  body: string;
  /** Where the notification leads when the user opens it. */
  url?: string;
  /** A Nuxt UI icon name, e.g. `i-lucide-newspaper`. */
  icon?: string;
}
