<script setup lang="ts">
defineProps<{ title: string; description?: string; siteName?: string }>();
</script>

<template>
  <div class="flex h-full w-full flex-col justify-between bg-[#b20d27] p-[60px] text-white">
    <span class="text-[32px] font-semibold">{{ siteName }}</span>
    <div class="flex flex-col gap-4">
      <h1 class="m-0 text-[72px] font-bold leading-tight">{{ title }}</h1>
      <p v-if="description" class="m-0 text-[32px]">{{ description }}</p>
    </div>
  </div>
</template>
