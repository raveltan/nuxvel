import { defineComponent, h, ref } from "vue";
import { describe, expect, it, vi } from "vitest";
import { mountSuspended } from "@nuxt/test-utils/runtime";
import { DataTable } from "#components";
import { useRouter } from "#imports";

const firstPage = { rows: [{ title: "First" }], page: 1, perPage: 1, total: 2, lastPage: 2 };

function fakeQuery() {
  return {
    state: ref<{ status: string; data?: unknown; error?: unknown }>({ status: "pending" }),
    asyncStatus: ref("loading"),
    refetch: vi.fn(),
  };
}

function mountDataTable(query: ReturnType<typeof fakeQuery>, props: object = {}, slots: object = {}) {
  return mountSuspended(
    defineComponent({ setup: () => () => h(DataTable, { query, ...props }, slots) }),
  );
}

function busy(wrapper: Awaited<ReturnType<typeof mountDataTable>>) {
  return wrapper.get("div").attributes("aria-busy");
}

async function loaded(query: ReturnType<typeof fakeQuery>) {
  const wrapper = await mountDataTable(query);
  query.state.value = { status: "success", data: firstPage, error: null };
  query.asyncStatus.value = "idle";
  await vi.waitFor(() => expect(wrapper.find("td").text()).toBe("First"));
  return wrapper;
}

