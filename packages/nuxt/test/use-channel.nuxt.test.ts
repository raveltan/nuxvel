import { defineComponent, h, nextTick } from "vue";
import { afterEach, beforeEach, describe, expect, it, onTestFinished, vi } from "vitest";
import { mountSuspended } from "@nuxt/test-utils/runtime";
import { useState } from "#app";

class FakeEventSource extends EventTarget {
  static instances: FakeEventSource[] = [];

  readonly url: string;
  closed = false;

  constructor(url: string) {
    super();
    this.url = url;
    FakeEventSource.instances.push(this);
  }

  connect(connectionId = "connection-1", refused: string[] = []) {
    const requested: { name: string }[] = JSON.parse(
      new URL(this.url, "http://localhost").searchParams.get("channels") ?? "[]",
    );
    const channels = requested
      .map((request) => request.name)
      .filter((name) => !refused.includes(name));

    this.dispatchEvent(
      new MessageEvent("connected", {
        data: JSON.stringify({ connectionId, channels, refused }),
      }),
    );
  }

  deliver(channel: string, event: string, payload: unknown) {
    if (this.closed) return;

    this.dispatchEvent(
      new MessageEvent(`channel:${channel}`, {
        data: JSON.stringify({ event, payload }),
      }),
    );
  }

  close() {
    this.closed = true;
  }
}

function onlySource() {
  const [source] = FakeEventSource.instances;

  if (!source) throw new Error("no EventSource was opened");
  if (FakeEventSource.instances.length > 1) {
    throw new Error(`${FakeEventSource.instances.length} EventSources were opened`);
  }

  return source;
}

const listener = defineComponent({
  props: {
    channels: { type: Array as () => string[], required: true },
    limit: { type: Number, default: undefined },
  },
  setup(props) {
    const channels = props.channels.map((name) => ({
      name,
      ...useChannel(name, { limit: props.limit }),
    }));

    return () =>
      h(
        "div",
        channels.map((channel) =>
          h("div", [
            h(
              "p",
              { class: `events-${channel.name}` },
              channel.events.value
                .map((message) => `${message.event}:${JSON.stringify(message.payload)}`)
                .join(", "),
            ),
            h(
              "button",
              { class: `leave-${channel.name}`, onClick: channel.close },
              "leave",
            ),
            h("span", { class: `status-${channel.name}` }, channel.status.value),
          ]),
        ),
      );
  },
});

const mounted: { unmount: () => void }[] = [];

async function mountListener(channels: string[], limit?: number) {
  const wrapper = await mountSuspended(listener, {
    props: { channels, limit },
  });

  mounted.push(wrapper);

  return wrapper;
}

const RECONNECT_DELAY_MS = 1000;

async function settle() {
  for (let tick = 0; tick < 5; tick += 1) await nextTick();
}

