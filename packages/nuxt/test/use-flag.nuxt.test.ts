import { defineComponent, h, nextTick } from "vue";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mountSuspended, registerEndpoint } from "@nuxt/test-utils/runtime";
import { readBody } from "h3";

class FakeEventSource extends EventTarget {
  static instances: FakeEventSource[] = [];

  readonly url: string;

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
          channels: ["flags"],
          refused: [],
        }),
      }),
    );
  }

  deliver(event: string, payload: unknown) {
    this.dispatchEvent(
      new MessageEvent("channel:flags", {
        data: JSON.stringify({ event, payload }),
      }),
    );
  }

  close() {}
}

const probe = defineComponent({
  setup() {
    const rollout = useFlag("probe-rollout");
    const cta = useExperiment("probe-cta");

    return () => h("p", `${rollout.value} ${cta.value}`);
  },
});

describe("useFlag() / useExperiment()", () => {
  let served = { flags: { "probe-rollout": false }, experiments: { "probe-cta": "control" } };
  let wrapper: { unmount: () => void } | undefined;
  let exposed: string[] = [];

  beforeEach(() => {
    exposed = [];
    registerEndpoint("/api/flags", { method: "GET", handler: () => served });
    registerEndpoint("/api/flags/exposures", {
      method: "POST",
      handler: async (event) => {
        const body = await readBody<{ name: string }>(event);

        exposed.push(body.name);

        return { recorded: true };
      },
    });
    FakeEventSource.instances = [];
    vi.stubGlobal("EventSource", FakeEventSource);
  });

  afterEach(async () => {
    wrapper?.unmount();
    wrapper = undefined;
    await nextTick();
    vi.unstubAllGlobals();
  });

  it("updates an open page when a flag is toggled server-side, without a reload", async () => {
    useState("nuxvel:flags").value = {
      flags: { "probe-rollout": false },
      experiments: { "probe-cta": "control" },
    };

    const mounted = await mountSuspended(probe);

    wrapper = mounted;
    expect(mounted.text()).toBe("false control");

    await vi.waitFor(() => expect(FakeEventSource.instances).toHaveLength(1));

    const [source] = FakeEventSource.instances;

    if (!source) throw new Error("no EventSource was opened");

    source.connect();
    await nextTick();

    served = { flags: { "probe-rollout": true }, experiments: { "probe-cta": "green" } };
    source.deliver("changed", { name: "probe-rollout" });

    await vi.waitFor(() => expect(mounted.text()).toBe("true green"));
  });

  it("takes the $flags stub, which holds only the flag's name", async () => {
    expect($flags.probeRollout).toEqual({ name: "probe-rollout" });
    expect($experiments.probeCta).toEqual({ name: "probe-cta" });

    useState("nuxvel:flags").value = { flags: { "probe-rollout": true }, experiments: {} };
    const mounted = await mountSuspended(
      defineComponent({
        setup() {
          const rollout = useFlag($flags.probeRollout);

          return () => h("p", String(rollout.value));
        },
      }),
    );

    wrapper = mounted;
    expect(mounted.text()).toBe("true");
  });

  it("records an exposure for each flag and experiment it renders", async () => {
    wrapper = await mountSuspended(probe);

    await vi.waitFor(() =>
      expect(exposed.sort()).toEqual(["probe-cta", "probe-rollout"]),
    );
  });
});
