import { h, ref } from "vue";
import DataTable from "./DataTable.vue";

export default { title: "DataTable", component: DataTable };

const columns = [
  { accessorKey: "title", header: "Title" },
  { accessorKey: "status", header: "Status" },
];

const rows = [
  { title: "Hello world", status: "published" },
  { title: "Draft notes", status: "draft" },
];

function story(state: object, props: object = {}) {
  return {
    render: () => ({
      setup: () => {
        const query = { state: ref(state), asyncStatus: ref("idle"), refetch: async () => state };
        return () => h(DataTable, { query, columns, ...props });
      },
    }),
  };
}

export const Default = story(
  { status: "success", data: { rows, page: 1, perPage: 10, total: 2, lastPage: 1 }, error: null },
  { search: "Search posts", list: { sort: ["title"], filters: { status: ["published", "draft"] } } },
);

export const Loading = story({ status: "pending", data: undefined, error: null });