describe("useChannel()", () => {
  beforeEach(() => {
    useState("nuxvel:session").value = null;
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
    for (const wrapper of mounted.splice(0)) wrapper.unmount();
    await settle();
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("shares one connection between the channels a component listens to", async () => {
    const wrapper = await mountListener(["_probe-public", "_probe-members"]);

    await vi.waitFor(() => expect(FakeEventSource.instances).toHaveLength(1));
    expect(onlySource().url).toBe(
      `/api/channels?channels=${encodeURIComponent(
        JSON.stringify([{ name: "_probe-public" }, { name: "_probe-members" }]),
      )}`,
    );

    onlySource().connect();
    await settle();

    onlySource().deliver("_probe-public", "pinged", { count: 1 });
    onlySource().deliver("_probe-members", "greeted", { count: 2 });
    await nextTick();

    expect(wrapper.find(".events-_probe-public").text()).toBe(
      'pinged:{"count":1}',
    );
    expect(wrapper.find(".events-_probe-members").text()).toBe(
      'greeted:{"count":2}',
    );
    expect(FakeEventSource.instances).toHaveLength(1);
  });

  it("takes the $channels and $jobs stubs, which hold only the names", async () => {
    expect($channels._probePublic).toEqual({ name: "_probe-public" });
    expect($jobs.demo.countdown).toEqual({ name: "demo.countdown" });

    const wrapper = await mountSuspended(
      defineComponent({
        setup() {
          const { events } = useChannel($channels._probePublic);
          const job = useJobChannel($jobs.demo.countdown);

          return () => h("p", [...events.value, ...job.events.value].map((message) => message.event).join(", "));
        },
      }),
    );

    mounted.push(wrapper);
    await vi.waitFor(() => expect(FakeEventSource.instances).toHaveLength(1));
    expect(onlySource().url).toBe(
      `/api/channels?channels=${encodeURIComponent(
        JSON.stringify([{ name: "_probe-public" }, { name: "job:demo.countdown" }]),
      )}`,
    );

    onlySource().connect();
    await settle();
    onlySource().deliver("_probe-public", "pinged", { count: 1 });
    onlySource().deliver("job:demo.countdown", "progress", { percent: 25 });
    await nextTick();

    expect(wrapper.text()).toBe("pinged, progress");
  });

  it("keeps only the newest messages, 100 unless a limit is given", async () => {
    const bounded = await mountListener(["_probe-public"], 2);
    const defaulted = await mountListener(["_probe-members"]);

    await vi.waitFor(() => expect(FakeEventSource.instances).toHaveLength(1));
    onlySource().connect();
    await settle();
    await vi.waitFor(() =>
      expect(fetch).toHaveBeenCalledWith(
        "/api/channels/join",
        expect.anything(),
      ),
    );
    await settle();

    for (let count = 1; count <= 3; count += 1) {
      onlySource().deliver("_probe-public", "pinged", { count });
    }
    for (let count = 1; count <= 101; count += 1) {
      onlySource().deliver("_probe-members", "greeted", { count });
    }
    await nextTick();

    expect(bounded.find(".events-_probe-public").text()).toBe(
      'pinged:{"count":2}, pinged:{"count":3}',
    );

    const received = defaulted.find(".events-_probe-members").text().split(", ");

    expect(received).toHaveLength(100);
    expect(received[0]).toBe('greeted:{"count":2}');
  });

  it("leaves one channel over the open connection, keeping the other", async () => {
    const wrapper = await mountListener(["_probe-public", "_probe-members"]);

    await vi.waitFor(() => expect(FakeEventSource.instances).toHaveLength(1));
    onlySource().connect();
    await settle();

    await wrapper.find(".leave-_probe-public").trigger("click");
    await settle();

    onlySource().deliver("_probe-public", "pinged", { count: 1 });
    onlySource().deliver("_probe-members", "greeted", { count: 2 });
    await nextTick();

    expect(wrapper.find(".events-_probe-public").text()).toBe("");
    expect(wrapper.find(".events-_probe-members").text()).toBe(
      'greeted:{"count":2}',
    );
    expect(onlySource().closed).toBe(false);
    expect(fetch).toHaveBeenCalledWith(
      "/api/channels/leave",
      expect.objectContaining({
        body: JSON.stringify({
          connectionId: "connection-1",
          channel: "_probe-public",
        }),
      }),
    );
  });

  it("joins a channel a later component listens to over the same connection", async () => {
    await mountListener(["_probe-public"]);

    await vi.waitFor(() => expect(FakeEventSource.instances).toHaveLength(1));
    onlySource().connect();
    await settle();

    const second = await mountListener(["_probe-members"]);

    await vi.waitFor(() =>
      expect(fetch).toHaveBeenCalledWith(
        "/api/channels/join",
        expect.objectContaining({
          body: JSON.stringify({
            connectionId: "connection-1",
            channel: "_probe-members",
          }),
        }),
      ),
    );
    await settle();

    onlySource().deliver("_probe-members", "greeted", { count: 2 });
    await nextTick();

    expect(second.find(".events-_probe-members").text()).toBe(
      'greeted:{"count":2}',
    );
    expect(FakeEventSource.instances).toHaveLength(1);
  });

  it("leaves a channel the connection refused alone", async () => {
    const wrapper = await mountListener(["_probe-public", "_probe-members"]);

    await vi.waitFor(() => expect(FakeEventSource.instances).toHaveLength(1));
    onlySource().connect("connection-1", ["_probe-members"]);
    await settle();

    expect(fetch).not.toHaveBeenCalledWith(
      "/api/channels/join",
      expect.anything(),
    );

    onlySource().deliver("_probe-public", "pinged", { count: 1 });
    await nextTick();

    expect(wrapper.find(".events-_probe-public").text()).toBe(
      'pinged:{"count":1}',
    );
    expect(wrapper.find(".events-_probe-members").text()).toBe("");
  });

  it("reopens the connection when a join request fails outright", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    await mountListener(["_probe-public"]);

    await vi.waitFor(() => expect(FakeEventSource.instances).toHaveLength(1));
    onlySource().connect();
    await settle();

    vi.mocked(fetch).mockRejectedValueOnce(new Error("offline"));
    await mountListener(["_probe-members"]);
    await vi.waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));
    await settle();

    expect(FakeEventSource.instances).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(RECONNECT_DELAY_MS);
    expect(FakeEventSource.instances).toHaveLength(2);

    const reopened = FakeEventSource.instances[1];

    if (!reopened) throw new Error("the connection was not reopened");

    expect(reopened.url).toBe(
      `/api/channels?channels=${encodeURIComponent(
        JSON.stringify([{ name: "_probe-public" }, { name: "_probe-members" }]),
      )}`,
    );
  });

  it("reopens the connection when a leave lands on the wrong server", async () => {
    const wrapper = await mountListener(["_probe-public", "_probe-members"]);

    await vi.waitFor(() => expect(FakeEventSource.instances).toHaveLength(1));
    onlySource().connect();
    await settle();

    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ code: "CONFLICT" }), { status: 409 }),
    );
    await wrapper.find(".leave-_probe-public").trigger("click");

    await vi.waitFor(() => expect(FakeEventSource.instances).toHaveLength(2));

    const reopened = FakeEventSource.instances[1];

    if (!reopened) throw new Error("the connection was not reopened");

    expect(reopened.url).toBe(
      `/api/channels?channels=${encodeURIComponent(
        JSON.stringify([{ name: "_probe-members" }]),
      )}`,
    );
  });

  it("reconnects after a random delay that doubles on each failure up to 30 seconds, reporting reconnecting", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });

    const random = vi.spyOn(Math, "random").mockReturnValue(0.5);

    onTestFinished(() => random.mockRestore());

    const wrapper = await mountListener(["_probe-public"]);
    const status = () => wrapper.find(".status-_probe-public").text();

    await vi.waitFor(() => expect(FakeEventSource.instances).toHaveLength(1));
    expect(status()).toBe("connecting");

    onlySource().connect();
    await settle();
    expect(status()).toBe("open");

    async function dropAndWait(delayMs: number) {
      const opened = FakeEventSource.instances.length;

      FakeEventSource.instances.at(-1)?.dispatchEvent(new Event("error"));
      await settle();
      expect(status()).toBe("reconnecting");

      await vi.advanceTimersByTimeAsync(delayMs - 1);
      expect(FakeEventSource.instances).toHaveLength(opened);
      await vi.advanceTimersByTimeAsync(1);
      expect(FakeEventSource.instances).toHaveLength(opened + 1);
    }

    for (const delayMs of [500, 1000, 2000, 4000, 8000, 15_000, 15_000]) await dropAndWait(delayMs);

    FakeEventSource.instances.at(-1)?.connect();
    await settle();
    expect(status()).toBe("open");

    await dropAndWait(500);
  });

  it("reports closed after close()", async () => {
    const wrapper = await mountListener(["_probe-public"]);

    await vi.waitFor(() => expect(FakeEventSource.instances).toHaveLength(1));
    onlySource().connect();
    await settle();

    await wrapper.find(".leave-_probe-public").trigger("click");

    expect(wrapper.find(".status-_probe-public").text()).toBe("closed");
  });

  it("closes the connection once the last component unmounts", async () => {
    const wrapper = await mountListener(["_probe-public"]);

    await vi.waitFor(() => expect(FakeEventSource.instances).toHaveLength(1));
    onlySource().connect();
    await settle();

    wrapper.unmount();
    mounted.splice(mounted.indexOf(wrapper), 1);
    await settle();

    expect(onlySource().closed).toBe(true);
  });
});
