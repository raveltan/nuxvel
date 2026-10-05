import { expect, guest } from "@nuxvel/nuxt/testing";
import { describe, it } from "vitest";
import { setupPlayground } from "./helpers/playground";

describe("defineUserData", async () => {
  await setupPlayground();

  it("exports rows from every declared table, merging two declarations on one table, and erases them, trashed rows included and the context of the entries written with an API key, keeping the audit trail", async () => {
    const body = await guest().$fetch("/api/_user-data-check");

    expect(Object.keys(body.archive).sort()).toEqual(["api_keys", "health_checks", "notifications", "posts", "push_subscriptions", "user"]);
    expect(body.archive.user).toMatchObject([{ id: body.erasedId, name: "Erased" }]);
    expect(body.archive.posts.map((post: { title: string }) => post.title).sort()).toEqual([
      "Erased by key",
      "Erased one",
      "Erased two",
    ]);
    expect(body.archive.health_checks.map((check: { name: string }) => check.name).sort()).toEqual(
      ["Erased check", body.erasedId].sort(),
    );

    expect(body.archive.api_keys).toMatchObject([{ name: "Erased key" }]);
    expect(body.archive.notifications).toMatchObject([{ name: "welcome", data: { title: "Welcome, Erased" } }]);

    expect(body.counts).toEqual({ api_keys: 1, health_checks: 2, notifications: 1, posts: 3, push_subscriptions: 0, user: 1 });
    expect(body.remaining).toEqual([0, 0, 0, 0]);
    expect(body.keptPosts).toBe(2);

    expect(body.authoredAudit).toEqual(["post.created", "post.created"]);
    expect(body.contextBefore).toBe(3);
    expect(body.contextAfter).toBe(0);
    expect(body.subjectsAfter).toBe(0);
    expect(body.auditTrail).toEqual([
      {
        action: "user.erased",
        actorType: "system",
        metadata: { erased: { api_keys: 1, health_checks: 2, notifications: 1, posts: 3, push_subscriptions: 0, user: 1 } },
      },
    ]);
  });
});
