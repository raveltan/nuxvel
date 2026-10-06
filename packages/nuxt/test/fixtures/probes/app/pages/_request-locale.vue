<script setup lang="ts">
const mounted = ref(false);
const { data: rendered } = useQuery($api._localeCheck.current.queryOptions());
const { data: browser } = useQuery({ ...$api._localeCheck.current.queryOptions(), key: ["_request-locale-browser"], enabled: () => mounted.value });

onMounted(() => {
  mounted.value = true;
});
</script>

<template>
  <main>
    <p>rendered:{{ rendered?.context }}</p>
    <p>browser:{{ browser?.context }}</p>
  </main>
</template>