describe("<DataTable>", () => {
  it("gives its ui prop to the UTable", async () => {
    const query = fakeQuery();
    query.state.value = { status: "success", data: firstPage, error: null };
    query.asyncStatus.value = "idle";
    const wrapper = await mountDataTable(query, { ui: { base: "table-ui-probe" } });

    await vi.waitFor(() => expect(wrapper.get("table").classes()).toContain("table-ui-probe"));
  });

  it("shows skeletons and is busy on the first load", async () => {
    const wrapper = await mountDataTable(fakeQuery());

    expect(wrapper.find("table").exists()).toBe(false);
    expect(busy(wrapper)).toBe("true");
  });

  it("renders its loading slot on the first load", async () => {
    const wrapper = await mountDataTable(fakeQuery(), {}, { loading: () => h("p", "Loading posts") });

    expect(wrapper.text()).toBe("Loading posts");
    expect(wrapper.find('[role="status"]').exists()).toBe(false);
  });

  it("renders its error slot with the error and a retry", async () => {
    const query = fakeQuery();
    query.state.value = { status: "error", error: new Error("Server down") };
    query.asyncStatus.value = "idle";
    const wrapper = await mountDataTable(query, {}, {
      error: ({ error, retry }: { error: Error; retry: () => void }) =>
        h("button", { type: "button", onClick: retry }, `Posts failed: ${error.message}`),
    });

    await wrapper.get("button").trigger("click");

    expect(wrapper.text()).toBe("Posts failed: Server down");
    expect(query.refetch).toHaveBeenCalledOnce();
  });

  it("gives its loading color and animation to the UTable bar of a refetch", async () => {
    const query = fakeQuery();
    query.state.value = { status: "success", data: firstPage, error: null };
    const wrapper = await mountDataTable(query, { loadingColor: "neutral", loadingAnimation: "swing" });

    await vi.waitFor(() => expect(wrapper.get("thead").classes()).toContain("after:bg-inverted"));
    expect(wrapper.get("thead").classes()).toContain("motion-safe:after:animate-[swing_2s_var(--ease-in-out)_infinite]");
  });

  it("keeps the rows and is busy while a new page loads", async () => {
    const query = fakeQuery();
    const wrapper = await loaded(query);

    query.state.value = { status: "pending" };
    query.asyncStatus.value = "loading";

    await vi.waitFor(() => expect(busy(wrapper)).toBe("true"));
    expect(wrapper.find("td").text()).toBe("First");
    expect(wrapper.find('[data-slot="list"]').exists()).toBe(true);
  });

  it("is busy while the same query refetches", async () => {
    const query = fakeQuery();
    const wrapper = await loaded(query);
    expect(busy(wrapper)).toBe("false");

    query.asyncStatus.value = "loading";

    await vi.waitFor(() => expect(busy(wrapper)).toBe("true"));
    expect(wrapper.find("td").text()).toBe("First");
  });

  describe("with list columns", () => {
    const list = {
      sort: ["title", "createdAt"],
      filters: { title: "text", done: "boolean", status: ["open", "closed"], createdAt: "dateRange" },
    } as const;
    const columns = [
      { accessorKey: "title", header: "Title" },
      { accessorKey: "createdAt", header: "Created" },
      { accessorKey: "status", header: "Status" },
    ];

    async function mountList(path: string) {
      const query = fakeQuery();
      query.state.value = { status: "success", data: firstPage, error: null };
      query.asyncStatus.value = "idle";
      const wrapper = await mountSuspended(
        defineComponent({ setup: () => () => h(DataTable, { query, columns, list }) }),
        { route: path },
      );
      const router = useRouter();
      return { wrapper, query: () => router.currentRoute.value.query };
    }

    function header(wrapper: Awaited<ReturnType<typeof mountList>>["wrapper"], name: string) {
      return wrapper.get(`th button[aria-label^="${name}"], th button[aria-label="Sort by ${name}"]`);
    }

    it("sorts by a header ascending, then descending, then not at all, and drops the page", async () => {
      const { wrapper, query } = await mountList("/?page=3&q=report");

      await header(wrapper, "Title").trigger("click");
      await vi.waitFor(() => expect(query()).toEqual({ q: "report", sort: "title:asc" }));
      expect(header(wrapper, "Title").attributes("aria-label")).toBe("Title, sorted ascending");

      await header(wrapper, "Title").trigger("click");
      await vi.waitFor(() => expect(query().sort).toBe("title:desc"));

      await header(wrapper, "Title").trigger("click");
      await vi.waitFor(() => expect(query()).toEqual({ q: "report" }));
      expect(wrapper.find('th button[aria-label^="Status"]').exists()).toBe(false);
    });

    it("adds a second sort column on shift-click, and a plain click keeps only the clicked column", async () => {
      const { wrapper, query } = await mountList("/?sort=title:asc");

      await header(wrapper, "Created").trigger("click", { shiftKey: true });
      await vi.waitFor(() => expect(query().sort).toBe("title:asc,createdAt:asc"));
      await vi.waitFor(() => expect(header(wrapper, "Created").text()).toBe("Created (2)"));

      await header(wrapper, "Created").trigger("click");
      await vi.waitFor(() => expect(query().sort).toBe("createdAt:desc"));
    });

    it("writes each filter to the URL, shows it as a chip, and removes it from the chip or with Clear all", async () => {
      const { wrapper, query } = await mountList("/?page=2&status=open&done=true&createdAt=2026-01-01..");

      expect(wrapper.findAll('button[aria-label^="Remove filter"]').map((chip) => chip.text())).toEqual([
        "done: Yes",
        "Status: open",
        "Created: 2026-01-01 to …",
      ]);

      await wrapper.get('input[type="date"]:not([value="2026-01-01"])').setValue("2026-01-31");
      await vi.waitFor(() => expect(query().createdAt).toBe("2026-01-01..2026-01-31"));
      expect(query().page).toBeUndefined();

      await wrapper.get('button[aria-label="Remove filter Status: open"]').trigger("click");
      await vi.waitFor(() => expect(query().status).toBeUndefined());

      await wrapper.findAll("button").find((button) => button.text() === "Clear all filters")?.trigger("click");
      await vi.waitFor(() => expect(query()).toEqual({}));
    });

    it("debounces the text filter", async () => {
      const { wrapper, query } = await mountList("/");

      await wrapper.get('input[type="text"]').setValue("launch");
      expect(query().title).toBeUndefined();
      await vi.waitFor(() => expect(query().title).toBe("launch"));
      await vi.waitFor(() => expect(wrapper.text()).toContain('Title: "launch"'));
    });
  });
});
