import { type Component, defineComponent, h, ref } from "vue";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { mountSuspended, registerEndpoint } from "@nuxt/test-utils/runtime";
import { useQuery, useQueryCache } from "@pinia/colada";
import { QueryState } from "#components";
import PlainQueryState from "../src/runtime/app/query-state/QueryState.vue";
import { useTRPC } from "#imports";

const customSlots = {
  loading: () => "loading",
  error: () => "error",
  empty: () => "empty",
  default: ({ data }: { data: { title: string }[] }) =>
    `titles: ${data.map((post) => post.title).join(", ")}`,
};

function mountPostList() {
  return mountSuspended(
    defineComponent({
      setup() {
        const posts = useQuery(useTRPC().post.list.queryOptions());

        return () => h(QueryState, { query: posts }, customSlots);
      },
    }),
  );
}

function respondWithPosts(json: unknown) {
  registerEndpoint("/api/trpc/post.list", {
    method: "GET",
    handler: () => [{ result: { data: { json } } }],
  });
}

function respondPending() {
  registerEndpoint("/api/trpc/post.list", {
    method: "GET",
    handler: () => new Promise(() => {}),
  });
}

function respondWithError() {
  registerEndpoint("/api/trpc/post.list", {
    method: "GET",
    handler: () => [
      {
        error: {
          json: {
            message: "boom",
            code: -32603,
            data: { code: "INTERNAL_SERVER_ERROR", httpStatus: 500 },
          },
        },
      },
    ],
  });
}

function fakeQuery(state: { status: string; data?: unknown; error?: unknown }) {
  return { state: ref(state), refetch: vi.fn() };
}

const pendingQuery = () => fakeQuery({ status: "pending" });
const failedQuery = () => fakeQuery({ status: "error", error: new Error("boom") });
const emptyQuery = () => fakeQuery({ status: "success", data: [] });

function mountQueryState(component: Component, query: ReturnType<typeof fakeQuery>) {
  return mountSuspended(
    defineComponent({ setup: () => () => h(component, { query }) }),
  );
}

describe("<QueryState>", () => {
  beforeEach(() => {
    const queryCache = useQueryCache();
    queryCache.getEntries().forEach((entry) => queryCache.remove(entry));
  });

  describe("with its slots given", () => {
    it("renders the loading slot while the query is pending", async () => {
      respondPending();

      const wrapper = await mountPostList();

      expect(wrapper.text()).toBe("loading");
    });

    it("renders the error slot when the query fails", async () => {
      respondWithError();

      const wrapper = await mountPostList();

      await vi.waitFor(() => expect(wrapper.text()).toBe("error"));
    });

    it("renders the empty slot for an empty array", async () => {
      respondWithPosts([]);

      const wrapper = await mountPostList();

      await vi.waitFor(() => expect(wrapper.text()).toBe("empty"));
    });

    it("renders the default slot with the data", async () => {
      respondWithPosts([{ title: "First" }, { title: "Second" }]);

      const wrapper = await mountPostList();

      await vi.waitFor(() =>
        expect(wrapper.text()).toBe("titles: First, Second"),
      );
    });
  });

  describe("with no slots given, on Nuxt UI", () => {
    it("renders skeletons while the query is pending", async () => {
      const wrapper = await mountQueryState(QueryState, pendingQuery());

      expect(wrapper.findAll('[aria-busy="true"]').length).toBeGreaterThan(0);
    });

    it("renders an alert with a retry button that refetches when the query fails", async () => {
      const query = failedQuery();
      const wrapper = await mountQueryState(QueryState, query);

      expect(wrapper.find('[role="alert"] [data-slot="title"]').text()).toBe(
        "Something went wrong.",
      );
      expect(wrapper.find('[data-slot="description"]').text()).toBe("boom");

      await wrapper.find("button").trigger("click");

      expect(query.refetch).toHaveBeenCalledOnce();
    });

    it("renders an empty state for an empty array", async () => {
      const wrapper = await mountQueryState(QueryState, emptyQuery());

      expect(wrapper.find('h2[data-slot="title"]').text()).toBe("Nothing here yet.");
    });
  });

  describe("with no slots given, without Nuxt UI", () => {
    it("renders plain loading markup", async () => {
      const wrapper = await mountQueryState(PlainQueryState, pendingQuery());

      expect(wrapper.html()).toBe('<p role="status">Loading…</p>');
    });

    it("renders a plain alert with a retry button that refetches", async () => {
      const query = failedQuery();
      const wrapper = await mountQueryState(PlainQueryState, query);

      expect(wrapper.find('[role="alert"]').text()).toBe("Something went wrong.boomTry again");

      await wrapper.find("button").trigger("click");

      expect(query.refetch).toHaveBeenCalledOnce();
    });

    it("renders a plain empty message", async () => {
      const wrapper = await mountQueryState(PlainQueryState, emptyQuery());

      expect(wrapper.text()).toBe("Nothing here yet.");
    });
  });
});
