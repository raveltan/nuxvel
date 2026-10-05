import { expect, guest } from "@nuxvel/nuxt/testing";
import { describe, it } from "vitest";
import { setupPlayground } from "./helpers/playground";

describe("definePolicy auto-discovery", async () => {
  await setupPlayground();

  it("discovers the health-check policy and evaluates its rule against two users", async () => {
    const body = await guest().$fetch("/api/_policy-check");

    expect(body).toMatchObject({
      tableName: "health_checks",
      ownerAllowed: true,
      otherAllowed: false,
    });
  });

  it("refuses two policies for the same table", async () => {
    const body = await guest().$fetch("/api/_policy-duplicate-check");

    expect(body.threw).toContain('more than one policy is defined for table "posts"');
  });
});
