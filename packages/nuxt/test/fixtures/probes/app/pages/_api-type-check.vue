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
const { data: post } = useQuery(() => $api.post.byId.queryOptions({ id: 1 }));

function pingWithoutInput() {
  // @ts-expect-error post.byId needs an input
  return $api.post.byId.queryOptions();
}
</script>

<template>
  <div>
    {{ apiIsTyped }} {{ queryOptionsAreTyped }} {{ mutationInputIsTyped }} {{ pingWithoutInput }}
    {{ $api.post.byId.key({ id: 1 }) }}
    <p>
      <!-- @vue-expect-error id is a number -->
      {{ $api.post.byId.key({ id: "one" }) }}
    </p>
    <p v-if="post">{{ titleOf(post) }}</p>
  </div>
</template>
