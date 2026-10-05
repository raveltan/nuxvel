import { expect } from "@nuxvel/nuxt/testing";
import { describe, it } from "vitest";
import { setupPlayground } from "./helpers/playground";
import { runProbeOnce } from "./helpers/probe";

describe("authedProcedure", async () => {
  await setupPlayground();
  const probe = runProbeOnce("/api/_authed-procedure-check");

  it("passes on publicProcedure and throws UNAUTHORIZED on authedProcedure when signed out", async () => {
    const body = probe();

    expect(body).toMatchObject({
      publicResult: "public-pong",
      authedErrorCode: "UNAUTHORIZED",
    });
  });

  it("gives an authed procedure the user as ctx.actor, role included", async () => {
    const body = probe();

    expect(body.actor).toEqual({ type: "user", id: body.adminId, role: "admin" });
  });

  it("gives a public procedure the signed-in user, and null when signed out", async () => {
    const body = probe();

    expect(body.publicCallerWhenSignedIn).toEqual({
      userId: body.adminId,
      actor: { type: "user", id: body.adminId, role: "admin" },
    });
    expect(body.publicCallerWhenSignedOut).toEqual({ userId: null, actor: null });
  });
});
