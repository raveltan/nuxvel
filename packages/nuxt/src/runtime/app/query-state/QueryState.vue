<script setup lang="ts" generic="TData, TError">
import { computed, toValue } from "vue";
import type { DataState, UseQueryReturn } from "@pinia/colada";

/**
 * Renders one slot per state of a `useQuery()` result: `loading` until the
 * first response, `error` with the error and a `retry` function, `empty`
 * when the data is an empty array or `null`, and `default` with the data
 * otherwise. The query is what `useQuery()` returns or the same result
 * wrapped in `reactive()`.
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

const props = defineProps<{
  /** The value `useQuery()` returned, as is or wrapped in `reactive()`. */
  query:
    | Pick<UseQueryReturn<TData, TError>, "state" | "refetch">
    | { state: DataState<TData, TError>; refetch: UseQueryReturn<TData, TError>["refetch"] };
}>();

defineSlots<{
  loading(): unknown;
  error(props: { error: TError; retry: () => void }): unknown;
  empty(): unknown;
  default(props: { data: NonNullable<TData> }): unknown;
}>();

const state = computed(() => toValue(props.query.state));

function hasData(data: TData | undefined): data is NonNullable<TData> {
  if (data === null || data === undefined) return false;
  return !Array.isArray(data) || data.length > 0;
}

function errorMessage(error: TError) {
  return error instanceof Error ? error.message : undefined;
}

function retry() {
  props.query.refetch();
}
</script>

<template>
  <slot v-if="state.status === 'pending'" name="loading">
    <p role="status">{{ $t("nuxvel.queryState.loading") }}</p>
  </slot>
  <slot
    v-else-if="state.status === 'error'"
    name="error"
    :error="state.error"
    :retry="retry"
  >
    <div role="alert">
      <p>{{ $t("nuxvel.queryState.failed") }}</p>
      <p v-if="errorMessage(state.error)">{{ errorMessage(state.error) }}</p>
      <button type="button" @click="retry">{{ $t("nuxvel.queryState.retry") }}</button>
    </div>
  </slot>
  <slot v-else-if="hasData(state.data)" :data="state.data" />
  <slot v-else name="empty">
    <p>{{ $t("nuxvel.queryState.empty") }}</p>
  </slot>
</template>
