import type { inferRouterInputs, inferRouterOutputs } from "@trpc/server";
import type { AppRouter } from "../../server/trpc/router";

/**
 * Every procedure's input type, by path: `RouterInputs["post"]["update"]`
 * is what `$api.post.update` takes.
 *
 * Auto-imported as a type in components, pages and composables. Pair it
 * with {@link RouterOutputs} to type props with what a procedure sends
 * instead of hand-writing the shape.
 */
export type RouterInputs = inferRouterInputs<AppRouter>;

/**
 * Every procedure's output type, by path: `RouterOutputs["post"]["byId"]`
 * is what `$api.post.byId` resolves to.
 *
 * Auto-imported as a type in components, pages and composables.
 *
 * @example
 * ```vue
 * <script setup lang="ts">
 * defineProps<{ post: RouterOutputs["post"]["byId"] }>();
 * </script>
 * ```
 */
export type RouterOutputs = inferRouterOutputs<AppRouter>;
