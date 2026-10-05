<template>
  <div class="flex min-h-screen flex-col">
    <a
      href="#main"
      class="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:rounded-md focus:bg-default focus:px-3 focus:py-2"
    >
      Skip to content
    </a>
    <header class="flex h-16 items-center justify-center">
      <nav aria-label="Main">
        <UButton :to="{ name: 'index' }" variant="link" color="neutral" label="Home" />
      </nav>
    </header>
    <main id="main" class="flex flex-1 items-start justify-center px-4 py-8 sm:items-center">
      <UCard class="w-full max-w-sm">
        <slot />
      </UCard>
    </main>
  </div>
</template>
