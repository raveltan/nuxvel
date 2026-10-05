const NOTIFICATION_CHANNEL_PREFIX = "notifications:";

/** The channel that announces each change to one user's notifications. */
export function notificationChannelName(userId: string) {
  return `${NOTIFICATION_CHANNEL_PREFIX}${userId}`;
}

/** The user behind a notification channel's name, or `undefined` for any other channel. */
export function userFromNotificationChannel(channel: string) {
  if (!channel.startsWith(NOTIFICATION_CHANNEL_PREFIX)) return undefined;

  return channel.slice(NOTIFICATION_CHANNEL_PREFIX.length);
}
