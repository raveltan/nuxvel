<template>
  <div class="flex min-h-screen flex-col">
    <MaintenanceBanner />
    <a
      href="#main"
      class="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:rounded-md focus:bg-default focus:px-3 focus:py-2"
    >
      Skip to content
    </a>
    <header class="border-b border-default">
      <UContainer class="flex h-16 items-center justify-between gap-4">
        <nav aria-label="Main" class="flex items-center gap-2">
          <UButton :to="{ name: 'index' }" variant="ghost" color="neutral" label="Home" />
          <UButton :to="{ name: 'posts' }" variant="ghost" color="neutral" label="Posts" />
          <UButton :to="{ name: 'account' }" variant="ghost" color="neutral" label="Account" />
          <UButton :to="{ name: 'jobs' }" variant="ghost" color="neutral" label="Jobs" />
          <UButton :to="{ name: 'profile' }" variant="ghost" color="neutral" label="Profile" />
          <UButton :to="{ name: 'flags' }" variant="ghost" color="neutral" label="Flags" />
          <UButton :to="{ name: 'security' }" variant="ghost" color="neutral" label="Security" />
        </nav>
        <UserMenu />
      </UContainer>
    </header>
    <main id="main" class="flex-1">
      <UContainer class="py-8">
        <slot />
      </UContainer>
    </main>
  </div>
</template>
