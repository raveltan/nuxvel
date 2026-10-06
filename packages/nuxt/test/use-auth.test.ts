import { describe, it } from "vitest";
import { expect, signIn } from "@nuxvel/nuxt/testing";
import { userFactory } from "../../../playground/server/factories/users.factory";
import { setupPlayground } from "./helpers/playground";
import { runProbeOnce } from "./helpers/probe";

const PASSWORD = "correct-horse-battery-staple";

describe("useAuth", async () => {
  await setupPlayground();
  const probe = runProbeOnce("/api/_use-auth-check");

  it("is null in a plain handler for a signed-out request", () => {
    expect(probe().handler).toEqual({ userId: null, actor: null });
  });

  it("gives a plain handler the session user", async () => {
    const user = await userFactory.withPassword(PASSWORD)({ email: "use-auth-handler@example.com", name: "Use Auth Handler" });
    const body = await (await signIn(user.email, PASSWORD)).$fetch("/api/_use-auth-check");

    expect(body.handler.actor).toMatchObject({ type: "user", role: "user" });
    expect(body.handler.userId).toBe(body.handler.actor.id);
  });

  it("gives an action its actor, and the user behind a user actor", () => {
    const body = probe();

    expect(body.systemAction).toEqual({ userId: null, actor: { type: "system", id: "_use-auth-check" } });
    expect(body.userAction).toEqual({ userId: body.userId, actor: { type: "user", id: body.userId, role: "user", userId: body.userId } });
  });

  it("gives public and authed procedures the caller, and passes it to an action called without ctx", () => {
    const body = probe();
    const caller = { userId: body.userId, actor: { type: "user", id: body.userId, role: "user", userId: body.userId } };

    expect(body.publicSignedOut).toEqual({ userId: null, actor: null });
    expect(body.publicSignedIn).toEqual(caller);
    expect(body.authed).toEqual(caller);
    expect(body.actionFromProcedure).toEqual(caller);
  });
});
