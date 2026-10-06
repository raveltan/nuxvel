import { describe, it } from "vitest";
import { actingAs, expect, guest } from "@nuxvel/nuxt/testing";
import { healthCheckFactory } from "../../../playground/server/factories/health-checks.factory";
import { userFactory } from "../../../playground/server/factories/users.factory";
import { setupPlayground } from "./helpers/playground";

describe("the procedure option of defineAction", async () => {
  await setupPlayground();

  it("mounts the action at its path with the named procedure", async () => {
    const owner = await userFactory();
    const row = await healthCheckFactory({ userId: owner.id });

    await expect(actingAs(owner).trpc.healthChecks.updateHealthCheck({ id: row.id, name: "after" })).resolves.toMatchObject({ name: "after" });
    await expect(guest().trpc.healthChecks.updateHealthCheck({ id: row.id, name: "guest" })).rejects.toBeTrpcError("UNAUTHORIZED");
    await expect(guest().trpc._probes.whoami()).resolves.toEqual({ type: "guest", id: "guest" });
  });

  it("sends only the fields of the output schema of the action", async () => {
    await expect(guest().trpc._probes.secretRow()).resolves.toEqual({ id: 1 });
  });

  it("mounts the action with a procedure builder value", async () => {
    await expect(actingAs(await userFactory({ role: "editor" })).trpc._probes.editorsOnly()).resolves.toBe("edited");
    await expect(actingAs(await userFactory()).trpc._probes.editorsOnly()).rejects.toBeTrpcError("FORBIDDEN");
  });
});
