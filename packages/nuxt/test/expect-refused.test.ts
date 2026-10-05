import { describe, it } from "vitest";
import { actingAs, expect, expectRefused, guest } from "@nuxvel/nuxt/testing";
import { userFactory } from "../../../playground/server/factories/users.factory";
import { setupPlayground } from "./helpers/playground";

describe("expectRefused()", async () => {
  await setupPlayground();

  it("passes when every procedure of a router refuses the caller with the code", async () => {
    await expectRefused(guest().trpc.account, "UNAUTHORIZED");
    await expectRefused(actingAs(await userFactory()).trpc.account.signUps, "FORBIDDEN");
  });

  it("names each procedure that lets the caller through or refuses with another code", async () => {
    const { trpc } = actingAs(await userFactory());

    await expect(expectRefused(trpc.account, "FORBIDDEN")).rejects.toThrow(
      "expectRefused: not every procedure refused with FORBIDDEN:\n  account.posts answered",
    );
    await expect(expectRefused(trpc.account, "UNAUTHORIZED")).rejects.toThrow(
      "  account.signUps refused with FORBIDDEN",
    );
  });

  it("fails when no procedure is at the path", async () => {
    // @ts-expect-error the path is missing from the router on purpose
    await expect(expectRefused(guest().trpc.account.missing, "UNAUTHORIZED")).rejects.toThrow(
      'expectRefused: no tRPC procedure at "account.missing"',
    );
  });
});
