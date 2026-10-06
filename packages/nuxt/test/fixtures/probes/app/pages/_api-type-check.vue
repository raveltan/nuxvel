<script setup lang="ts">
type IsAny<T> = 0 extends 1 & T ? true : false;

function titleOf<T extends { title: string }>(post: IsAny<T> extends true ? never : T) {
  return post.title;
}

const apiIsTyped: IsAny<typeof $api> extends true ? never : true = true;
const byIdOptions = $api.post.byId.queryOptions({ id: 1 });
type PostById = Awaited<ReturnType<typeof byIdOptions.query>>;
const queryOptionsAreTyped: IsAny<PostById> extends true
  ? never
  : PostById extends { title: string }
    ? true
    : never = true;
const mutationInputIsTyped: Parameters<
  ReturnType<typeof $api.health.echo.mutationOptions>["mutation"]
>[0] extends string
  ? true
  : never = true;
const { data: postFromOptions } = useQuery(() => $api.post.byId.queryOptions({ id: 1 }));

const post = $api.post.byId.useQuery(() => ({ id: 1 }));
const ping = $api.health.ping.useQuery(undefined, { staleTime: 60_000 });
const postList = $api.post.list.useQuery();
const useQueryDataIsTyped: IsAny<typeof post.data> extends true
  ? never
  : typeof post.data extends { title: string } | undefined
    ? true
    : never = true;
const useQueryErrorIsTyped: IsAny<typeof post.error> extends true
  ? never
  : NonNullable<typeof post.error> extends { data: unknown }
    ? true
    : never = true;
const pingIsString: typeof ping.data extends string | undefined ? true : never = true;

function useQueryWithoutInput() {
  // @ts-expect-error post.byId needs an input
  return $api.post.byId.useQuery();
}

function useQueryWithWrongOption() {
  // @ts-expect-error staleTime is a number
  return $api.health.ping.useQuery(undefined, { staleTime: "soon" });
}

function pingWithoutInput() {
  // @ts-expect-error post.byId needs an input
  return $api.post.byId.queryOptions();
}
</script>

<template>
  <div>
    {{ apiIsTyped }} {{ queryOptionsAreTyped }} {{ mutationInputIsTyped }} {{ pingWithoutInput }}
    {{ useQueryDataIsTyped }} {{ useQueryErrorIsTyped }} {{ pingIsString }} {{ useQueryWithoutInput }} {{ useQueryWithWrongOption }}
    {{ $api.post.byId.key({ id: 1 }) }}
    <p>
      <!-- @vue-expect-error id is a number -->
      {{ $api.post.byId.key({ id: "one" }) }}
    </p>
    <p v-if="postFromOptions">{{ titleOf(postFromOptions) }}</p>
    <p v-if="post.data">{{ titleOf(post.data) }}</p>
    <p v-if="post.state.status === 'success'">{{ titleOf(post.state.data) }}</p>
    <p v-if="post.error">{{ post.error.message }}</p>
    <QueryState :query="postList">
      <template #default="{ data }">{{ data.rows.map((row) => titleOf(row)).join(", ") }}</template>
    </QueryState>
  </div>
</template>
