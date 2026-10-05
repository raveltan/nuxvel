<script setup lang="ts">
const props = defineProps<{ command: string }>();
const toast = useToast();
const { ts } = useI18n();

async function copy() {
  await navigator.clipboard.writeText(props.command);
  toast.add({ title: ts("app.copied"), icon: "i-lucide-check", color: "success" });
}
</script>

<template>
  <div class="flex items-center justify-between gap-2 rounded-lg bg-stone-900 py-1.5 pr-1.5 pl-3 font-mono text-xs text-stone-100 dark:bg-black">
    <code class="min-w-0 break-words"><span class="mr-2 text-crimson-400">$</span>{{ command }}</code>
    <UButton
      icon="i-lucide-copy"
      color="neutral"
      variant="ghost"
      size="xs"
      class="text-stone-300 hover:text-white"
      :aria-label="$ts('app.copy', { command })"
      @click="copy"
    />
  </div>
</template>
