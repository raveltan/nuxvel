<script setup lang="ts">
const { ts } = useI18n()

useHead({ title: () => ts('offline.title') })
</script>

<template>
  <div class="flex flex-col items-start gap-4">
    <h1 class="text-2xl font-semibold">{{ $t('offline.heading') }}</h1>
    <p>{{ $t('offline.text') }}</p>
    <a href="/" class="underline">{{ $t('offline.home') }}</a>
  </div>
</template>
