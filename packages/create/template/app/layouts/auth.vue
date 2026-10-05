<template>
  <div class="flex min-h-screen flex-col">
    <a
      href="#main"
      class="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:rounded-md focus:bg-default focus:px-3 focus:py-2"
    >
      {{ $t("app.skipToContent") }}
    </a>
    <main id="main" class="flex flex-1 flex-col items-center justify-center gap-6 px-4 py-8">
      <AppLogo />
      <UCard class="w-full max-w-sm">
        <slot />
      </UCard>
      <LocaleSwitcher />
    </main>
  </div>
</template>
