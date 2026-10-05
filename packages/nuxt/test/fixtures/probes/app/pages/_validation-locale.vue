<script setup lang="ts">
import { z } from "zod";

const message = ref("");

onMounted(() => {
  message.value = z.object({ title: z.string().min(3) }).safeParse({ title: "a" }).error?.issues[0]?.message ?? "";
});
</script>

<template>
  <main>
    <p v-if="message">message:{{ message }}</p>
  </main>
</template>
