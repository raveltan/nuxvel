import { describe, it } from "vitest";
import {
  actingAs,
  expect,
  expectActionCalled,
  expectBroadcast,
  expectCacheHit,
  expectCacheMiss,
  expectErrorReported,
  expectLogged,
  expectNoErrorReported,
  expectNotBroadcast,
  expectPolicyChecked,
  guest,
  runJob,
} from "@nuxvel/nuxt/testing";
import { postsTable } from "../../../playground/server/database/schema/posts.schema";
import { postFactory } from "../../../playground/server/factories/posts.factory";
import { userFactory } from "../../../playground/server/factories/users.factory";
import { setupPlayground } from "./helpers/playground";

describe("the observed recorders", async () => {
  await setupPlayground();

  it("records the policy decision and the action call of an allowed update", async () => {
    const author = await userFactory();
    const other = await userFactory();
    const post = await postFactory.for("authorId", author)();

    await actingAs(author).trpc.post.update({ id: post.id, title: "New", body: "Text" });

    expect(await expectPolicyChecked("update", postsTable, { allowed: true })).toMatchObject({ actor: `user:${author.id}` });
    expect(await expectActionCalled("posts.update-post", { actingAs: author })).toMatchObject({ ok: true });
    await expect(expectActionCalled("posts.update-post", { actingAs: other })).rejects.toThrow("found 0");
  });

  it("records a refused decision", async () => {
    const author = await userFactory();
    const other = await userFactory();
    const post = await postFactory.for("authorId", author)();

    await expect(actingAs(other).trpc.post.update({ id: post.id, title: "New", body: "Text" })).rejects.toBeTrpcError("FORBIDDEN");

    await expectPolicyChecked("update", postsTable, { allowed: false });
    await expect(expectPolicyChecked("update", postsTable, { allowed: true })).rejects.toThrow("found 0");
  });

  it("finds nothing when no procedure asked the policy", async () => {
    await guest().trpc.post.list();

    await expect(expectPolicyChecked("update", postsTable)).rejects.toThrow("found 0");
  });

  it("records an unexpected error of a test caller and only that", async () => {
    await expectNoErrorReported();

    await expect(guest().trpc.health.explode()).rejects.toThrow();

    expect(await expectErrorReported("procedure exploded")).toMatchObject({ name: "Error" });
    await expect(expectNoErrorReported()).rejects.toThrow("procedure exploded");
  });

  it("records the log lines at or above the log level", async () => {
    await guest().$fetch("/api/_logger-check");

    await expectLogged("warn", "logger-check warn");
    await expectLogged("error", /logger-check error/);
    await expect(expectLogged("error", "logger-check warn")).rejects.toThrow("found 0");
  });

  it("records a broadcast with its parsed payload", async () => {
    await runJob("_probe.broadcast", { title: "Hi" });

    expect(await expectBroadcast("_probe-public", "from-job", { title: "Hi" })).toMatchObject({ payload: { title: "Hi" } });
    await expectNotBroadcast("_probe-public", "other");
    await expect(expectNotBroadcast("_probe-public")).rejects.toThrow("expected no broadcast on _probe-public, found 1");
  });

  it("matches a broadcast by its room", async () => {
    await guest().$fetch("/api/_room-broadcast-check", { method: "POST", body: { card: 1, boardId: 1 } });
    await guest().$fetch("/api/_room-broadcast-check", { method: "POST", body: { card: 2 } });

    expect(await expectBroadcast("_probe-board", "moved", { card: 1 }, { params: { boardId: 1 } })).toMatchObject({
      params: { boardId: 1 },
    });
    await expectBroadcast("_probe-board", "moved", { card: 2 });
    await expect(expectBroadcast("_probe-board", "moved", { card: 1 }, { params: { boardId: 2 } })).rejects.toThrow("found 0");
    await expect(expectBroadcast("_probe-board", "moved", { card: 2 }, { params: { boardId: 1 } })).rejects.toThrow("found 0");
    await expectNotBroadcast("_probe-board", "moved", { params: { boardId: 2 } });
    await expect(expectNotBroadcast("_probe-board", "moved", { params: { boardId: 1 } })).rejects.toThrow("found 1");
  });

  it("records cache misses and hits by key", async () => {
    const key = `posts:list:${JSON.stringify([undefined, undefined, undefined])}`;
    const author = await userFactory();

    await guest().trpc.post.list();
    await guest().trpc.post.list();

    await expectCacheMiss(key, { times: 1 });
    await expectCacheHit(key, { times: 1 });

    await actingAs(author).trpc.post.create({ title: "Hello", body: "Text" });
    await guest().trpc.post.list();

    await expectCacheMiss(key, { times: 2 });
    await expect(expectCacheHit("posts:never-read")).rejects.toThrow("found 0");
  });
});
