<script setup lang="ts">
import { useUser } from "@nuxvel/nuxt/app/auth";
import { useSeo } from "@nuxvel/nuxt/app/seo";

definePageMeta({ layout: "home" });
const { user } = useUser();
const { ts } = useI18n();
useSeo(() => ({ title: ts("home.title") }));

const docs = "https://github.com/raveltan/nuxvel/blob/main/docs";

const steps = [
  { key: "resource", command: "./nv make:resource post title body:text --ui" },
  { key: "migrate", command: "./nv db:migrate" },
  { key: "test", command: "npm test" },
];

const features = [
  { icon: "i-lucide-database", page: "database" },
  { icon: "i-lucide-code-xml", page: "api" },
  { icon: "i-lucide-lock", page: "authorization" },
  { icon: "i-lucide-mail", page: "queues" },
  { icon: "i-lucide-zap", page: "realtime" },
  { icon: "i-lucide-flask-conical", page: "testing" },
];
</script>

<template>
  <div>
    <section class="relative overflow-hidden py-12 sm:py-20">
      <div
        class="pointer-events-none absolute -top-64 -right-40 size-[640px] rounded-full bg-crimson-200 opacity-80 blur-3xl dark:bg-crimson-600/30"
        aria-hidden="true"
      />
      <UContainer class="relative grid items-center gap-12 lg:grid-cols-[1.1fr_.9fr]">
        <div>
          <UBadge color="primary" variant="subtle" icon="i-lucide-circle-dot" :label="$ts('home.running')" class="rounded-full" />
          <h1 class="mt-5 mb-4 text-4xl leading-none font-bold tracking-tighter sm:text-5xl">{{ $t("home.heading") }}</h1>
          <p class="mb-7 max-w-xl text-lg text-muted">{{ $t("home.intro") }}</p>
          <p v-if="user" class="mb-4 text-sm text-muted">{{ $t("home.signedInAs", { email: user.email }) }}</p>
          <div class="flex flex-wrap gap-2.5">
            <UButton size="lg" :to="`${docs}/index.md`" icon="i-lucide-book-open" :label="$ts('home.readDocs')" />
            <UButton
              size="lg"
              color="neutral"
              variant="outline"
              :to="`${docs}/tutorials/first-app.md`"
              trailing-icon="i-lucide-arrow-right"
              :label="$ts('home.firstApp')"
            />
          </div>
        </div>

        <UCard as="section" aria-labelledby="next-steps">
          <h2 id="next-steps" class="mb-3 text-xs font-semibold tracking-widest text-muted uppercase">{{ $t("home.nextSteps") }}</h2>
          <ol class="divide-y divide-dashed divide-default">
            <li v-for="(step, index) in steps" :key="step.command" class="grid grid-cols-[22px_1fr] gap-3 py-3 first:pt-0">
              <span class="grid size-[22px] place-items-center rounded-md bg-primary/10 text-xs font-bold text-primary">{{ index + 1 }}</span>
              <div class="min-w-0 space-y-1.5">
                <p class="text-sm">{{ $t(`home.steps.${step.key}`) }}</p>
                <CommandStep :command="step.command" />
              </div>
            </li>
            <li class="grid grid-cols-[22px_1fr] gap-3 pt-3">
              <span class="grid size-[22px] place-items-center rounded-md bg-primary/10 text-xs font-bold text-primary">4</span>
              <i18n-t keypath="home.steps.edit" tag="p" class="text-sm">
                <template #file>
                  <code class="font-mono text-xs">app/pages/index.vue</code>
                </template>
              </i18n-t>
            </li>
          </ol>
        </UCard>
      </UContainer>
    </section>

    <section class="pt-2 pb-14">
      <UContainer>
        <div class="mb-4 flex items-baseline justify-between">
          <h2 class="text-xl font-semibold tracking-tight">{{ $t("home.inTheBox") }}</h2>
          <ULink :to="`${docs}/index.md`" class="text-sm font-medium text-primary">{{ $t("home.allGuides") }}</ULink>
        </div>
        <div class="grid gap-3.5 sm:grid-cols-2 lg:grid-cols-3">
          <NuxtLink
            v-for="feature in features"
            :key="feature.page"
            :to="`${docs}/${feature.page}.md`"
            class="group rounded-xl border border-default p-4.5 transition-colors hover:border-primary focus-visible:outline-2 focus-visible:outline-primary"
          >
            <span class="mb-3 grid size-[34px] place-items-center rounded-lg bg-primary/10 text-primary">
              <UIcon :name="feature.icon" class="size-[18px]" />
            </span>
            <h3 class="mb-1 font-semibold">{{ $t(`home.features.${feature.page}.title`) }}</h3>
            <p class="text-sm text-muted">{{ $t(`home.features.${feature.page}.text`) }}</p>
            <span class="mt-2.5 inline-block text-[13px] font-medium text-primary">{{ $t("home.guide", { feature: $ts(`home.features.${feature.page}.title`) }) }}</span>
          </NuxtLink>
        </div>
      </UContainer>
    </section>
  </div>
</template>
