<script setup lang="ts">
import { z } from "zod";
import { useRouteInput } from "@nuxvel/nuxt/app/ui";

type IsAny<T> = 0 extends 1 & T ? true : false;

const { query, params } = useRouteInput({
  query: z.object({ page: z.coerce.number().default(1), search: z.string().optional() }),
  params: z.object({ id: z.coerce.number().default(0) }),
});

const queryIsTyped: IsAny<typeof query.value> extends true
  ? never
  : typeof query.value extends { page: number; search?: string | undefined }
    ? true
    : never = true;
const paramsAreTyped: IsAny<typeof params.value.id> extends true ? never : typeof params.value.id extends number ? true : never = true;

// @ts-expect-error a key without a default cannot fall back
useRouteInput({ query: z.object({ search: z.string() }) });
</script>

<template>
  <p>{{ queryIsTyped }} {{ paramsAreTyped }}</p>
</template>
