import { defineComponent, h, nextTick } from "vue";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mountSuspended } from "@nuxt/test-utils/runtime";

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
    this.dispatchEvent(
      new MessageEvent(`channel:${CHANNEL}`, {
        data: JSON.stringify({ event: "progress", payload: { percent } }),
      }),
    );
  }
}

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
      )}`,
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
});
