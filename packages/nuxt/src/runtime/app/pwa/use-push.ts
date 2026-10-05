import { onMounted, readonly, ref } from "vue";
import { useRuntimeConfig } from "#imports";

function supported() {
  return "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
}

async function notificationPermission(): Promise<NotificationPermission> {
  const { state } = await navigator.permissions.query({ name: "notifications" });

  return state === "prompt" ? "default" : state;
}

async function registration() {
  const registered = await navigator.serviceWorker.getRegistration();

  if (!registered) throw new Error("No service worker is registered. Push notifications need a production build");

  return navigator.serviceWorker.ready;
}

/**
 * Subscribes this device to push notifications for the signed-in user,
 * or ends its subscription, and tells whether it is subscribed.
 *
 * Auto-imported when `nuxvel.pwa` is set. Call `subscribe()` from a
 * click: it subscribes the browser with the public VAPID key from
 * `NUXT_PUBLIC_PUSH_VAPID_PUBLIC_KEY`, which asks the user for
 * permission, and stores the subscription with `POST /api/push/subscribe`.
 * It resolves to `false` when the user does not grant permission, and
 * throws when the key is not set or no service worker is registered, as
 * in `nuxt dev`. `unsubscribe()` deletes
 * the subscription on the server, then in the browser. `permission` is
 * the browser's notification permission, or `"unsupported"`;
 * `isSubscribed` reads the browser's subscription once the component
 * mounts. When the browser has a subscription at that time, the
 * composable stores it again, so the device stays subscribed for the
 * current session. A subscription ends with the session that stored it.
 * `<PushToggle>` is the Nuxt UI switch built on it.
 *
 * @example
 * ```vue
 * <script setup lang="ts">
 * const { isSubscribed, permission, subscribe, unsubscribe } = usePush();
 * </script>
 *
 * <template>
 *   <button v-if="!isSubscribed" :disabled="permission === 'denied'" @click="subscribe()">Notify me</button>
 *   <button v-else @click="unsubscribe()">Stop notifications</button>
 * </template>
 * ```
 */
export function usePush() {
  const publicKey = useRuntimeConfig().public.pushVapidPublicKey;
  const permission = ref<NotificationPermission | "unsupported">("default");
  const isSubscribed = ref(false);

  onMounted(async () => {
    if (!supported()) {
      permission.value = "unsupported";
      return;
    }

    permission.value = await notificationPermission();
    const registered = await navigator.serviceWorker.getRegistration();
    const existing = await registered?.pushManager.getSubscription();

    isSubscribed.value = Boolean(existing);

    if (existing) await $fetch("/api/push/subscribe", { method: "POST", body: existing.toJSON() }).catch(() => undefined);
  });

  async function subscribe() {
    if (!publicKey) throw new Error("NUXT_PUBLIC_PUSH_VAPID_PUBLIC_KEY is not set");

    const { pushManager } = await registration();
    const subscription = await pushManager
      .subscribe({ userVisibleOnly: true, applicationServerKey: publicKey })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "NotAllowedError") return null;
        throw error;
      });

    permission.value = await notificationPermission();

    if (!subscription) return false;

    await $fetch("/api/push/subscribe", { method: "POST", body: subscription.toJSON() });
    isSubscribed.value = true;

    return true;
  }

  async function unsubscribe() {
    const subscription = await (await registration()).pushManager.getSubscription();

    if (subscription) {
      await $fetch("/api/push/subscribe", { method: "DELETE", body: { endpoint: subscription.endpoint } });
      await subscription.unsubscribe();
    }

    isSubscribed.value = false;
  }

  return { permission: readonly(permission), isSubscribed: readonly(isSubscribed), subscribe, unsubscribe };
}
