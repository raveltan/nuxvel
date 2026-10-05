<template>
  <div class="flex min-h-screen flex-col">
    <a
      href="#main"
      class="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:rounded-md focus:bg-default focus:px-3 focus:py-2"
    >
      Skip to content
    </a>
    <header class="border-b border-default">
      <UContainer class="flex h-16 items-center">
        <nav aria-label="Main" class="flex items-center gap-2">
          <UButton :to="{ name: 'index' }" variant="ghost" color="neutral" label="Home" />
        </nav>
      </UContainer>
    </header>
    <main id="main" class="flex-1">
      <UContainer class="py-8">
        <slot />
      </UContainer>
    </main>
  </div>
</template>
