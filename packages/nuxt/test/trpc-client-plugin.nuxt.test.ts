import { defineComponent, h } from "vue";
import { describe, expect, it, vi } from "vitest";
import { mountSuspended, registerEndpoint } from "@nuxt/test-utils/runtime";
import { useQuery } from "@pinia/colada";
import { setResponseHeader, setResponseStatus } from "h3";
import { QueryState } from "#components";
import { $api, isNetworkError } from "#imports";

describe("client tRPC plugin", () => {
  it("lets a mounted component query a procedure and render the result", async () => {
    registerEndpoint("/api/trpc/health.ping", {
      method: "GET",
      handler: () => [{ result: { data: { json: "pong" } } }],
    });

    const component = defineComponent({
      async setup() {
        const { data: pong, refresh } = useQuery(
          $api.health.ping.queryOptions(),
        );
        await refresh();
        return () => h("div", pong.value);
      },
    });

    const wrapper = await mountSuspended(component);

    expect(wrapper.text()).toContain("pong");
  });

  it("shows a clear message when a proxy answers with HTML, and loads the data on retry", async () => {
    let serverIsUp = false;
    registerEndpoint("/api/trpc/health.requestId", {
      method: "GET",
      handler: (event) => {
        if (serverIsUp) return [{ result: { data: { json: "req-1" } } }];
        setResponseStatus(event, 502);
        setResponseHeader(event, "content-type", "text/html");
        return "<!DOCTYPE html><h1>502 Bad Gateway</h1>";
      },
    });

    const wrapper = await mountSuspended(
      defineComponent({
        setup() {
          const ping = useQuery($api.health.requestId.queryOptions());
          return () =>
            h(QueryState, { query: ping }, {
              error: ({ error, retry }: { error: Error; retry: () => void }) =>
                h("button", { onClick: retry }, `${isNetworkError(error)}: ${error.message}`),
              default: ({ data }: { data: string }) => data,
            });
        },
      }),
    );

    await vi.waitFor(() =>
      expect(wrapper.text()).toBe("true: Can't reach the server. Check your connection and try again."),
    );

    serverIsUp = true;
    await wrapper.find("button").trigger("click");

    await vi.waitFor(() => expect(wrapper.text()).toBe("req-1"));
  });
});
