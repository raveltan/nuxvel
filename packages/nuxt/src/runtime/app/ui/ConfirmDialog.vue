<script setup lang="ts">
import { UButton, UModal } from "#components";
import type { ConfirmOptions } from "./use-confirm";

defineProps<ConfirmOptions>();
const emit = defineEmits<{ close: [confirmed: boolean] }>();
</script>

<template>
  <UModal :title="title" :description="description" :close="false" :ui="ui">
    <template #footer>
      <div class="flex w-full justify-end gap-2">
        <UButton
          color="neutral"
          variant="outline"
          :label="cancelLabel ?? $ts('nuxvel.confirmDialog.cancel')"
          @click="emit('close', false)"
        />
        <UButton
          :color="color ?? 'primary'"
          :label="confirmLabel ?? $ts('nuxvel.confirmDialog.confirm')"
          @click="emit('close', true)"
        />
      </div>
    </template>
  </UModal>
</template>
