import type { inferRouterInputs, inferRouterOutputs } from "@trpc/server";
import { useNuxtApp } from "#app";
import type { AppRouter } from "../../server/trpc/router";
import type { AppTRPC } from "../trpc/app-trpc";

/**
 * Every procedure's input type, by path: `RouterInputs["post"]["update"]`
 * is what `useTRPC().post.update` takes.
 *
 * Auto-imported as a type in components, pages and composables. Pair it
 * with {@link RouterOutputs} to type props with what a procedure sends
 * instead of hand-writing the shape.
 */
export type RouterInputs = inferRouterInputs<AppRouter>;

/**
 * Every procedure's output type, by path: `RouterOutputs["post"]["byId"]`
 * is what `useTRPC().post.byId` resolves to.
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

/**
 * The fully typed tRPC client for the app router.
 *
 * Auto-imported in components, pages and composables. Every query also
 * exposes `queryOptions(input)` and `key(input?)`, every mutation
 * `mutationOptions()`, and every namespace `key()`, for Pinia Colada's
 * `useQuery()` / `useMutation()` / `useQueryCache()`. Keys start with
 * `"trpc"`. A router or procedure named `key`, `queryOptions`,
 * `mutationOptions` or `then` fails to typecheck, since the helpers
 * would shadow it.
 *
 * @example
 * ```ts
 * const trpc = useTRPC();
 * const { data: post } = useQuery(() => trpc.post.byId.queryOptions({ id }));
 * const { mutate } = useMutation(trpc.post.create.mutationOptions());
 * await useQueryCache().invalidateQueries({ key: trpc.post.key() });
 * ```
 */
export function useTRPC(): AppTRPC {
  return useNuxtApp().$trpc;
}
