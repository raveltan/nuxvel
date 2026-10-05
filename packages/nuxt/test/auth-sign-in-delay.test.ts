import { describe, it } from "vitest";
import { expect, travelBy } from "@nuxvel/nuxt/testing";
import { postJson } from "./helpers/auth-flows";
import { setupPlayground } from "./helpers/playground";

const PASSWORD = "correct-horse-battery-staple";

async function timedSignIn(email: string, password: string) {
  const startedAt = performance.now();
  const response = await postJson("/api/auth/sign-in/email", { email, password });

  return { status: response.status, ms: performance.now() - startedAt };
}

describe("sign-in delays", async () => {
  await setupPlayground();

  it("makes each attempt after 5 failures on one account wait longer, without a lockout", async () => {
    const email = "guessed@example.com";

    await postJson("/api/auth/sign-up/email", { name: "Ada", email, password: PASSWORD });

    for (let attempt = 0; attempt < 4; attempt++) {
      expect((await timedSignIn(email, "a-wrong-password")).status).toBe(401);
    }

    await travelBy({ minutes: 1 });

    const fifth = await timedSignIn(email, "a-wrong-password");
    const sixth = await timedSignIn(email, "a-wrong-password");

    expect([fifth.status, sixth.status]).toEqual([401, 401]);
    expect(sixth.ms - fifth.ms).toBeGreaterThanOrEqual(900);

    const correct = await timedSignIn(email, PASSWORD);

    expect(correct.status).toBe(200);
    expect(correct.ms).toBeGreaterThanOrEqual(1900);
  });
});
