import { defineComponent, h } from "vue";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { mountSuspended, registerEndpoint } from "@nuxt/test-utils/runtime";
import { useQuery, useQueryCache } from "@pinia/colada";
import { $api } from "@nuxvel/nuxt/app/api";

function deferred<T>() {
  let resolve: (value: T) => void = () => {};
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

async function mountPingWithOptimisticEcho(
  onError?: (error: Error, text: string) => void,
) {
  let mutate: ((text: string) => void) | undefined;
  let cachedPing: (() => unknown) | undefined;

  const component = defineComponent({
    setup() {
      const queryCache = useQueryCache();
      cachedPing = () => queryCache.getQueryData($api.health.ping.key());
      const { data } = useQuery($api.health.ping.queryOptions());
      const mutation = $api.health.echo.useMutation({
        optimistic: { key: () => $api.health.ping.key(), apply: (_current, text) => text },
        onError,
      });
      mutate = mutation.mutate;
      return () => h("div", data.value ?? "");
    },
  });

  const wrapper = await mountSuspended(component);

  if (!mutate || !cachedPing) throw new Error("the ping component did not mount");

  return { wrapper, mutate, cachedPing };
}

describe("the optimistic option of .useMutation()", () => {
  let serverPing: string;

  beforeEach(() => {
    const queryCache = useQueryCache();
    queryCache.getEntries().forEach((entry) => queryCache.remove(entry));

    serverPing = "pong";
    registerEndpoint("/api/trpc/health.ping", {
      method: "GET",
      handler: () => [{ result: { data: { json: serverPing } } }],
    });
  });

  it("reverts the optimistic update when the mutation fails", async () => {
    const echo = deferred<void>();
    registerEndpoint("/api/trpc/health.echo", {
      method: "POST",
      handler: async () => {
        await echo.promise;
        return {
          error: {
            json: {
              message: "boom",
              code: -32603,
              data: { code: "INTERNAL_SERVER_ERROR", httpStatus: 500 },
            },
          },
        };
      },
    });

    const { wrapper, mutate } = await mountPingWithOptimisticEcho();
    await vi.waitFor(() => expect(wrapper.text()).toBe("pong"));

    mutate("optimistic");
    await vi.waitFor(() => expect(wrapper.text()).toBe("optimistic"));

    echo.resolve();
    await vi.waitFor(() => expect(wrapper.text()).toBe("pong"));
  });

  it("confirms a succeeding update with the real response", async () => {
    const echo = deferred<void>();
    registerEndpoint("/api/trpc/health.echo", {
      method: "POST",
      handler: async () => {
        await echo.promise;
        serverPing = "confirmed";
        return { result: { data: { json: "optimistic" } } };
      },
    });

    const { wrapper, mutate } = await mountPingWithOptimisticEcho();
    await vi.waitFor(() => expect(wrapper.text()).toBe("pong"));

    mutate("optimistic");
    await vi.waitFor(() => expect(wrapper.text()).toBe("optimistic"));

    echo.resolve();
    await vi.waitFor(() => expect(wrapper.text()).toBe("confirmed"));
  });

  it("runs the onError of the options after the rollback", async () => {
    registerEndpoint("/api/trpc/health.echo", {
      method: "POST",
      handler: () => ({
        error: {
          json: {
            message: "boom",
            code: -32603,
            data: { code: "INTERNAL_SERVER_ERROR", httpStatus: 500 },
          },
        },
      }),
    });
    const failures: { message: string; text: string; cached: unknown }[] = [];

    const { wrapper, mutate, cachedPing } = await mountPingWithOptimisticEcho(
      (error, text) => {
        failures.push({ message: error.message, text, cached: cachedPing() });
      },
    );
    await vi.waitFor(() => expect(wrapper.text()).toBe("pong"));

    mutate("optimistic");

    await vi.waitFor(() => expect(failures).toHaveLength(1));
    expect(failures[0]).toEqual({ message: "boom", text: "optimistic", cached: "pong" });
  });
});
