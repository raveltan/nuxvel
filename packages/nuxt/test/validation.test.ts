import { expect, guest } from "@nuxvel/nuxt/testing";
import { describe, it } from "vitest";
import { setupPlayground } from "./helpers/playground";

describe("toValidationError", async () => {
  await setupPlayground();

  it("produces a fields key for each invalid field", async () => {
    const body = await guest().$fetch("/api/_validation-check");

    expect(Object.keys(body.fields)).toEqual(
      expect.arrayContaining(["name", "age"]),
    );
  });
});
