import { expect, visit } from "@nuxvel/nuxt/testing";
import { describe, it } from "vitest";

describe("useUser() on a page without the auth middleware", () => {
  it("hydrates the ids of the fields under it without a mismatch", async () => {
    const page = await visit("/_user-form");
    const mismatches = (await page.consoleMessages()).flatMap((message) => (message.text().includes("Hydration") ? [message.text()] : []));

    expect(mismatches).toEqual([]);
  }, 60_000);
});
