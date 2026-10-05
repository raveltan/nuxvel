<script setup lang="ts">
import { useI18n } from "#imports";
import { UButton, UChip, UIcon, UPopover, USkeleton } from "#components";
import { computed } from "vue";
import DateTime from "../components/DateTime.vue";
import { useNotifications } from "../composables/use-notifications";
import { useUser } from "../composables/use-user";

/**
 * A bell button with an unread badge, opening the signed-in user's
 * newest notifications. Renders nothing while signed out.
 *
 * Auto-registered as a component unless the app sets `nuxvel.ui:
 * false`. It is built on {@link useNotifications}, so it updates without
 * a reload. Opening a notification marks it read and follows its `url`.
 * Until the first list arrives, the list shows skeletons, or the
 * `loading` slot when you give it. For other markup, build your own
 * with `useNotifications()`.
 *
 * @example
 * ```vue
 * <NotificationBell />
 * ```
 */
defineOptions({ name: "NotificationBell" });

const { user } = useUser();
const { notifications, unreadCount, isPending, markRead, markAllRead } = useNotifications();
const { ts } = useI18n();
const label = computed(() =>
  unreadCount.value === 0 ? ts("nuxvel.notificationBell.title") : ts("nuxvel.notificationBell.unread", { count: unreadCount.value }),
);

defineSlots<{
  /** Replaces the skeletons of the list until the first list arrives. */
  loading?(): unknown;
}>();
</script>

<template>
  <UPopover v-if="user" :content="{ align: 'end' }">
    <UButton color="neutral" variant="ghost" square :aria-label="label">
      <UChip color="error" :show="unreadCount > 0" :text="unreadCount" size="3xl" inset>
        <UIcon name="i-lucide-bell" class="size-5 shrink-0" />
      </UChip>
    </UButton>
    <template #content>
      <section :aria-label="$ts('nuxvel.notificationBell.title')" class="w-80 p-2">
        <div class="flex items-center justify-between gap-2 px-2 py-1">
          <h2 class="text-sm font-semibold">{{ $t("nuxvel.notificationBell.title") }}</h2>
          <UButton
            v-if="unreadCount > 0"
            size="xs"
            color="neutral"
            variant="link"
            :label="$ts('nuxvel.notificationBell.markAllRead')"
            @click="markAllRead()"
          />
        </div>
        <slot v-if="isPending" name="loading">
          <div role="status" class="space-y-2 px-2 py-4">
            <span class="sr-only">{{ $t("nuxvel.notificationBell.loading") }}</span>
            <USkeleton aria-hidden="true" class="h-4 w-3/4" />
            <USkeleton aria-hidden="true" class="h-4 w-full" />
            <USkeleton aria-hidden="true" class="h-4 w-5/6" />
          </div>
        </slot>
        <p v-else-if="notifications.length === 0" data-empty class="px-2 py-4 text-sm text-muted">{{ $t("nuxvel.notificationBell.empty") }}</p>
        <ul v-else class="max-h-96 overflow-y-auto">
          <li v-for="notification in notifications" :key="notification.id">
            <UButton
              block
              color="neutral"
              variant="ghost"
              class="items-start justify-start text-left"
              :to="notification.data.url"
              @click="markRead(notification.id)"
            >
              <UIcon :name="notification.data.icon ?? 'i-lucide-bell'" class="mt-0.5 size-5 shrink-0" />
              <span class="flex-1">
                <span class="block" :class="notification.readAt ? 'font-normal' : 'font-semibold'">
                  {{ notification.data.title }}
                  <span v-if="!notification.readAt" class="sr-only">{{ $t("nuxvel.notificationBell.unreadMark") }}</span>
                </span>
                <span class="block text-sm text-muted">{{ notification.data.body }}</span>
                <DateTime :value="notification.createdAt" relative class="block text-xs text-muted" />
              </span>
            </UButton>
          </li>
        </ul>
      </section>
    </template>
  </UPopover>
</template>
