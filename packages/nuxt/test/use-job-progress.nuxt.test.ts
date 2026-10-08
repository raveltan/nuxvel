import superjson from "superjson";
import { defineComponent, h, nextTick } from "vue";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mountSuspended } from "@nuxt/test-utils/runtime";
import { useJobChannel } from "@nuxvel/nuxt/app/realtime";

const CHANNEL = "job:_probe.progress";

class FakeEventSource extends EventTarget {
  static instances: FakeEventSource[] = [];

  readonly url: string;
  closed = false;

  constructor(url: string) {
    super();
    this.url = url;
    FakeEventSource.instances.push(this);
  }

  connect() {
    this.dispatchEvent(
      new MessageEvent("connected", {
        data: JSON.stringify({
          connectionId: "connection-1",
          channels: [CHANNEL],
          refused: [],
        }),
      }),
    );
  }

  close() {
    this.closed = true;
  }

  report(percent: number) {
    this.send("progress", { percent });
  }

  send(event: string, payload: unknown) {
    this.dispatchEvent(new MessageEvent(`channel:${CHANNEL}`, { data: superjson.stringify({ event, payload }) }));
  }
}

const runWatcher = defineComponent({
  setup() {
    const { status, progress, result, error } = useJobChannel("_probe.progress");

    return () => h("p", JSON.stringify({ status: status.value, progress: progress.value, result: result.value, error: error.value }));
  },
});

const watcher = defineComponent({
  setup() {
    const { events } = useJobChannel("_probe.progress");
    const percent = () =>
      events.value.flatMap((message) =>
        message.event === "progress" ? [message.payload.percent] : [],
      );

    return () => h("p", percent().join(", "));
  },
});

describe("job progress over useJobChannel()", () => {
  let wrapper: { unmount: () => void } | undefined;

  beforeEach(() => {
    FakeEventSource.instances = [];
    vi.stubGlobal("EventSource", FakeEventSource);
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(JSON.stringify({ joined: true }), { status: 200 }),
      ),
    );
  });

  afterEach(async () => {
    wrapper?.unmount();
    wrapper = undefined;
    await nextTick();
    await nextTick();
    vi.unstubAllGlobals();
  });

  it("follows a run reporting 50% then 100%", async () => {
    const mounted = await mountSuspended(watcher);

    wrapper = mounted;

    await vi.waitFor(() => expect(FakeEventSource.instances).toHaveLength(1));

    const [source] = FakeEventSource.instances;

    if (!source) throw new Error("no EventSource was opened");

    expect(source.url).toBe(
      `/api/channels?channels=${encodeURIComponent(
        JSON.stringify([{ name: CHANNEL }]),
      )}&build=${useRuntimeConfig().app.buildId}`,
    );

    source.connect();
    await nextTick();

    source.report(50);
    await nextTick();

    expect(mounted.text()).toBe("50");

    source.report(100);
    await nextTick();

    expect(mounted.text()).toBe("50, 100");
  });

  it("reads the latest run into status, progress, result and error", async () => {
    const mounted = await mountSuspended(runWatcher);
    const state = () => JSON.parse(mounted.text());

    wrapper = mounted;
    await vi.waitFor(() => expect(FakeEventSource.instances).toHaveLength(1));

    const [source] = FakeEventSource.instances;

    if (!source) throw new Error("no EventSource was opened");

    source.connect();
    await nextTick();
    expect(state()).toEqual({ status: "idle" });

    source.report(40);
    await nextTick();
    expect(state()).toEqual({ status: "running", progress: 40 });

    source.send("completed", { result: { count: 3 } });
    await nextTick();
    expect(state()).toEqual({ status: "completed", progress: 100, result: { count: 3 } });

    source.report(10);
    source.send("failed", { message: "Something went wrong" });
    await nextTick();
    expect(state()).toEqual({ status: "failed", progress: 10, error: "Something went wrong" });
  });

  it("starts over at running when a job that reports no progress runs again", async () => {
    const mounted = await mountSuspended(runWatcher);
    const state = () => JSON.parse(mounted.text());

    wrapper = mounted;
    await vi.waitFor(() => expect(FakeEventSource.instances).toHaveLength(1));

    const [source] = FakeEventSource.instances;

    if (!source) throw new Error("no EventSource was opened");

    source.connect();
    source.send("started", {});
    source.send("completed", { result: { count: 3 } });
    await nextTick();
    expect(state()).toEqual({ status: "completed", progress: 100, result: { count: 3 } });

    source.send("started", {});
    await nextTick();
    expect(state()).toEqual({ status: "running" });

    source.send("failed", { message: "Something went wrong" });
    await nextTick();
    expect(state()).toEqual({ status: "failed", error: "Something went wrong" });
  });
});
