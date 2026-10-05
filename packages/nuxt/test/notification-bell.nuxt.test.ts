import { defineComponent, h } from "vue";
import { beforeEach, describe, expect, it, onTestFinished, vi } from "vitest";
import { mountSuspended, registerEndpoint } from "@nuxt/test-utils/runtime";
import { NotificationBell } from "#components";
import { useState } from "#app";

const emptyList = { unreadCount: 0, notifications: [] };

function respondLater() {
  let respond: (list: typeof emptyList) => void = () => {};
  const list = new Promise<typeof emptyList>((resolve) => {
    respond = resolve;
  });
  registerEndpoint("/api/notifications", () => list);
  return (body = emptyList) => respond(body);
}

async function mountBell(slots: object = {}) {
  const wrapper = await mountSuspended(defineComponent({ setup: () => () => h(NotificationBell, null, slots) }), {
    attachTo: document.body,
  });
  onTestFinished(() => wrapper.unmount());
  return wrapper;
}

async function openPanel(wrapper: Awaited<ReturnType<typeof mountBell>>) {
  if (wrapper.get("button").attributes("aria-expanded") === "false") await wrapper.get("button").trigger("click");
  await vi.waitFor(() => expect(document.querySelector("section[aria-label]")).not.toBeNull());
  return document.querySelector("section[aria-label]");
}

describe("<NotificationBell>", () => {
  beforeEach(({ task }) => {
    vi.stubGlobal("EventSource", class extends EventTarget {
      close() {}
    });
    useState("nuxvel:session").value = {
      user: { id: task.id, name: "Ada", email: "ada@example.com" },
      session: { id: "session-1" },
    };
    return () => vi.unstubAllGlobals();
  });

  it("shows a loading state, not the empty text, until the first list arrives", async () => {
    const respond = respondLater();
    const wrapper = await mountBell();
    const loadingPanel = await openPanel(wrapper);

    expect(loadingPanel?.querySelector('[role="status"]')).not.toBeNull();
    expect(loadingPanel?.querySelector("[data-empty]")).toBeNull();

    respond();

    await vi.waitFor(async () => expect((await openPanel(wrapper))?.querySelector("[data-empty]")).not.toBeNull());
    expect((await openPanel(wrapper))?.querySelector('[role="status"]')).toBeNull();
  });

  it("renders its loading slot in place of the skeleton", async () => {
    respondLater();
    const loadingPanel = await openPanel(await mountBell({ loading: () => h("p", { class: "bell-loading" }, "Fetching") }));

    expect(loadingPanel?.querySelector(".bell-loading")?.textContent).toBe("Fetching");
    expect(loadingPanel?.querySelector('[role="status"]')).toBeNull();
  });
});
