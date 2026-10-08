<script setup lang="ts">
import { MaintenanceBanner } from "@nuxvel/nuxt/app/maintenance";
import { NotificationBell } from "@nuxvel/nuxt/app/notifications";
import { PwaInstallPrompt } from "@nuxvel/nuxt/app/pwa";
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
        <nav :aria-label="$ts('app.mainNav')" class="flex items-center gap-2">
          <AppLogo />
        </nav>
        <div class="flex items-center gap-2">
          <LocaleSwitcher />
          <PwaInstallPrompt />
          <NotificationBell />
        </div>
      </UContainer>
    </header>
    <main id="main" class="flex-1">
      <UContainer class="py-8">
        <slot />
      </UContainer>
    </main>
  </div>
</template>
