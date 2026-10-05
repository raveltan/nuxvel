import { randomUUID } from "node:crypto";
import { expect, guest } from "@nuxvel/nuxt/testing";
import { describe, it } from "vitest";
import { setupPlayground } from "./helpers/playground";

describe("useS3()", async () => {
  await setupPlayground();

  it("round-trips an object through the dev S3 service", async () => {
    const key = `round-trip/${randomUUID()}.txt`;
    const body = `hello ${randomUUID()}`;

    expect(
      await guest().$fetch("/api/_storage-check", { query: { key, body } }),
    ).toEqual({ sameInstance: true, body });
  });
});
