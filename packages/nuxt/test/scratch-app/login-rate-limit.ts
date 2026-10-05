import { existsSync } from "node:fs";
import { join } from "node:path";
import { useTestContext } from "@nuxt/test-utils/e2e";
import { expect, guest } from "@nuxvel/nuxt/testing";
import { describe, it } from "vitest";

function post(path: string, body: Record<string, unknown>) {
  return guest().fetch(path, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("sign-in in an app with no server/rate-limits/login.ts", () => {
  it("is limited by the built-in login limit of 5 per minute", async () => {
    expect(existsSync(join(useTestContext().options.rootDir, "server/rate-limits"))).toBe(false);

    const email = "default-limited@example.com";
    await post("/api/auth/sign-up/email", { name: "Test User", email, password: "correct-horse-battery-staple" });

    const statuses: number[] = [];
    for (let i = 0; i < 6; i++) {
      const response = await post("/api/auth/sign-in/email", { email, password: "wrong-password-entirely" });
      statuses.push(response.status);
    }

    expect(statuses).toEqual([401, 401, 401, 401, 401, 429]);
  });
});
