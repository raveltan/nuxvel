import { expect, guest } from "@nuxvel/nuxt/testing";
import { describe, it } from "vitest";
import { setupPlayground } from "./helpers/playground";
import { runProbeOnce } from "./helpers/probe";

describe("Postgres unique-violation mapping", async () => {
  await setupPlayground();
  const probe = runProbeOnce("/api/_unique-violation-check");

  it("surfaces a 23505 from an action or a procedure as ConflictError naming the column", () => {
    expect(probe()).toMatchObject({
      fromAction: "email",
      fromNestedTransaction: "email",
      fromProcedure: "email",
    });
  });

  it("leaves query builders untouched, so an insert inside $with works", () => {
    expect(probe().insertedInWith).toEqual([{ name: "With" }]);
  });

  it("answers a violation in a server route 409 with the field", async () => {
    const response = await guest().fetch("/api/_unique-violation-route", { method: "POST" });

    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({
      message: "A row with this value already exists",
      data: { fields: { email: ["A row with this value already exists"] } },
    });
  });
});
