import { expect, guest } from "@nuxvel/nuxt/testing";
import { describe, it } from "vitest";
import { setupPlayground } from "./helpers/playground";

describe("#nuxvel/schema discovery", async () => {
  await setupPlayground();

  it("re-exports tables found under server/database/schema", async () => {
    const body = await guest().$fetch("/api/_schema-check");
    expect(body.keys).toContain("healthChecksTable");
  });
});
