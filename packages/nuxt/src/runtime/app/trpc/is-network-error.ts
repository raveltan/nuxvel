import { z } from "zod";
import { NETWORK_ERROR } from "../../shared/trpc/network-error";

const networkError = z.object({ data: z.object({ code: z.literal(NETWORK_ERROR) }) });

/**
 * Tells whether a tRPC call failed because it got no answer from the
 * API: the network is down, or a proxy answered with an HTML page or an
 * empty body. The error message is then "Can't reach the server. Check
 * your connection and try again.", and `data.code` is `NETWORK_ERROR`.
 *
 * Auto-imported. Use it in an `error` slot to show your own text or a
 * retry button for this case. An error that the server sends keeps its
 * own code, so this returns `false` for it.
 *
 * @example
 * ```vue
 * <QueryState :query="post">
 *   <template #error="{ error, retry }">
 *     <UEmpty v-if="isNetworkError(error)" title="You are offline" :actions="[{ label: 'Try again', onClick: retry }]" />
 *     <UEmpty v-else title="Could not load the post" :description="error.message" />
 *   </template>
 * </QueryState>
 * ```
 */
export function isNetworkError(error: unknown): boolean {
  return networkError.safeParse(error).success;
}
