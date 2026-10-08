import { defineComponent, h, nextTick, ref } from "vue";
import { createError, getQuery } from "h3";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mountSuspended, registerEndpoint } from "@nuxt/test-utils/runtime";
import { useQueryCache } from "@pinia/colada";
import { $api, useLiveQuery } from "@nuxvel/nuxt/app/api";

const CHANNEL = "_probe-public";

class FakeEventSource extends EventTarget {
  static instances: FakeEventSource[] = [];

  readonly url: string;
  closed = false;

  constructor(url: string) {
    super();
    this.url = url;
    FakeEventSource.instances.push(this);
  }

  connect(channels = [CHANNEL]) {
    this.dispatchEvent(
      new MessageEvent("connected", {
        data: JSON.stringify({
          connectionId: "connection-1",
          channels,
          refused: [],
        }),
      }),
    );
  }

  deliver(event: string, payload: unknown, channel = CHANNEL) {
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

const list = defineComponent({
  setup() {
    const query = useLiveQuery($api.post.list.queryOptions(), {
      channel: CHANNEL,
      on: {
        created: (posts, payload) => [
          ...posts,
          payload as (typeof posts)[number],
        ],
      },
    });

    return () =>
      h("p", (query.data ?? []).map((post) => post.title).join(", "));
  },
});

const selectedId = ref(1);

const single = defineComponent({
  setup() {
    const query = useLiveQuery(() => $api.post.byId.queryOptions({ id: selectedId.value }), {
      channel: CHANNEL,
      on: {
        renamed: (post, { id }) => (post.id === id ? { ...post, title: `renamed ${id}` } : post),
      },
    });

    return () => h("p", query.data?.title ?? "");
  },
});

const refetched = defineComponent({
  setup() {
    const query = useLiveQuery(() => ({ ...$api.post.list.queryOptions(), enabled: true }), {
      channel: CHANNEL,
      refetch: { renamed: ({ id }) => id === 1 },
    });

    return () => h("p", (query.data ?? []).map((post) => post.title).join(", "));
  },
});

const BOARD_ROOM = "_probe-board?boardId=7";

const board = defineComponent({
  setup() {
    const query = useLiveQuery($api.post.list.queryOptions(), {
      channel: "_probe-board",
      params: { boardId: 7 },
      refetch: { moved: true },
    });

    return () => h("p", (query.data ?? []).map((post) => post.title).join(", "));
  },
});

function requestedId(input: unknown) {
  return Number(/"id":(\d+)/.exec(String(input))?.[1] ?? 0);
}

describe("useLiveQuery()", () => {
  let queried = 0;
  let wrapper: { unmount: () => void } | undefined;

  beforeEach(() => {
    const queryCache = useQueryCache();

    queryCache.getEntries().forEach((entry) => queryCache.remove(entry));

    queried = 0;
    registerEndpoint("/api/trpc/post.list", {
      method: "GET",
      handler: () => {
        queried += 1;

        return [
          {
            result: {
              data: {
                json: [{ id: 1, title: "first", body: "", createdAt: null }],
              },
            },
          },
        ];
      },
    });

    FakeEventSource.instances = [];
    vi.stubGlobal("EventSource", FakeEventSource);
  });

  afterEach(async () => {
    wrapper?.unmount();
    wrapper = undefined;
    await nextTick();
    await nextTick();
    vi.unstubAllGlobals();
  });

  it("appends a broadcast row without refetching the query", async () => {
    const mounted = await mountSuspended(list);

    wrapper = mounted;

    await vi.waitFor(() => expect(mounted.text()).toBe("first"));
    await vi.waitFor(() => expect(FakeEventSource.instances).toHaveLength(1));

    const [source] = FakeEventSource.instances;

    if (!source) throw new Error("no EventSource was opened");

    source.connect();
    await nextTick();

    source.deliver("created", {
      id: 2,
      title: "second",
      body: "",
      createdAt: null,
    });
    await vi.waitFor(() => expect(mounted.text()).toBe("first, second"));

    expect(queried).toBe(1);
  });

  it("refetches the query when the server sends resync for its channel", async () => {
    const mounted = await mountSuspended(list);

    wrapper = mounted;

    await vi.waitFor(() => expect(mounted.text()).toBe("first"));
    await vi.waitFor(() => expect(FakeEventSource.instances).toHaveLength(1));

    const [source] = FakeEventSource.instances;

    if (!source) throw new Error("no EventSource was opened");

    source.connect();
    await nextTick();

    source.dispatchEvent(new MessageEvent("resync", { data: JSON.stringify({ channel: CHANNEL }) }));

    await vi.waitFor(() => expect(queried).toBe(2));
  });

  it("ignores an event it has no patch for", async () => {
    const mounted = await mountSuspended(list);

    wrapper = mounted;

    await vi.waitFor(() => expect(mounted.text()).toBe("first"));
    await vi.waitFor(() => expect(FakeEventSource.instances).toHaveLength(1));

    const [source] = FakeEventSource.instances;

    if (!source) throw new Error("no EventSource was opened");

    source.connect();
    await nextTick();

    source.deliver("archived", { id: 1 });
    await nextTick();

    expect(mounted.text()).toBe("first");
    expect(queried).toBe(1);
  });

  it("refetches when a getter's input changes and patches the new key", async () => {
    const fetchedIds: number[] = [];

    selectedId.value = 1;
    registerEndpoint("/api/trpc/post.byId", {
      method: "GET",
      handler: (event) => {
        const id = requestedId(getQuery(event).input);

        fetchedIds.push(id);

        return [{ result: { data: { json: { id, title: `post ${id}`, body: "", createdAt: null } } } }];
      },
    });

    const mounted = await mountSuspended(single);

    wrapper = mounted;

    await vi.waitFor(() => expect(mounted.text()).toBe("post 1"));

    selectedId.value = 2;

    await vi.waitFor(() => expect(mounted.text()).toBe("post 2"));
    expect(fetchedIds).toEqual([1, 2]);

    await vi.waitFor(() => expect(FakeEventSource.instances).toHaveLength(1));

    const [source] = FakeEventSource.instances;

    if (!source) throw new Error("no EventSource was opened");

    source.connect();
    await nextTick();

    source.deliver("renamed", { id: 2 });

    await vi.waitFor(() => expect(mounted.text()).toBe("renamed 2"));
    expect(fetchedIds).toEqual([1, 2]);
  });

  it("refetches the query on an event whose refetch predicate holds", async () => {
    const mounted = await mountSuspended(refetched);

    wrapper = mounted;

    await vi.waitFor(() => expect(mounted.text()).toBe("first"));
    await vi.waitFor(() => expect(FakeEventSource.instances).toHaveLength(1));

    const [source] = FakeEventSource.instances;

    if (!source) throw new Error("no EventSource was opened");

    source.connect();
    await nextTick();

    source.deliver("renamed", { id: 2 });
    await nextTick();
    expect(queried).toBe(1);

    source.deliver("renamed", { id: 1 });
    await vi.waitFor(() => expect(queried).toBe(2));
  });

  it("leaves no unhandled rejection when a refetch fails", async () => {
    const mounted = await mountSuspended(refetched);

    wrapper = mounted;

    await vi.waitFor(() => expect(mounted.text()).toBe("first"));
    await vi.waitFor(() => expect(FakeEventSource.instances).toHaveLength(1));

    const [source] = FakeEventSource.instances;

    if (!source) throw new Error("no EventSource was opened");

    source.connect();
    await nextTick();

    registerEndpoint("/api/trpc/post.list", {
      method: "GET",
      handler: () => {
        queried += 1;

        throw createError({ statusCode: 404 });
      },
    });
    source.deliver("renamed", { id: 1 });

    await vi.waitFor(() => expect(queried).toBe(2));
    await new Promise((resolve) => setTimeout(resolve, 0));
  });

  it("listens to the room of its params only", async () => {
    const mounted = await mountSuspended(board);

    wrapper = mounted;

    await vi.waitFor(() => expect(mounted.text()).toBe("first"));
    await vi.waitFor(() => expect(FakeEventSource.instances).toHaveLength(1));

    const [source] = FakeEventSource.instances;

    if (!source) throw new Error("no EventSource was opened");

    expect(decodeURIComponent(source.url)).toContain(JSON.stringify([{ name: BOARD_ROOM }]));

    source.connect([BOARD_ROOM]);
    await nextTick();

    source.deliver("moved", { card: 1 }, "_probe-board");
    await nextTick();
    expect(queried).toBe(1);

    source.deliver("moved", { card: 1 }, BOARD_ROOM);
    await vi.waitFor(() => expect(queried).toBe(2));
  });
});
