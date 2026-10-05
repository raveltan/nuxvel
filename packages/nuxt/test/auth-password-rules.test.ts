import { createHash } from "node:crypto";
import { describe, it } from "vitest";
import { expect, expectFetched, fakeFetch } from "@nuxvel/nuxt/testing";
import { postJson } from "./helpers/auth-flows";
import { setupPlayground } from "./helpers/playground";

const BREACHED = "password1234";

function hibpRange(password: string) {
  const hash = createHash("sha1").update(password).digest("hex").toUpperCase();

  return { url: `https://api.pwnedpasswords.com/range/${hash.slice(0, 5)}`, suffix: hash.slice(5) };
}

describe("password rules", async () => {
  await setupPlayground({ env: { NUXT_AUTH_CHECK_BREACHED_PASSWORDS: "true" } });

  it("refuses a password shorter than 12 characters", async () => {
    const response = await postJson("/api/auth/sign-up/email", { name: "Ada", email: "short@example.com", password: "elevenchars" });

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ code: "PASSWORD_TOO_SHORT" });
  });

  it("refuses a password that the breach corpus lists and accepts one it does not", async () => {
    const { url, suffix } = hibpRange(BREACHED);

    await fakeFetch({ [url]: { body: `0018A45C4D1DEF81644B54AB7F969B88D65:1\r\n${suffix}:52256179\r\n` } });

    const breached = await postJson("/api/auth/sign-up/email", { name: "Ada", email: "breached@example.com", password: BREACHED });

    expect(breached.status).toBe(400);
    expect(await breached.json()).toMatchObject({ code: "PASSWORD_COMPROMISED" });
    await expectFetched(url, { times: 1 });

    const safe = hibpRange("a-long-unlisted-passphrase");

    await fakeFetch({ [safe.url]: { body: "0018A45C4D1DEF81644B54AB7F969B88D65:1\r\n" } });

    const accepted = await postJson("/api/auth/sign-up/email", {
      name: "Ada",
      email: "safe@example.com",
      password: "a-long-unlisted-passphrase",
    });

    expect(accepted.status).toBe(200);
  });
});
