import { envHint } from "@nuxvel/nuxt/env";
import { describe, expect, guest, it } from "@nuxvel/nuxt/testing";
import { setupPlayground } from "./helpers/playground";

describe("useSecrets", async () => {
  await setupPlayground();

  it("throws for an unset secret and keeps verifying a rotated secret's previous value until the grace period ends", async () => {
    const body = await guest().$fetch("/api/_secret-rotate-check");

    expect(body).toEqual({
      whenUnset: `NUXT_PROBE_SIGNING_SECRET is not set. ${envHint("NUXT_PROBE_SIGNING_SECRET")}`,
      freshSignedWithNewSecret: true,
      oldDuringGrace: true,
      freshDuringGrace: true,
      oldAfterGrace: false,
      freshAfterGrace: true,
    });
  });
});
