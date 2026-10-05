import { expect, guest } from "@nuxvel/nuxt/testing";
import { describe, it } from "vitest";
import { url } from "@nuxt/test-utils/e2e";
import { userFactory } from "../../../playground/server/factories/users.factory";
import { postJson, sessionCookie } from "./helpers/auth-flows";
import { setupPlayground } from "./helpers/playground";

const PASSWORD = "correct-horse-battery-staple";

type Exposure = { name: string; unitId: string; variant: string };

async function expose(name: string, cookie: string) {
  const response = await guest().fetch("/api/flags/exposures", {
    method: "POST",
    headers: { "content-type": "application/json", origin: new URL(url("/")).origin, cookie },
    body: JSON.stringify({ name }),
  });

  expect(response.status).toBe(200);
}

describe("experiments.requireConsent", async () => {
  await setupPlayground({ env: { NUXT_NUXVEL_EXPERIMENTS_REQUIRE_CONSENT: "true" } });

  it("gives a visitor without consent the control and records no exposure", async () => {
    const user = await userFactory.withPassword(PASSWORD)({ email: "flag-consent-none@example.com" });
    const cookie = sessionCookie(await postJson("/api/auth/sign-in/email", { email: user.email, password: PASSWORD })) ?? "";

    await guest().$fetch("/api/_experiment-check", { method: "POST", body: { running: true } });

    const values = await guest().$fetch<{ experiments: Record<string, string> }>("/api/flags", { headers: { cookie } });
    await expose("probe-cta", cookie);
    const exposures = await guest().$fetch<Exposure[]>("/api/_flag-exposures-check", { query: { subject: "server-user" } });

    expect(values.experiments["probe-cta"]).toBe("control");
    expect(exposures).toEqual([{ name: "probe-rollout", unitId: "server-user", variant: "false" }]);
  });

  it("enrolls a visitor with the consent cookie", async () => {
    const user = await userFactory.withPassword(PASSWORD)({ email: "flag-consent-granted@example.com" });
    const cookie = sessionCookie(await postJson("/api/auth/sign-in/email", { email: user.email, password: PASSWORD })) ?? "";

    await guest().$fetch("/api/_experiment-check", { method: "POST", body: { running: true } });
    await expose("probe-cta", `${cookie}; nuxvel-consent=granted`);

    expect(await guest().$fetch<Exposure[]>("/api/_flag-exposures-check")).toEqual([
      { name: "probe-cta", unitId: user.id, variant: expect.stringMatching(/^(control|green)$/) },
    ]);
  });
});
