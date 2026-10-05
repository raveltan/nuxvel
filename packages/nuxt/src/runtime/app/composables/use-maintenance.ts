import { readonly, type DeepReadonly, type Ref } from "vue";
import { useRequestEvent, useState } from "#app";
import { z } from "zod";
import { MAINTENANCE_CHANNEL } from "../../shared/maintenance/maintenance-channel";
import { useChannelSubscription } from "../realtime/channel-subscription";

/** What {@link useMaintenance} returns: whether the app is in maintenance mode, and why. */
export interface MaintenanceStatus {
  /** `true` from `nuxvel down` until `nuxvel up`. */
  down: boolean;
  /** The message of `nuxvel down`, or `null` while the app is up. */
  message: string | null;
  /** The seconds of `nuxvel down --retry`, or `null` while the app is up. */
  retryAfter: number | null;
}

const UP: MaintenanceStatus = { down: false, message: null, retryAfter: null };

const downMessage = z.object({
  event: z.literal("down"),
  payload: z.object({ message: z.string(), retryAfter: z.number() }),
});

function renderedStatus(): MaintenanceStatus {
  const maintenance = useRequestEvent()?.context.nuxvelMaintenance;

  return maintenance ? { down: true, message: maintenance.message, retryAfter: maintenance.retryAfter } : UP;
}

/**
 * The maintenance state of the app, kept live while the page is open.
 *
 * Auto-imported. Call it inside `setup()`. A page that the app serves
 * while it is down, through the bypass cookie or an allowed IP, renders
 * with `down: true`. After it mounts, it listens on the built-in
 * `maintenance` channel, so `nuxvel down` and `nuxvel up` change the value
 * in every open tab with no reload. `<MaintenanceBanner>` shows it in a
 * Nuxt UI banner; use this composable for a banner of your own.
 *
 * @example
 * ```vue
 * <script setup lang="ts">
 * const maintenance = useMaintenance();
 * </script>
 *
 * <template>
 *   <p v-if="maintenance.down" role="status">{{ maintenance.message }}</p>
 * </template>
 * ```
 */
export function useMaintenance(): DeepReadonly<Ref<MaintenanceStatus>> {
  const status = useState<MaintenanceStatus>("nuxvel:maintenance", renderedStatus);

  useChannelSubscription(MAINTENANCE_CHANNEL, (message) => {
    const down = downMessage.safeParse(message).data;

    status.value = down ? { down: true, ...down.payload } : UP;
  });

  return readonly(status);
}
