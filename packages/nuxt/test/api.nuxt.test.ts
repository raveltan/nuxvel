import { defineComponent, h, isReactive, isRef, nextTick, reactive, ref, unref } from "vue";
import { getQuery } from "h3";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { mountSuspended, registerEndpoint } from "@nuxt/test-utils/runtime";
import { useQueryCache } from "@pinia/colada";
import { $api } from "#imports";

function respondWithPostTitles() {
  const ids: number[] = [];
  registerEndpoint("/api/trpc/post.byId", {
    method: "GET",
    handler: (event) => {
      const { id } = JSON.parse(String(getQuery(event).input))[0].json;
      ids.push(id);
      return [{ result: { data: { json: { id, title: `Post ${id}` } } } }];
    },
  });
  return ids;
}

function respondWithPing() {
  const calls: string[] = [];
  registerEndpoint("/api/trpc/health.ping", {
    method: "GET",
    handler: () => {
      calls.push("ping");
      return [{ result: { data: { json: "pong" } } }];
    },
  });
  return calls;
}

describe("$api", () => {
  it("builds the same keys as the tRPC client", () => {
    expect($api.post.key()).toEqual(["trpc", "post"]);
    expect($api.post.byId.key({ id: 1 })).toEqual(["trpc", "post", "byId", { id: 1 }]);
    expect($api.post.byId.queryOptions({ id: 1 }).key).toEqual(["trpc", "post", "byId", { id: 1 }]);
  });

  it("is neither a ref nor reactive, so templates and reactive() keep it as is", () => {
    expect(isRef($api)).toBe(false);
    expect(isRef($api.post)).toBe(false);
    expect(isReactive($api)).toBe(false);
    expect(isReactive(reactive({ api: $api }).api)).toBe(false);
    expect(unref($api)).toBe($api);
    expect(reactive({ api: $api }).api).toBe($api);
  });

  it("is not a thenable, so awaiting it yields itself", async () => {
    expect(Reflect.get($api, "then")).toBeUndefined();
    expect(Reflect.get($api.post, "toJSON")).toBeUndefined();
    expect(await Promise.resolve($api)).toBe($api);
  });

  it("calls the procedure through the app's tRPC client", async () => {
    registerEndpoint("/api/trpc/health.ping", {
      method: "GET",
      handler: () => [{ result: { data: { json: "pong" } } }],
    });
    registerEndpoint("/api/trpc/health.echo", {
      method: "POST",
      handler: () => ({ result: { data: { json: "hello" } } }),
    });

    expect(await $api.health.ping.query()).toBe("pong");
    expect(await $api.health.ping.queryOptions().query()).toBe("pong");
    expect(await $api.health.echo.mutationOptions().mutation("hello")).toBe("hello");
  });

  it("passes the abort signal of a query function to tRPC", async () => {
    respondWithPing();
    const controller = new AbortController();
    controller.abort();

    await expect($api.health.ping.queryOptions().query({ signal: controller.signal })).rejects.toThrow();
  });
});

describe("$api.<query>.useQuery()", () => {
  beforeEach(() => {
    const queryCache = useQueryCache();
    queryCache.getEntries().forEach((entry) => queryCache.remove(entry));
  });

  it("fetches the procedure and fetches again when the input getter changes", async () => {
    const ids = respondWithPostTitles();
    const id = ref(1);
    const wrapper = await mountSuspended(
      defineComponent({
        setup() {
          const post = $api.post.byId.useQuery(() => ({ id: id.value }));
          return () => h("p", post.data?.title ?? post.status);
        },
      }),
    );

    await vi.waitFor(() => expect(wrapper.text()).toBe("Post 1"));
    id.value = 2;

    await vi.waitFor(() => expect(wrapper.text()).toBe("Post 2"));
    expect(ids).toEqual([1, 2]);
  });

  it("calls a procedure without input", async () => {
    respondWithPing();
    const wrapper = await mountSuspended(
      defineComponent({
        setup() {
          const ping = $api.health.ping.useQuery();
          return () => h("p", ping.data ?? ping.status);
        },
      }),
    );

    await vi.waitFor(() => expect(wrapper.text()).toBe("pong"));
  });

  it("sends nothing while enabled is false", async () => {
    const calls = respondWithPing();
    const wrapper = await mountSuspended(
      defineComponent({
        setup() {
          const ping = $api.health.ping.useQuery(undefined, { enabled: false });
          return () => h("p", `${ping.status} ${ping.asyncStatus}`);
        },
      }),
    );
    await nextTick();

    expect(wrapper.text()).toBe("pending idle");
    expect(calls).toEqual([]);
  });

  it("passes its options to useQuery()", async () => {
    const calls = respondWithPing();
    const ping = defineComponent({
      setup() {
        const result = $api.health.ping.useQuery(undefined, { staleTime: 0 });
        return () => h("p", result.data ?? "");
      },
    });

    const first = await mountSuspended(ping);
    await vi.waitFor(() => expect(first.text()).toBe("pong"));
    await mountSuspended(ping);

    await vi.waitFor(() => expect(calls).toEqual(["ping", "ping"]));
  });

  it("refetches through the reactive result", async () => {
    const calls = respondWithPing();
    let refetch = () => {};
    const wrapper = await mountSuspended(
      defineComponent({
        setup() {
          const ping = $api.health.ping.useQuery();
          refetch = () => void ping.refetch();
          return () => h("p", ping.data ?? "");
        },
      }),
    );
    await vi.waitFor(() => expect(wrapper.text()).toBe("pong"));

    refetch();

    await vi.waitFor(() => expect(calls).toEqual(["ping", "ping"]));
  });
});
