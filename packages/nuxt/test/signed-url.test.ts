import { describe, it } from "vitest";
import { expect, guest, signedUrl, travelBy } from "@nuxvel/nuxt/testing";
import { setupPlayground } from "./helpers/playground";
import { runProbeOnce } from "./helpers/probe";

describe("signedUrl and requireSignature", async () => {
  await setupPlayground();
  const probe = runProbeOnce("/api/_signed-url-check");

  it("accepts an unexpired signed URL and returns the route's answer", () => {
    expect(probe().valid).toEqual({ invite: "42", expires: expect.any(String), signature: expect.any(String) });
  });

  it("rejects a changed query and a missing signature with HTTP 403", () => {
    expect(probe()).toMatchObject({
      tampered: "403 Invalid signature",
      unsigned: "403 Invalid signature",
    });
  });

  it("checks a path string, and throws FORBIDDEN so a tRPC procedure answers 403", () => {
    expect(probe().path).toMatchObject({ valid: "valid", tampered: "FORBIDDEN Invalid signature" });
  });

  it("refuses a path that the URL parser changes: dot segments, %2e%2e and a backslash", () => {
    expect(probe().path).toMatchObject({
      valid: "valid",
      dotSegments: "FORBIDDEN Invalid signature",
      encodedDots: "FORBIDDEN Invalid signature",
      backslash: "FORBIDDEN Invalid signature",
    });
  });

  it("accepts a link signed with the previous secret only during the rotation grace period", () => {
    expect(probe().rotatedDuringGrace).toMatchObject({ invite: "42" });
    expect(probe().rotatedAfterGrace).toBe("403 Invalid signature");
  });

  it("signs a path for its expiresIn duration, and the link expires on the app's clock, for a route and for a procedure that checks its path", async () => {
    const link = await signedUrl("/api/_signed-url-target?invite=42", { expiresIn: { minutes: 1 } });
    const { searchParams } = new URL(await guest().api._signedCheck.sign({ id: 4 }), "http://x");
    const procedureLink = { id: 4, expires: String(searchParams.get("expires")), signature: String(searchParams.get("signature")), note: "hi" };

    expect(await guest().$fetch(link)).toMatchObject({ invite: "42" });
    await expect(guest().api._signedCheck.open(procedureLink)).resolves.toMatchObject({ note: "hi" });

    await travelBy({ seconds: 50 });
    expect((await guest().fetch(link)).status).toBe(200);

    await travelBy({ seconds: 20 });
    const expired = await guest().fetch(link);

    expect(expired.status).toBe(403);
    expect(await expired.json()).toMatchObject({ data: { code: "FORBIDDEN", message: "This link expired" } });
    await expect(guest().api._signedCheck.open(procedureLink)).rejects.toBeTrpcError("FORBIDDEN");
  });
});
