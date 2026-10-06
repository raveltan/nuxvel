<script setup lang="ts">
import type { AppConfigInput } from "nuxt/schema";

const styled: AppConfigInput = { ui: { actionForm: { slots: { root: "space-y-6", field: "", actions: "justify-end" } } } };
// @ts-expect-error actionForm has no slot "nope"
const wrongSlot: AppConfigInput = { ui: { actionForm: { slots: { nope: "x" } } } };
</script>

<template>
  <div>{{ styled }} {{ wrongSlot }}</div>
</template>
