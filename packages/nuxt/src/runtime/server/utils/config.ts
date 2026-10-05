import { useRuntimeConfig } from "nitropack/runtime";
import type { NuxvelRuntimeConfig } from "./nuxvel-runtime-config";

/**
 * The runtime part of the `nuxvel` block of `nuxt.config.ts`
 * (`mail`, `audit`, `experiments`, `database`, `queue`, `realtime`, `api`, `security`, `health`), as merged into runtime config and
 * typed as {@link NuxvelRuntimeConfig}, also exported from `@nuxvel/nuxt`.
 *
 * Auto-imported on the server.
 *
 * @example
 * ```ts
 * const from = useNuxvelConfig().mail?.from;
 * ```
 */
export function useNuxvelConfig(): NuxvelRuntimeConfig {
  return useRuntimeConfig().nuxvel;
}
