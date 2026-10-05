<script setup lang="ts">
import { useRuntimeConfig } from "#imports";
import { USwitch } from "#components";
import { ref } from "vue";
import { usePush } from "../pwa/use-push";

/**
 * A Nuxt UI switch that subscribes this device to push notifications
 * for the signed-in user, or ends its subscription.
 *
 * Auto-registered as a component when `nuxvel.pwa` is set and
 * `nuxvel.ui` is not `false`. It renders nothing while
 * `NUXT_PUBLIC_PUSH_VAPID_PUBLIC_KEY` is not set. It is off and disabled while the browser
 * blocks notifications or has no push support. Without Nuxt UI, build
 * the same from `usePush()`.
 *
 * @example
 * ```vue
 * <PushToggle />
 * ```
 */
defineOptions({ name: "PushToggle" });

const configured = Boolean(useRuntimeConfig().public.pushVapidPublicKey);
const { isSubscribed, permission, subscribe, unsubscribe } = usePush();
const pending = ref(false);

async function toggle(on: boolean) {
  pending.value = true;

  try {
    await (on ? subscribe() : unsubscribe());
  } finally {
    pending.value = false;
  }
}
</script>

<template>
  <USwitch
    v-if="configured"
    :model-value="isSubscribed"
    :label="$ts('nuxvel.pushToggle.label')"
    :loading="pending"
    :disabled="pending || permission === 'denied' || permission === 'unsupported'"
    @update:model-value="toggle"
  />
</template>
