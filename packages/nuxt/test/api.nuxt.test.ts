import { isReactive, isRef, reactive, unref } from "vue";
import { describe, expect, it } from "vitest";
import { registerEndpoint } from "@nuxt/test-utils/runtime";
import { $api } from "#imports";

describe("$api", () => {
  it("builds the same keys as the tRPC client", () => {
    expect($api.post.key()).toEqual(["trpc", "post"]);
    expect($api.post.byId.key({ id: 1 })).toEqual(["trpc", "post", "byId", { id: 1 }]);
    expect($api.post.byId.queryOptions({ id: 1 }).key).toEqual(["trpc", "post", "byId", { id: 1 }]);
  });

  it("is neither a ref nor reactive, so templates and reactive() keep it as is", () => {
    expect(isRef($api)).toBe(false);
    expect(isRef($api.post)).toBe(false);
    expect(isReactive($api)).toBe(false);
    expect(isReactive(reactive({ api: $api }).api)).toBe(false);
    expect(unref($api)).toBe($api);
    expect(reactive({ api: $api }).api).toBe($api);
  });

  it("is not a thenable, so awaiting it yields itself", async () => {
    expect(Reflect.get($api, "then")).toBeUndefined();
    expect(Reflect.get($api.post, "toJSON")).toBeUndefined();
    expect(await Promise.resolve($api)).toBe($api);
  });

  it("calls the procedure through the app's tRPC client", async () => {
    registerEndpoint("/api/trpc/health.ping", {
      method: "GET",
      handler: () => [{ result: { data: { json: "pong" } } }],
    });
    registerEndpoint("/api/trpc/health.echo", {
      method: "POST",
      handler: () => ({ result: { data: { json: "hello" } } }),
    });

    expect(await $api.health.ping.query()).toBe("pong");
    expect(await $api.health.ping.queryOptions().query()).toBe("pong");
    expect(await $api.health.echo.mutationOptions().mutation("hello")).toBe("hello");
  });
});
