import { expect, guest } from "@nuxvel/nuxt/testing";
import { describe, it } from "vitest";
import { setupPlayground } from "./helpers/playground";

describe("defineProduct()", async () => {
  await setupPlayground();

  it("names each product after its file under server/products/ and finds it by that name", async () => {
    expect(await guest().$fetch("/api/_billing-products-check")).toEqual({
      pro: { name: "_pro", lookupKey: "pro_monthly", mode: "subscription" },
      course: "payment",
      missing: null,
    });
  });
});
