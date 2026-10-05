<script setup lang="ts" generic="TRow extends TableData, TError">
import type { TableColumn, TableData, TableProps, TableSlots } from "@nuxt/ui";
import type { UseQueryReturn } from "@pinia/colada";
import { computed, h, shallowRef, watch } from "vue";
import { useRoute, useRouter } from "#app";
import { QueryState, SearchInput, UPagination, UTable } from "#components";
import type { Paginated } from "../../shared/pagination/pagination";
import { listQuery, listQueryParams, type ListFilterKind, type ListQuery, type ListSort } from "../../shared/pagination/list-query";
import DataTableFilters from "./DataTableFilters.vue";
import DataTableSortButton from "./DataTableSortButton.vue";

/**
 * Shows a paginated tRPC query in a Nuxt UI `UTable`, with a
 * `UPagination` under it, an optional `<SearchInput>` above it, and
 * sorting and filters when it gets the columns of a `listQuery()`.
 *
 * Auto-registered as a component unless the app sets `nuxvel.ui:
 * false`. The page, the search text, the sort and the filters live in
 * the URL query (`?page=`, `?q=`, `?sort=` and one key per filter), so
 * a reload and the back and forward buttons keep them. Build the query
 * input from `useRoute().query` with the same `listQuery()` schema and
 * {@link listQueryParams}. With `list`, a click on the header of a
 * sortable column sorts by it ascending, then descending, then not at
 * all; a shift-click adds it as the next sort column. A filter bar
 * shows a control per filter (a debounced text input, a select, a
 * yes/no select, two date inputs), and each active filter shows as a
 * chip that removes it, next to "Clear all filters". A new sort or
 * filter removes `?page=`. `<QueryState>` renders the first load and
 * the error state. When the input changes, and on every refetch, the
 * table keeps the rows it shows, sets `aria-busy` and shows the
 * `UTable` loading bar until the new rows arrive. The `loading` and
 * `error` slots replace the first-load and error states of
 * `<QueryState>`; every other slot passes through to `UTable`, such as
 * `title-cell` or `empty`.
 *
 * @example
 * ```ts
 * const trpc = useTRPC();
 * const route = useRoute();
 * const input = computed(() => listQueryParams(postListInput.catch({ sort: [], filters: {} }).parse(route.query)));
 * const posts = useQuery(() => trpc.post.list.queryOptions(input.value));
 * ```
 * ```vue
 * <DataTable
 *   :query="posts"
 *   :columns="[{ accessorKey: 'title', header: 'Title' }]"
 *   :list="postListColumns"
 *   search="Search posts"
 * />
 * ```
 */
defineOptions({ name: "DataTable" });

const props = defineProps<{
  /** The value `useQuery()` returned for a query that resolves to {@link Paginated} rows. */
  query: Pick<UseQueryReturn<Paginated<TRow>, TError>, "state" | "asyncStatus" | "refetch">;
  /** The `UTable` columns. Without them, `UTable` makes one column per row key. */
  columns?: TableColumn<TRow>[];
  /** The label of the search input. The input shows only when it is set. */
  search?: string;
  /** The options of the list's `listQuery()`, usually its `<name>ListColumns`: the sortable columns and the filters. */
  list?: { sort?: readonly string[]; filters?: Record<string, ListFilterKind> };
  /** Classes for the slots of the inner `UTable` (`root`, `base`, `thead`, `td`, ...), as the `ui` prop of `UTable`. */
  ui?: TableProps<TRow>["ui"];
  /** The color of the `UTable` loading bar while new rows load, as the `loadingColor` prop of `UTable`. */
  loadingColor?: TableProps<TRow>["loadingColor"];
  /** The animation of the `UTable` loading bar while new rows load, as the `loadingAnimation` prop of `UTable`. */
  loadingAnimation?: TableProps<TRow>["loadingAnimation"];
}>();

const slots = defineSlots<
  Omit<TableSlots<TRow>, "loading"> & {
    /** Replaces the first load, before any rows arrive. */
    loading?(): unknown;
    /** Replaces the error state. `retry()` fetches the query again. */
    error?(props: { error: TError; retry: () => void }): unknown;
  }
>();

const tableSlotNames = computed(() => Object.keys(slots).filter((name) => name !== "loading" && name !== "error"));

const route = useRoute();
const router = useRouter();

