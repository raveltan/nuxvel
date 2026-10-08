<script setup lang="ts">
import { $api } from "@nuxvel/nuxt/app/api";
import { removeRow, replaceRow } from "@nuxvel/nuxt/app/ui";

type IsAny<T> = 0 extends 1 & T ? true : false;

function typed<T>(value: IsAny<T> extends true ? never : T) {
  return value;
}

const { error } = useMutation(
  $api.post.update.mutationOptions({
    optimistic: {
      key: (input) => $api.post.byId.key({ id: input.id }),
      apply: (post, input) => ({ ...post, title: input.title }),
    },
  }),
);

type Failure = NonNullable<typeof error.value>;
const errorIsTyped: [Failure] extends [never]
  ? never
  : IsAny<Failure> extends true
    ? never
    : Failure extends { message: string }
      ? true
      : never = true;

const renamePost = $api.post.update.useMutation({
  optimistic: {
    key: (input) => $api.post.byId.key({ id: typed(input).id }),
    apply: (post, input) => ({ ...typed(post), title: typed(input).title }),
  },
});

$api.post.delete.useMutation({
  optimistic: { key: () => $api.post.list.key(), apply: removeRow() },
});

$api.post.update.mutationOptions({
  optimistic: { key: () => $api.post.list.key(), apply: replaceRow() },
});

$api.post.update.useMutation({
  optimistic: {
    // @ts-expect-error the key holds a post, and apply returns a number
    key: (input) => $api.post.byId.key({ id: input.id }),
    apply: () => 1,
  },
});
</script>

<template>
  <p v-if="error">{{ errorIsTyped }}{{ error.message }}{{ renamePost.status }}</p>
</template>
