<script setup lang="ts">
const confirm = useConfirm();
const typing = [
  { userId: "ada", name: "Ada", state: { typing: true }, connections: 1 },
  { userId: "linus", name: "Linus", state: { typing: true }, connections: 1 },
];
</script>

<template>
  <div>
    <TypingIndicator :members="typing" />
    <UButton label="Archive" @click="confirm({ title: 'Archive?' })" />
  </div>
</template>
