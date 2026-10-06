<script setup lang="ts">
type IsAny<T> = 0 extends 1 & T ? true : false;

const posts = useLiveQuery($api.post.list.queryOptions(), {
  channel: "_probe-public",
  on: {
    renamed: (list, payload) => ({
      ...list,
      rows: list.rows.map((row) =>
        row.id === payload.id
          ? { ...row, title: `${row.title}!` }
          : row,
      ),
    }),
  },
});

type LiveData = NonNullable<typeof posts.data.value>;

type RenamedPayload = Parameters<
  NonNullable<NonNullable<LiveQueryUpdates<unknown, "_probe-public">["on"]>["renamed"]>
>[1];

const payloadIsTyped: IsAny<RenamedPayload> extends true
  ? never
  : RenamedPayload extends { id: number }
    ? true
    : never = true;

useLiveQuery($api.post.list.queryOptions(), {
  channel: "_probe-public",
  // @ts-expect-error probe-public declares no deleted event
  on: { deleted: (rows) => rows },
});

type RefetchPayload = Parameters<
  Exclude<NonNullable<NonNullable<LiveQueryUpdates<unknown, "_probe-public">["refetch"]>["renamed"]>, true>
>[0];

const refetchPayloadIsTyped: IsAny<RefetchPayload> extends true
  ? never
  : RefetchPayload extends { id: number }
    ? true
    : never = true;

useLiveQuery(() => ({ ...$api.post.list.queryOptions(), enabled: true }), {
  channel: "_probe-public",
  refetch: {
    renamed: (payload) => payload.id === 1,
    "from-job": true,
  },
});

useLiveQuery($api.post.list.queryOptions(), {
  channel: "_probe-public",
  // @ts-expect-error probe-public declares no deleted event
  refetch: { deleted: true },
});

const liveQueryIsTyped: IsAny<LiveData> extends true
  ? never
  : LiveData extends Paginated<{ title: string }>
    ? true
    : never = true;

useLiveQuery($api.post.list.queryOptions(), {
  channel: "_probe-board",
  params: { boardId: 1 },
  refetch: { moved: (payload) => payload.card === 1 },
});

useLiveQuery($api.post.list.queryOptions(), {
  channel: "_probe-board",
  // @ts-expect-error _probe-board names boardId, not board
  params: { board: 1 },
});

useLiveQuery($api.post.list.queryOptions(), {
  channel: "_probe-public",
  // @ts-expect-error _probe-public names no params
  params: { id: 1 },
});

const selectedId = ref(1);
const selected = useLiveQuery(() => $api.post.byId.queryOptions({ id: selectedId.value }), {
  channel: "_probe-public",
  on: { renamed: (post, payload) => (post.id === payload.id ? { ...post, title: "renamed" } : post) },
});

type SelectedData = NonNullable<typeof selected.data.value>;

const getterLiveQueryIsTyped: IsAny<SelectedData> extends true
  ? never
  : SelectedData extends { title: string }
    ? true
    : never = true;
</script>

<template>
  <div>{{ liveQueryIsTyped }} {{ payloadIsTyped }} {{ posts.data.value?.total }} {{ getterLiveQueryIsTyped }} {{ refetchPayloadIsTyped }}</div>
</template>