const lastData = shallowRef<Paginated<TRow>>();
watch(
  () => props.query.state.value,
  (state) => {
    if (state.status === "success") lastData.value = state.data;
  },
  { immediate: true },
);

const shownState = computed(() => {
  const state = props.query.state.value;
  return state.status === "pending" && lastData.value
    ? { status: "success" as const, data: lastData.value, error: null }
    : state;
});

const shownQuery = { state: shownState, refetch: () => props.query.refetch() };
const loading = computed(() => props.query.asyncStatus.value === "loading");

function pageLink(page: number) {
  return { query: { ...route.query, page: page > 1 ? page : undefined } };
}

const listSchema = computed(() => (props.list ? listQuery(props.list) : undefined));
const current = computed<ListQuery>(() => listSchema.value?.safeParse(route.query).data ?? { sort: [], filters: {} });
const filters = computed(() => props.list?.filters ?? {});

function columnKey(column: TableColumn<TRow>) {
  return "accessorKey" in column && column.accessorKey !== undefined ? String(column.accessorKey) : column.id;
}

const labels = computed(() =>
  Object.fromEntries(
    (props.columns ?? []).flatMap((column) => {
      const key = columnKey(column);
      return key && typeof column.header === "string" ? [[key, column.header]] : [];
    }),
  ),
);

function show(next: Pick<ListQuery, "sort" | "filters">) {
  const listKeys = ["page", "sort", ...Object.keys(filters.value)];
  const rest = Object.fromEntries(Object.entries(route.query).filter(([key]) => !listKeys.includes(key)));

  return router.push({ query: { ...rest, ...listQueryParams({ sort: next.sort, filters: next.filters }) } });
}

function nextSort(column: string, add: boolean): ListSort[] {
  const terms = current.value.sort;
  const term = terms.find((existing) => existing.column === column);

  if (!term) return [...(add ? terms : []), { column, direction: "asc" as const }].slice(-3);
  if (!add) return term.direction === "asc" ? [{ column, direction: "desc" }] : [];
  if (term.direction === "asc") return terms.map((existing) => (existing === term ? { column, direction: "desc" } : existing));

  return terms.filter((existing) => existing !== term);
}

function sortHeader(column: string, label: string) {
  const terms = current.value.sort;
  const index = terms.findIndex((term) => term.column === column);

  return h(DataTableSortButton, {
    label,
    direction: terms[index]?.direction,
    position: terms.length > 1 && index >= 0 ? index + 1 : undefined,
    onSort: (event: MouseEvent) => show({ ...current.value, sort: nextSort(column, event.shiftKey) }),
  });
}

const shownColumns = computed(() =>
  props.columns?.map((column): TableColumn<TRow> => {
    const key = columnKey(column);
    const label = column.header;

    if (!key || typeof label !== "string" || !props.list?.sort?.includes(key)) return column;

    return Object.assign({}, column, { header: () => sortHeader(key, label) });
  }),
);

function setFilter(key: string, value: ListQuery["filters"][string]) {
  return show({ ...current.value, filters: { ...current.value.filters, [key]: value } });
}
</script>

<template>
  <div class="space-y-4" :aria-busy="loading">
    <SearchInput v-if="search" :placeholder="search" :aria-label="search" />
    <DataTableFilters
      v-if="Object.keys(filters).length > 0"
      :filters="filters"
      :value="current.filters"
      :labels="labels"
      @update="setFilter"
      @clear="show({ ...current, filters: {} })"
    />
    <QueryState :query="shownQuery">
      <template v-if="slots.loading" #loading>
        <slot name="loading" />
      </template>
      <template v-if="slots.error" #error="{ error, retry }">
        <slot name="error" :error="error" :retry="retry" />
      </template>
      <template #default="{ data }">
        <UTable
          :data="data.rows"
          :columns="shownColumns"
          :loading="loading"
          :loading-color="loadingColor"
          :loading-animation="loadingAnimation"
          :ui="ui"
        >
          <template v-for="name in tableSlotNames" #[name]="slotProps">
            <slot :name="name" v-bind="slotProps ?? {}" />
          </template>
        </UTable>
        <UPagination
          v-if="data.lastPage > 1"
          class="mt-4"
          :page="data.page"
          :total="data.total"
          :items-per-page="data.perPage"
          :to="pageLink"
        />
      </template>
    </QueryState>
  </div>
</template>
