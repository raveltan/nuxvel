import { actingAs, expect, guest } from "@nuxvel/nuxt/testing";
import { describe, it } from "vitest";
import { userFactory } from "../../../playground/server/factories/users.factory";
import { setupPlayground } from "./helpers/playground";

async function link(id: number) {
  const { searchParams } = new URL(await guest().api._signedCheck.sign({ id }), "http://x");

  return { id, expires: String(searchParams.get("expires")), signature: String(searchParams.get("signature")), note: "hi" };
}

describe("signedProcedure()", async () => {
  await setupPlayground();

  it("runs a call with a valid link as the system actor, for a guest and a signed-in user", async () => {
    const actor = { type: "system", id: "probe-link" };
    const expected = { actor, user: null, ambient: actor, note: "hi" };

    await expect(guest().api._signedCheck.open(await link(4))).resolves.toEqual(expected);
    await expect(actingAs(await userFactory()).api._signedCheck.open(await link(4))).resolves.toEqual(expected);
  });

  it("refuses a link for another path or with a changed signature", async () => {
    const valid = await link(4);

    await expect(guest().api._signedCheck.open({ ...valid, id: 5 })).rejects.toBeTrpcError("FORBIDDEN");
    await expect(guest().api._signedCheck.open({ ...valid, signature: "0".repeat(64) })).rejects.toBeTrpcError("FORBIDDEN");
  });

  it("refuses a string path field with dot segments", async () => {
    const { expires, signature } = await link(4);

    await expect(guest().api._signedCheck.openText({ expires, signature, id: "4" })).resolves.toBe("4");
    await expect(guest().api._signedCheck.openText({ expires, signature, id: "6/../4" })).rejects.toBeTrpcError("FORBIDDEN");
  });
});
