import { expect, guest } from "@nuxvel/nuxt/testing";
import { describe, it } from "vitest";
import { setupPlayground } from "./helpers/playground";

function post(path: string, body: Record<string, unknown>) {
  return guest().fetch(path, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("auth rate limiting", async () => {
  await setupPlayground();

  it("rejects sign-ins past the login limit, which server/rate-limits/login.rate-limit.ts sets, with a 429 and a retry delay", async () => {
    const email = "rate-limited@example.com";

    await post("/api/auth/sign-up/email", {
      name: "Test User",
      email,
      password: "correct-horse-battery-staple",
    });

    const statuses: number[] = [];
    let retryAfter: string | null = null;

    for (let i = 0; i < 5; i++) {
      const response = await post("/api/auth/sign-in/email", {
        email,
        password: "wrong-password-entirely",
      });

      statuses.push(response.status);
      retryAfter = response.headers.get("x-retry-after");
    }

    expect(statuses).toEqual([401, 401, 401, 401, 429]);
    expect(Number(retryAfter)).toBeGreaterThan(0);
  });

  it("spends one login budget per IP between sign-ins and rateLimiter(\"login\")", async () => {
    const email = "shared-login@example.com";

    await post("/api/auth/sign-up/email", { name: "Test User", email, password: "correct-horse-battery-staple" });

    const consumed: number[] = [];
    for (let i = 0; i < 3; i++) consumed.push((await guest().fetch("/api/_rate-limit-login")).status);

    const signIns: number[] = [];
    for (let i = 0; i < 2; i++) {
      signIns.push((await post("/api/auth/sign-in/email", { email, password: "wrong-password-entirely" })).status);
    }

    const afterSignIns = await guest().fetch("/api/_rate-limit-login");

    expect(consumed).toEqual([200, 200, 200]);
    expect(signIns).toEqual([401, 429]);
    expect(afterSignIns.status).toBe(429);
  });

  it("gives the next test a fresh login budget, so a rerun of the app's tests is not rate limited", async () => {
    const statuses: number[] = [];
    for (let i = 0; i < 5; i++) statuses.push((await guest().fetch("/api/_rate-limit-login")).status);

    await guest().fetch("/_nuxvel/test/reset", { method: "POST" });

    expect(statuses.at(-1)).toBe(429);
    expect((await guest().fetch("/api/_rate-limit-login")).status).toBe(200);
  });

  it("limits password-reset requests too", async () => {
    const statuses: number[] = [];

    for (let i = 0; i < 4; i++) {
      const response = await post("/api/auth/request-password-reset", {
        email: "reset-limited@example.com",
      });

      statuses.push(response.status);
    }

    expect(statuses.slice(0, 3)).not.toContain(429);
    expect(statuses[3]).toBe(429);
  });
});
