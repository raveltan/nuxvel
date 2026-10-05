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

  it("rejects a changed query, a missing signature and an expired link with HTTP 403", () => {
    expect(probe()).toMatchObject({
      tampered: "403 Invalid signature",
      unsigned: "403 Invalid signature",
      expired: "403 This link expired",
    });
  });

  it("checks a path string, and throws FORBIDDEN so a tRPC procedure answers 403", () => {
    expect(probe().path).toMatchObject({ valid: "valid", tampered: "FORBIDDEN Invalid signature", expired: "FORBIDDEN This link expired" });
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

  it("signs a path in the app for a test, and the link expires on the app's clock", async () => {
    const link = await signedUrl("/api/_signed-url-target?invite=42", { expiresIn: 60 });

    expect(await guest().$fetch(link)).toMatchObject({ invite: "42" });

    await travelBy({ minutes: 2 });
    const expired = await guest().fetch(link);

    expect(expired.status).toBe(403);
  });
});
