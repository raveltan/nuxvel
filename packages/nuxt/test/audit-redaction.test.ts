import { expect, guest } from "@nuxvel/nuxt/testing";
import { describe, it } from "vitest";
import { setupPlayground } from "./helpers/playground";

describe("audit() redaction", async () => {
  await setupPlayground();

  it("strips denylisted keys from changes while keeping other fields", async () => {
    const body = await guest().$fetch("/api/_audit-redaction-check");
    expect(body.row.changes).not.toHaveProperty("password");
    expect(body.row.changes).toMatchObject({ role: "admin" });
  });
});
