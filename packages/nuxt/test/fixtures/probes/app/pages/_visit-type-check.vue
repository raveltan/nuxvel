<script setup lang="ts">
type Visit = typeof import("@nuxvel/nuxt/testing").visit;
type IsAny<T> = 0 extends 1 & T ? true : false;

const targetIsTyped: IsAny<Parameters<Visit>[0]> extends true ? never : true = true;

const byName: Parameters<Visit>[0] = { name: "posts-id", params: { id: 1 } };
const withClock: Parameters<Visit>[1] = { clock: true };
// @ts-expect-error clock is a boolean
const clockNumber: Parameters<Visit>[1] = { clock: 300 };
const allowStrings: Parameters<Visit>[1] = { allowFailedRequests: ["**/api/trpc/**", /trpc/] };
// @ts-expect-error a pattern is a string or a RegExp
const allowNumber: Parameters<Visit>[1] = { allowFailedRequests: [1] };
// @ts-expect-error no page has this route name
const unknownName: Parameters<Visit>[0] = { name: "no-such-page" };
</script>

<template>
  <p>{{ targetIsTyped }} {{ Boolean(byName && unknownName && withClock && clockNumber && allowStrings && allowNumber) }}</p>
</template>
