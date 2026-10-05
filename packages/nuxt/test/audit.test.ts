import { expect, guest } from "@nuxvel/nuxt/testing";
import { describe, it } from "vitest";
import { setupPlayground } from "./helpers/playground";
import { runProbeOnce } from "./helpers/probe";

describe("audit()", async () => {
  await setupPlayground();
  const probe = runProbeOnce("/api/_audit-check");

  it("writes no row when the enclosing transaction rolls back", async () => {
    const body = probe();
    expect(body.rolledBackRowAdded).toBe(false);
  });

  it("writes a row with the correct actor/action/target when committed", async () => {
    const body = probe();
    expect(body.committedRowAdded).toBe(true);
    expect(body.committedRow).toMatchObject({
      actorType: "system",
      actorId: "_audit-check",
      action: "post.updated",
      targetType: "post",
      targetId: "2",
    });
  });

  it("takes the target type from the target when one is given", async () => {
    const body = probe();
    expect(body.typedRow).toMatchObject({
      action: "moderation.hidden",
      targetType: "posts",
      targetId: "3",
    });
  });

  it("records that a personal column changed, without its values", async () => {
    const body = await guest().$fetch("/api/_audit-personal-check");

    expect(body.changes).toEqual({ email: { changed: true }, role: { from: "user", to: "admin" } });
  });

  it("stores a user actor and a user target as a subject ID, and the request context outside the row", async () => {
    const body = await guest().$fetch("/api/_audit-subjects-check", { headers: { "user-agent": "audit-subjects-probe" } });
    const [subject] = body.subjects;

    expect(JSON.stringify(body.entry)).not.toContain(body.userId);
    expect(subject).toEqual({ id: expect.any(String), userId: body.userId, displayName: "Ada Audited", mac: expect.any(String) });
    expect(body.entry).toMatchObject({ actorType: "user", actorId: subject.id, targetType: "user", targetId: subject.id });
    expect(body.context).toEqual([{ entryId: body.entry.id, ip: expect.any(String), userAgent: "audit-subjects-probe", mac: expect.any(String) }]);
  });
});
