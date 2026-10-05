<script setup lang="ts" generic="TData, TError">
import type { UseQueryReturn } from "@pinia/colada";
import { UAlert, UEmpty, USkeleton } from "#components";
import QueryState from "./QueryState.vue";

/**
 * Renders one slot per state of a `useQuery()` result: `loading` until the
 * first response, `error` with the error and a `retry` function, `empty`
 * when the data is an empty array or `null`, and `default` with the data
 * otherwise.
 *
 * Auto-registered as a component. A slot you leave out falls back to
 * Nuxt UI markup (`USkeleton`, a `UAlert` with a retry `UButton`,
 * `UEmpty`), or to plain markup when the app sets `nuxvel.ui: false`.
 *
 * @example
 * ```ts
 * const posts = useQuery(useTRPC().post.list.queryOptions());
 * ```
 * ```vue
 * <QueryState :query="posts">
 *   <template #empty>
 *     <UEmpty title="No posts yet" :actions="[{ label: 'Write one', to: '/posts/new' }]" />
 *   </template>
 *   <template #default="{ data }"><PostList :posts="data" /></template>
 * </QueryState>
 * ```
 */
defineOptions({ name: "QueryState" });

defineProps<{
  /** The value `useQuery()` returned. */
  query: Pick<UseQueryReturn<TData, TError>, "state" | "refetch">;
}>();

defineSlots<{
  loading(): unknown;
  error(props: { error: TError; retry: () => void }): unknown;
  empty(): unknown;
  default(props: { data: NonNullable<TData> }): unknown;
}>();
</script>

<template>
  <QueryState :query="query">
    <template #loading>
      <slot name="loading">
        <div role="status" class="space-y-2">
          <span class="sr-only">{{ $t("nuxvel.queryState.loading") }}</span>
          <USkeleton aria-hidden="true" class="h-4 w-3/4" />
          <USkeleton aria-hidden="true" class="h-4 w-full" />
          <USkeleton aria-hidden="true" class="h-4 w-5/6" />
        </div>
      </slot>
    </template>
    <template #error="{ error, retry }">
      <slot name="error" :error="error" :retry="retry">
        <UAlert
          role="alert"
          color="error"
          variant="subtle"
          icon="i-lucide-circle-alert"
          :title="$ts('nuxvel.queryState.failed')"
          :description="error instanceof Error ? error.message : undefined"
          :actions="[{ label: $ts('nuxvel.queryState.retry'), color: 'error', variant: 'outline', onClick: retry }]"
        />
      </slot>
    </template>
    <template #empty>
      <slot name="empty">
        <UEmpty icon="i-lucide-inbox" :title="$ts('nuxvel.queryState.empty')" />
      </slot>
    </template>
    <template #default="{ data }">
      <slot :data="data" />
    </template>
  </QueryState>
</template>
