<template>
  <NuxtLink :to="$localeRoute({ name: 'index' })" class="flex items-center gap-2.5 text-lg font-bold tracking-tight" :aria-label="$ts('app.home')">
    <AppLogoMark />
    <span>nuxvel</span>
  </NuxtLink>
</template>
