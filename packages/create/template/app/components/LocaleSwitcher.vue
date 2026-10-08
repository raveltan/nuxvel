<script setup lang="ts">
import { authClient, useUser } from "@nuxvel/nuxt/app/auth";

const { getLocales, getLocale, switchLocale } = useI18n();
const { user } = useUser();

const locales = computed(() => getLocales().map((locale) => ({ label: locale.displayName ?? locale.code, value: locale.code })));

const locale = computed({
  get: () => getLocale(),
  async set(code: string) {
    if (user.value) await authClient.updateUser({ locale: code });
    await switchLocale(code);
  },
});
</script>

<template>
  <USelect v-if="locales.length > 1" v-model="locale" :items="locales" icon="i-lucide-languages" variant="ghost" :aria-label="$ts('app.language')" />
</template>
