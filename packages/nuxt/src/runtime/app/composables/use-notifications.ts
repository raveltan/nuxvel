import { computed, onMounted, onUnmounted, watch } from "vue";
import { useQuery } from "@pinia/colada";
import type { NotificationMessage } from "../../server/notifications/notification-message";
import { notificationChannelName } from "../../shared/realtime/notification-channel";
import { subscribeToChannel } from "../realtime/channel-connection";
import { useUser } from "./use-user";

/** One row of the signed-in user's notifications, as {@link useNotifications} lists it. */
export interface NotificationEntry {
  id: string;
  /** The name of the notification, such as `post.published`. */
  name: string;
  /** What the notification's `toDatabase` returned. */
  data: NotificationMessage;
  /** When the user read it, as an ISO string, or `null` while unread. */
  readAt: string | null;
  /** When `notify()` wrote it, as an ISO string. */
  createdAt: string;
}

interface NotificationList {
  unreadCount: number;
  notifications: NotificationEntry[];
}

/**
 * The signed-in user's newest notifications and unread count, kept live.
 *
 * Auto-imported. It reads `GET /api/notifications` in the browser, never
 * during SSR, and only while a user is signed in. While the component is
 * mounted it listens on the user's `notifications:<userId>` channel, so
 * a `notify()` or a mark-read in another tab refreshes it without a
 * reload. `notifications` holds the 20 newest, newest first.
 * `isPending` is `true` for a signed-in user until the first list arrives.
 * `markRead(id)` and `markAllRead()` post to `/api/notifications/read`,
 * then refresh. `<NotificationBell>` is built on it.
 *
 * @example
 * ```vue
 * <script setup lang="ts">
 * const { notifications, unreadCount, markRead } = useNotifications();
 * </script>
 *
 * <template>
 *   <p>{{ unreadCount }} unread</p>
 *   <button v-for="notification in notifications" :key="notification.id" @click="markRead(notification.id)">
 *     {{ notification.data.title }}
 *   </button>
 * </template>
 * ```
 */
export function useNotifications() {
  const { user } = useUser();
  const userId = computed(() => user.value?.id);
  const query = useQuery({
    key: () => ["nuxvel", "notifications", userId.value ?? ""],
    query: () => $fetch<NotificationList>("/api/notifications"),
    enabled: () => import.meta.client && userId.value !== undefined,
  });
  let unsubscribe: (() => void) | undefined;
  let stopWatching: (() => void) | undefined;

  function listen(id: string | undefined) {
    unsubscribe?.();
    unsubscribe = id
      ? subscribeToChannel(notificationChannelName(id), () => {
          void query.refetch();
        })
      : undefined;
  }

  onMounted(() => {
    stopWatching = watch(userId, listen, { immediate: true });
  });

  onUnmounted(() => {
    stopWatching?.();
    listen(undefined);
  });

  async function markRead(id?: string) {
    await $fetch("/api/notifications/read", { method: "POST", body: id === undefined ? {} : { id } });
    await query.refetch();
  }

  return {
    notifications: computed(() => query.data.value?.notifications ?? []),
    unreadCount: computed(() => query.data.value?.unreadCount ?? 0),
    isPending: computed(() => userId.value !== undefined && query.status.value === "pending"),
    markRead: (id: string) => markRead(id),
    markAllRead: () => markRead(),
  };
}
