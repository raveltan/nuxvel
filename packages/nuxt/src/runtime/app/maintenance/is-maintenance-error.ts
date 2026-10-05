import { z } from "zod";

const maintenanceError = z.object({ data: z.object({ code: z.literal("MAINTENANCE") }) });

/**
 * Tells whether an error is the 503 that the app answers while it is in
 * maintenance mode (`nuxvel down`).
 *
 * Auto-imported. Use it in the app's own `error.vue` to render
 * `<Maintenance>` for maintenance mode and your usual page for other
 * errors. Without an `error.vue`, nuxvel does this for you.
 *
 * @example
 * ```vue
 * <script setup lang="ts">
 * import type { NuxtError } from "#app";
 *
 * defineProps<{ error: NuxtError }>();
 * </script>
 *
 * <template>
 *   <Maintenance v-if="isMaintenanceError(error)" :error="error" />
 *   <UError v-else :error="error" />
 * </template>
 * ```
 */
export function isMaintenanceError(error: unknown): boolean {
  return maintenanceError.safeParse(error).success;
}
