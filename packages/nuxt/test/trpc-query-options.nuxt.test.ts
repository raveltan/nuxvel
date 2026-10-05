import { describe, expect, it } from "vitest";
import { registerEndpoint } from "@nuxt/test-utils/runtime";
import { getRequestHeader } from "h3";
import { useTRPC } from "#imports";

describe("tRPC query options", () => {
  it("derives the same key for identical input", () => {
    const trpc = useTRPC();

    expect(trpc.post.byId.queryOptions({ id: 1 }).key).toEqual(
      trpc.post.byId.queryOptions({ id: 1 }).key,
    );
    expect(trpc.post.byId.queryOptions({ id: 1 }).key).toEqual([
      "trpc",
      "post",
      "byId",
      { id: 1 },
    ]);
  });

  it("derives a different key for different input", () => {
    const trpc = useTRPC();

    expect(trpc.post.byId.queryOptions({ id: 1 }).key).not.toEqual(
      trpc.post.byId.queryOptions({ id: 2 }).key,
    );
  });

  it("nests procedure keys under their namespace key", () => {
    const trpc = useTRPC();

    expect(trpc.post.key()).toEqual(["trpc", "post"]);
    expect(trpc.post.list.key()).toEqual(["trpc", "post", "list"]);
    expect(trpc.post.byId.key()).toEqual(["trpc", "post", "byId"]);
  });

  it("is not a thenable, so awaiting it yields the client itself", async () => {
    const trpc = useTRPC();

    expect(Reflect.get(trpc, "then")).toBeUndefined();
    expect(Reflect.get(trpc.post, "then")).toBeUndefined();
    expect(await Promise.resolve(trpc)).toBe(trpc);
  });

  it("runs the procedure from the query and mutation functions", async () => {
    registerEndpoint("/api/trpc/health.ping", {
      method: "GET",
      handler: () => [{ result: { data: { json: "pong" } } }],
    });
    registerEndpoint("/api/trpc/health.echo", {
      method: "POST",
      handler: () => ({ result: { data: { json: "hello" } } }),
    });
    const trpc = useTRPC();

    expect(await trpc.health.ping.queryOptions().query()).toBe("pong");
    expect(await trpc.health.echo.mutationOptions().mutation("hello")).toBe(
      "hello",
    );
  });

  it("sends one idempotency key with every mutation of one mutationOptions()", async () => {
    const keys: (string | undefined)[] = [];
    registerEndpoint("/api/trpc/health.echo", {
      method: "POST",
      handler: (event) => {
        keys.push(getRequestHeader(event, "idempotency-key"));
        return { result: { data: { json: "hello" } } };
      },
    });
    const trpc = useTRPC();
    const options = trpc.health.echo.mutationOptions();

    await options.mutation("hello");
    await options.mutation("hello");
    await trpc.health.echo.mutationOptions().mutation("hello");

    expect(keys[0]).toMatch(/^[0-9a-f-]{36}$/);
    expect(keys[1]).toBe(keys[0]);
    expect(keys[2]).not.toBe(keys[0]);
  });
});
