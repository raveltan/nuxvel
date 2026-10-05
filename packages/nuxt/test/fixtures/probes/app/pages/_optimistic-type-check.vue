<script setup lang="ts">
type IsAny<T> = 0 extends 1 & T ? true : false;

const trpc = useTRPC();

const { error } = useMutation(
  optimistic(trpc.post.update.mutationOptions(), {
    key: (input) => trpc.post.byId.key({ id: input.id }),
    apply: (post, input) => ({ ...post, title: input.title }),
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
</script>

<template>
  <p v-if="error">{{ errorIsTyped }}{{ error.message }}</p>
</template>
