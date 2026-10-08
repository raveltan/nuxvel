import { defineComponent, h } from "vue";
import { describe, expect, it, onTestFinished, vi } from "vitest";
import { mountSuspended, registerEndpoint } from "@nuxt/test-utils/runtime";
import { useQuery, useQueryCache } from "@pinia/colada";
import { authClient, useUser } from "@nuxvel/nuxt/app/auth";

const SESSION = {
  session: {
    id: "session-1",
    token: "session-token-1",
    userId: "user-1",
    expiresAt: new Date(Date.now() + 1000 * 60 * 60).toISOString(),
    ipAddress: null,
    userAgent: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  user: {
    id: "user-1",
    name: "Test User",
    email: "use-user@example.com",
    emailVerified: false,
    image: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
};

describe("useUser()", () => {
  it("reflects sign-in state", async () => {
    let signedIn = false;
    const getSessionHandler = () => (signedIn ? SESSION : null);
    registerEndpoint("/api/auth/get-session", getSessionHandler);
    registerEndpoint(
      `${window.location.origin}/api/auth/get-session`,
      getSessionHandler,
    );

    const component = defineComponent({
      setup() {
        const { user, isPending } = useUser();
        return () =>
          h("div", [
            h("p", { class: "user" }, user.value?.name ?? "anonymous"),
            h("p", { class: "pending" }, String(isPending.value)),
          ]);
      },
    });

    const wrapper = await mountSuspended(component);

    await vi.waitFor(() =>
      expect(wrapper.find(".pending").text()).toBe("false"),
    );
    expect(wrapper.find(".user").text()).toBe("anonymous");

    const signInHandler = {
      method: "POST" as const,
      handler: () => {
        signedIn = true;
        return { redirect: false, token: "session-token-1", user: SESSION.user };
      },
    };
    registerEndpoint("/api/auth/sign-in/email", signInHandler);
    registerEndpoint(`${window.location.origin}/api/auth/sign-in/email`, signInHandler);

    await authClient.signIn.email({ email: SESSION.user.email, password: "secret-password" });

    await vi.waitFor(() =>
      expect(wrapper.find(".user").text()).toBe("Test User"),
    );
  });

  it("drops every cached query on signOut()", async () => {
    registerEndpoint("/api/auth/sign-out", {
      method: "POST",
      handler: () => ({ success: true }),
    });
    registerEndpoint(`${window.location.origin}/api/auth/sign-out`, {
      method: "POST",
      handler: () => ({ success: true }),
    });

    let signOut: () => Promise<void> = async () => {};
    let queryCache: ReturnType<typeof useQueryCache> | undefined;

    await mountSuspended(
      defineComponent({
        setup() {
          signOut = useUser().signOut;
          queryCache = useQueryCache();
          queryCache.setQueryData(["post", "mine"], ["private post"]);
          return () => h("div");
        },
      }),
    );

    expect(queryCache?.getQueryData(["post", "mine"])).toEqual(["private post"]);

    await signOut();

    expect(queryCache?.getQueryData(["post", "mine"])).toBeUndefined();
  });

  it("clears the data of a query a mounted component still uses on signOut()", async () => {
    const signOutHandler = { method: "POST" as const, handler: () => ({ success: true }) };
    registerEndpoint("/api/auth/sign-out", signOutHandler);
    registerEndpoint(`${window.location.origin}/api/auth/sign-out`, signOutHandler);

    let signOut: () => Promise<void> = async () => {};
    const wrapper = await mountSuspended(
      defineComponent({
        setup() {
          signOut = useUser().signOut;
          const { data } = useQuery({ key: ["post", "mounted"], query: async () => "private post" });
          return () => h("p", data.value ?? "nothing");
        },
      }),
    );
    await vi.waitFor(() => expect(wrapper.text()).toBe("private post"));
    const warn = vi.spyOn(console, "warn");
    onTestFinished(() => warn.mockRestore());

    await signOut();

    await vi.waitFor(() => expect(wrapper.text()).toBe("nothing"));
    expect(warn.mock.calls.flat().join("\n")).not.toContain("PINIA_COLADA_R0010");
  });

  it("deletes the service worker's page cache and ends this device's push subscription on signOut()", async () => {
    const signOutHandler = { method: "POST" as const, handler: () => ({ success: true }) };
    registerEndpoint("/api/auth/sign-out", signOutHandler);
    registerEndpoint(`${window.location.origin}/api/auth/sign-out`, signOutHandler);
    const deleteCache = vi.fn(async (_name: string) => true);
    const unsubscribe = vi.fn(async () => true);
    vi.stubGlobal("caches", { delete: deleteCache });
    Object.defineProperty(navigator, "serviceWorker", {
      configurable: true,
      value: { getRegistration: async () => ({ pushManager: { getSubscription: async () => ({ unsubscribe }) } }) },
    });
    onTestFinished(() => {
      vi.unstubAllGlobals();
      Reflect.deleteProperty(navigator, "serviceWorker");
    });

    let signOut: () => Promise<void> = async () => {};
    await mountSuspended(
      defineComponent({
        setup() {
          signOut = useUser().signOut;
          return () => h("div");
        },
      }),
    );

    await signOut();

    expect(deleteCache.mock.calls).toEqual([["nuxvel-pages"]]);
    expect(unsubscribe).toHaveBeenCalledOnce();
  });
});
