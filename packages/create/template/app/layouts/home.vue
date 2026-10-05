<script setup lang="ts">
const { user, signOut } = useUser();
const { ts, localeRoute } = useI18n();
const DevEnvStrip = import.meta.dev ? defineAsyncComponent(() => import("~/components/DevEnvStrip.vue")) : null;

async function signOutAndLeave() {
  await signOut();
  await navigateTo(localeRoute({ name: "index" }));
}

const userMenu = computed(() => [
  [{ label: user.value?.email ?? "", type: "label" as const }],
  [{ label: ts("app.signOut"), icon: "i-lucide-log-out", onSelect: signOutAndLeave }],
]);
</script>

<template>
  <div class="flex min-h-screen flex-col">
    <MaintenanceBanner />
    <a
      href="#main"
      class="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:rounded-md focus:bg-default focus:px-3 focus:py-2"
    >
      {{ $t("app.skipToContent") }}
    </a>
    <header class="border-b border-default">
      <UContainer class="flex h-16 items-center justify-between gap-4">
        <AppLogo />
        <nav :aria-label="$ts('app.mainNav')" class="flex items-center gap-1.5">
          <UButton
            to="https://github.com/raveltan/nuxvel/blob/main/docs/index.md"
            color="neutral"
            variant="ghost"
            :label="$ts('app.docs')"
            class="hidden sm:inline-flex"
          />
          <LocaleSwitcher />
          <PwaInstallPrompt />
          <template v-if="user">
            <PushToggle />
            <NotificationBell />
            <UDropdownMenu :items="userMenu" :modal="false">
              <UButton
                variant="ghost"
                color="neutral"
                icon="i-lucide-circle-user"
                trailing-icon="i-lucide-chevron-down"
                :label="user.email"
                class="max-w-40 sm:max-w-none"
              />
            </UDropdownMenu>
          </template>
          <template v-else>
            <UButton :to="$localeRoute({ name: 'sign-in' })" color="neutral" variant="outline" :label="$ts('app.signIn')" />
            <UButton :to="$localeRoute({ name: 'sign-up' })" :label="$ts('app.signUp')" />
          </template>
        </nav>
      </UContainer>
    </header>
    <main id="main" class="flex-1">
      <slot />
    </main>
    <component :is="DevEnvStrip" v-if="DevEnvStrip" />
  </div>
</template>
