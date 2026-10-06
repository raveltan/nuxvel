<script setup lang="ts">
import { onScopeDispose, ref, watch } from "vue";
import { useRoute, useRouter } from "#app";
import { UButton, UInput } from "#components";

/**
 * A Nuxt UI `UInput` for search text, with a search icon and a clear
 * button, that keeps its value in the URL query as `?q=`.
 *
 * Auto-registered as a component unless the app sets `nuxvel.ui:
 * false`. The value goes to the URL and to `v-model` 300 ms after the
 * user stops typing, or at once on Enter or on the clear button. A new
 * value removes `?page=`. The input starts from `?q=` and follows it
 * when the back and forward buttons change it. `<DataTable>` uses it for
 * its `search` input. Give it an `aria-label` or a `placeholder`.
 *
 * @example
 * ```ts
 * const q = ref("");
 * const posts = $api.post.list.useQuery(() => ({ q: q.value }));
 * ```
 * ```vue
 * <SearchInput v-model="q" aria-label="Search posts" placeholder="Search posts" />
 * ```
 */
defineOptions({ name: "SearchInput" });

const q = defineModel<string>({ default: "" });

const route = useRoute();
const router = useRouter();

function urlQuery() {
  return typeof route.query.q === "string" ? route.query.q : "";
}

const text = ref(urlQuery());
q.value = text.value;

let timer: ReturnType<typeof setTimeout> | undefined;

function commit() {
  clearTimeout(timer);
  const value = text.value.trim();
  q.value = value;
  if (value !== urlQuery()) router.push({ query: { ...route.query, q: value || undefined, page: undefined } });
}

function clear() {
  text.value = "";
  commit();
}

watch(text, () => {
  clearTimeout(timer);
  timer = setTimeout(commit, 300);
});

watch(urlQuery, (value) => {
  q.value = value;
  if (value !== text.value.trim()) text.value = value;
});

onScopeDispose(() => clearTimeout(timer));
</script>

<template>
  <UInput
    v-model="text"
    role="searchbox"
    enterkeyhint="search"
    icon="i-lucide-search"
    :ui="{ trailing: 'pe-1' }"
    @keydown.enter="commit"
  >
    <template v-if="text" #trailing>
      <UButton
        color="neutral"
        variant="link"
        size="sm"
        icon="i-lucide-x"
        :aria-label="$ts('nuxvel.searchInput.clear')"
        @click="clear"
      />
    </template>
  </UInput>
</template>
