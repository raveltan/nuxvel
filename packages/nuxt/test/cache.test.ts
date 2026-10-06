import { Redis } from "ioredis";
import { afterAll, describe, it } from "vitest";
import { recordedEffects } from "../src/testing/recorded";
import { actingAs, expect, expectCacheHit, expectCached, expectConstantQueries, guest, text, visit } from "@nuxvel/nuxt/testing";
import { postFactory } from "../../../playground/server/factories/posts.factory";
import { userFactory } from "../../../playground/server/factories/users.factory";
import { setupPlayground } from "./helpers/playground";
import { workerRedisUrl } from "./setup/redis";

function scenario(name: string) {
  return guest().$fetch<Record<string, unknown>>("/api/_cache-check", { query: { scenario: name } });
}

describe("the server cache", async () => {
  await setupPlayground({ browser: true });

  const redis = new Redis(workerRedisUrl());

  afterAll(() => redis.quit());

  it("sees no cache lookup from the server's start-up", async () => {
    expect((await recordedEffects()).cacheLookups).toEqual([]);
  });

  it("computes a missing value once, then serves it, and recomputes after cacheForget", async () => {
    expect(await scenario("remembered")).toEqual({
      first: { at: "2026-09-25T10:00:00.000Z", calls: 1 },
      second: { at: "2026-09-25T10:00:00.000Z", calls: 1 },
      callsBeforeForget: 1,
      afterForget: { at: "2026-09-25T10:00:00.000Z", calls: 2 },
      secondIsDate: true,
    });
  });

  it("namespaces its keys and forgets a value when its ttl runs out", async () => {
    expect(await scenario("expiring")).toEqual({ stored: "soon" });

    const [key] = await redis.keys("*probe:expiring");

    expect(key).toMatch(/^nuxvel:test\d+:cache:probe:expiring$/);
    expect(await redis.ttl(key ?? "")).toBeGreaterThan(55);

    await redis.pexpire(key ?? "", 20);
    await expect.poll(() => redis.ttl(key ?? "")).toBe(-2);

    expect(await guest().$fetch("/api/_cache-check", { query: { key: "probe:expiring" } })).toEqual({ value: null });
  });

  it("forgets every value stored with a tag, and nothing else", async () => {
    expect(await scenario("tagged")).toEqual({ a: null, b: null, untagged: "c" });
  });

  it("forgets every key that matches a glob", async () => {
    expect(await scenario("globbed")).toEqual({ first: null, second: null, other: 3 });
  });

  it("takes a key array: parts joined with colons, objects with sorted keys, forgotten as a prefix", async () => {
    expect(await scenario("arrays")).toEqual({
      sortedObjectKeys: "stored",
      asString: "stored",
      remembered: "computed",
      rememberedAsString: "computed",
      forgotten: [null, null, null, null],
      kept: [4, 6],
    });

    await expectCacheHit(["probe", "array", { page: 1, q: "a" }], { times: 2 });
    expect(await expectCached(["probe", "prefixed"])).toBe(4);
  });

  it("serves a second read of a remembered procedure without a query, until an action invalidates it", async () => {
    const listQueries = () => expectConstantQueries(() => guest().trpc.post.list({ page: 1 }), [1]);

    const uncached = await listQueries();

    expect(uncached).toBeGreaterThan(0);
    expect(await listQueries()).toBe(0);

    const post = await actingAs(await userFactory()).trpc.post.create({ title: "Cached", body: "Body" });

    expect(await listQueries()).toBe(uncached);
    expect((await guest().trpc.post.list()).rows.map(({ id }) => id)).toContain(post.id);
  });

  it("runs a locked function once at a time and releases only its own lock", async () => {
    expect(await scenario("locked")).toEqual({
      whileHeld: "conflict",
      afterRelease: "ran",
      afterThrow: "ran",
      otherLock: "other caller",
    });
  });

  it("forgets what the test server cached when a test ends", async () => {
    await scenario("expiring");

    await guest().$fetch("/_nuxvel/test/reset", { method: "POST" });

    expect(await guest().$fetch("/api/_cache-check", { query: { key: "probe:expiring" } })).toEqual({ value: null });
  });

  it("caches a page with the cached preset", async () => {
    await postFactory({ title: "First" });

    const page = await visit("/_cached-posts");

    await expect(text(page, "posts:First")).toBeVisible();
  });

  it("renders the cached page fresh in the next test", async () => {
    await postFactory({ title: "Second" });

    const page = await visit("/_cached-posts");

    await expect(text(page, "posts:Second")).toBeVisible();
  });

  it("stores a miss inside a transaction only once it commits", async () => {
    expect(await scenario("transactional")).toEqual({ rolledBack: null, beforeCommit: null, committed: "kept" });
  });

  it("asserts that the app cached a key and returns its value", async () => {
    const key = "posts:list:[null,null,null]";

    await expect(expectCached(key)).rejects.toThrow(key);

    await guest().trpc.post.list();

    expect(await expectCached<{ rows: unknown[] }>(key)).toHaveProperty("rows", expect.any(Array));
  });
});
