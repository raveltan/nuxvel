import { describe, expect, it } from "vitest";
import { authClient } from "#imports";
import { authClient as moduleAuthClient } from "../src/runtime/app/auth/client";

describe("authClient", () => {
  it("is auto-imported", () => {
    expect(authClient).toBe(moduleAuthClient);
  });
});
