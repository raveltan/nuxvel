import { defineComponent, h } from "vue";
import { setResponseHeader, setResponseStatus } from "h3";
import { afterEach, beforeEach, describe, expect, it, onTestFinished, vi } from "vitest";
import { mountSuspended, registerEndpoint } from "@nuxt/test-utils/runtime";
import { useQueryCache } from "@pinia/colada";
import { $api } from "#imports";

function respondWithEcho(invalidates?: unknown[][]) {
  registerEndpoint("/api/trpc/health.echo", {
    method: "POST",
    handler: (event) => {
      if (invalidates) setResponseHeader(event, "x-nuxvel-invalidates", encodeURIComponent(JSON.stringify(invalidates)));
      return { result: { data: { json: "hello" } } };
    },
  });
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

function spyOnInvalidation() {
  const invalidated: unknown[] = [];
  vi.spyOn(useQueryCache(), "invalidateQueries").mockImplementation(async (filters) => {
    invalidated.push(filters?.key);
  });
  return invalidated;
}

describe("a mutation invalidates", () => {
  beforeEach(() => {
    const queryCache = useQueryCache();
    queryCache.getEntries().forEach((entry) => queryCache.remove(entry));
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("refetches an active query of the mutation's namespace", async () => {
    const calls = respondWithPing();
    respondWithEcho();
    const wrapper = await mountSuspended(
      defineComponent({
        setup() {
          const ping = $api.health.ping.useQuery();
          return () => h("p", ping.data ?? "");
        },
      }),
    );
    onTestFinished(() => wrapper.unmount());
    await vi.waitFor(() => expect(wrapper.text()).toBe("pong"));

    await $api.health.echo.mutate("hello");

    await vi.waitFor(() => expect(calls).toEqual(["ping", "ping"]));
  });

  it("invalidates the tags its response names and its namespace", async () => {
    respondWithEcho([["post", "byId"], ["health"], ["tag", { id: 1 }]]);
    const invalidated = spyOnInvalidation();

    await $api.health.echo.mutate("hello");

    await vi.waitFor(() =>
      expect(invalidated).toEqual([["trpc", "post", "byId"], ["trpc", "health"], ["trpc", "tag", { id: 1 }]]),
    );
  });

  it("invalidates its namespace when the response names no tags", async () => {
    respondWithEcho([]);
    const invalidated = spyOnInvalidation();

    await $api.health.echo.mutate("hello");

    await vi.waitFor(() => expect(invalidated).toEqual([["trpc", "health"]]));
  });

  it("invalidates nothing after a failed mutation or a query", async () => {
    registerEndpoint("/api/trpc/health.echo", {
      method: "POST",
      once: true,
      handler: (event) => {
        setResponseStatus(event, 400);
        return { error: { json: { message: "Bad", code: -32600, data: { code: "BAD_REQUEST", httpStatus: 400 } } } };
      },
    });
    respondWithPing();
    const invalidated = spyOnInvalidation();

    await expect($api.health.echo.mutate("hello")).rejects.toThrow("Bad");
    await $api.health.ping.query();
    respondWithEcho([["post"]]);
    await $api.health.echo.mutate("hello");

    await vi.waitFor(() => expect(invalidated).toEqual([["trpc", "post"], ["trpc", "health"]]));
  });

  it("does not fetch a query again that the mutation's onSettled already fetches again", async () => {
    const calls = respondWithPing();
    respondWithEcho();
    let mutate = () => {};
    const wrapper = await mountSuspended(
      defineComponent({
        setup() {
          const queryCache = useQueryCache();
          const ping = $api.health.ping.useQuery();
          const echo = $api.health.echo.useMutation({
            onSettled: () => queryCache.invalidateQueries({ key: $api.health.ping.key() }),
          });
          mutate = () => echo.mutate("hello");
          return () => h("p", `${ping.data ?? ""} ${echo.status}`);
        },
      }),
    );
    onTestFinished(() => wrapper.unmount());
    await vi.waitFor(() => expect(wrapper.text()).toBe("pong pending"));

    mutate();

    await vi.waitFor(() => expect(wrapper.text()).toBe("pong success"));
    await vi.waitFor(() => expect(calls).toEqual(["ping", "ping"]));
  });
});
