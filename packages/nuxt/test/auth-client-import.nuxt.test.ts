import { describe, expect, it } from "vitest";
import { authClient } from "@nuxvel/nuxt/app/auth";
import { authClient as moduleAuthClient } from "../src/runtime/app/auth/client";

describe("authClient", () => {
  it("is imported from the auth topic, not auto-imported", async () => {
    expect(authClient).toBe(moduleAuthClient);
    expect(await import("#imports")).not.toHaveProperty("authClient");
  });
});
