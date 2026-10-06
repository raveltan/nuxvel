<script setup lang="ts">
const sent = ref("");
</script>

<template>
  <div>
    <ActionForm
      :action="$api._actionFormCheck.save"
      :defaults="{ teamId: 7 }"
      hidden="teamId"
      :fields="{ title: { placeholder: 'A short title', hint: 'Required' }, seats: { label: 'Number of seats' } }"
      submit-label="Send"
      :ui="{ root: 'probe-form-root' }"
      :options="{ onSuccess: (result) => (sent = result) }"
    />
    <output aria-label="Sent">{{ sent }}</output>
  </div>
</template>
