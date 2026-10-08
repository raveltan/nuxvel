import { defineComponent, h, nextTick } from "vue";
import { afterEach, beforeEach, describe, expect, it, onTestFinished, vi } from "vitest";
import { mountSuspended } from "@nuxt/test-utils/runtime";
import { useState } from "#app";
import { usePresence } from "@nuxvel/nuxt/app/realtime";

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

const roster = defineComponent({
  props: { id: { type: String, required: true } },
  setup(props) {
    const { members } = usePresence("posts", { params: { id: props.id } });

    return () => h("p", members.value.map((member) => `${member.name}:${JSON.stringify(member.state)}:${member.connections}`).join(","));
  },
});

const mounted: { unmount: () => void }[] = [];

async function mountRoster(id: string) {
  const wrapper = await mountSuspended(roster, { props: { id } });

  mounted.push(wrapper);

  return wrapper;
}

async function settle() {
  for (let tick = 0; tick < 5; tick += 1) await nextTick();
}

const ada = { userId: "a", name: "Ada", state: {}, connections: 1 };
const bea = { userId: "b", name: "Bea", state: {}, connections: 1 };
const cy = { userId: "c", name: "Cy", state: {}, connections: 1 };

describe("usePresence()", () => {
  beforeEach(() => {
    useState("nuxvel:session").value = null;
    FakeEventSource.instances = [];
    vi.stubGlobal("EventSource", FakeEventSource);
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ joined: true }), { status: 200 })));
  });

  afterEach(async () => {
    for (const wrapper of mounted.splice(0)) wrapper.unmount();
    await settle();
    vi.unstubAllGlobals();
  });

  it("applies each change to the member list it got on join", async () => {
    const wrapper = await mountRoster("p1");

    await vi.waitFor(() => expect(FakeEventSource.instances).toHaveLength(1));
    onlySource().connect();
    await settle();

    const room = "posts?id=p1";

    onlySource().deliver(room, "presence.sync", { members: [ada, bea] });
    onlySource().deliver(room, "presence.update", { userId: "b", member: { ...bea, state: { typing: true } } });
    onlySource().deliver(room, "presence.join", { userId: "c", member: cy });
    onlySource().deliver(room, "presence.leave", { userId: "a" });
    await nextTick();

    expect(wrapper.text()).toBe('Bea:{"typing":true}:1,Cy:{}:1');
  });

  it("gives a second usePresence() of a joined room the current members", async () => {
    await mountRoster("p2");
    await vi.waitFor(() => expect(FakeEventSource.instances).toHaveLength(1));
    onlySource().connect();
    await settle();
    onlySource().deliver("posts?id=p2", "presence.sync", { members: [ada] });

    const second = await mountRoster("p2");

    await settle();

    expect(second.text()).toBe("Ada:{}:1");
  });
});
