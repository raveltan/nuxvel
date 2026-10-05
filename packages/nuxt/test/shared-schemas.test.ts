import { expect, guest } from "@nuxvel/nuxt/testing";
import { describe, it } from "vitest";
import { setupPlayground } from "./helpers/playground";

describe("shared/schemas/ auto-import", async () => {
  await setupPlayground();

  it("is usable from a server route with no explicit import", async () => {
    const body = await guest().$fetch("/api/_shared-schema-check");

    expect(body.validSucceeded).toBe(true);
    expect(Object.keys(body.invalidError.fields)).toEqual(
      expect.arrayContaining(["id"]),
    );
  });
});
