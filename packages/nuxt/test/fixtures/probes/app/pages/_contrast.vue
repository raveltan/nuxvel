<script setup lang="ts">
const colors = ["primary", "secondary", "success", "info", "warning", "error", "neutral"] as const;
</script>

<template>
  <main class="space-y-4 p-4">
    <div v-for="color in colors" :key="color" class="flex flex-wrap items-center gap-2">
      <UBadge :color="color" variant="subtle" :label="`${color} subtle`" />
      <UBadge :color="color" variant="soft" :label="`${color} soft`" />
      <UBadge :color="color" variant="outline" :label="`${color} outline`" />
      <UBadge :color="color" :label="`${color} solid`" />
      <UButton :color="color" :label="`${color} button`" />
      <UAlert :color="color" variant="subtle" :title="`${color} alert`" description="An alert." />
    </div>
    <UAvatar alt="Ada Lovelace" />
    <UCard variant="subtle"><p class="text-muted">Muted text on a subtle card.</p></UCard>
    <UTimeline :items="[{ title: 'Opened', date: '2 hours ago' }]" />
  </main>
</template>
