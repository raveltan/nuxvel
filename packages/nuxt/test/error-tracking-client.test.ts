import { expect } from "@nuxvel/nuxt/testing";
import { afterAll, describe, it } from "vitest";
import { createPage, url } from "@nuxt/test-utils/e2e";
import { startFakeSentry } from "@nuxvel/test-helpers/fake-sentry";
import { setupPlayground } from "./helpers/playground";

const sentry = await startFakeSentry();

describe("browser error tracking", async () => {
  await setupPlayground({
    browser: true,
    env: { NUXT_PUBLIC_SENTRY_DSN: sentry.dsn },
  });

  afterAll(async () => {
    await sentry.close();
  });

  it("captures an error thrown in a page's click handler", async () => {
    const page = await createPage();

    await page.goto(url("/_error-tracking"), { waitUntil: "hydration" });
    await page.getByRole("button", { name: "Explode" }).click();

    const event = await sentry.waitForEvent(
      (candidate) =>
        candidate.exception?.values?.at(-1)?.value === "click handler exploded",
    );

    expect(event.exception?.values?.at(-1)?.type).toBe("Error");

    await page.close();
  });

  it("sends page URLs without their query string", async () => {
    const page = await createPage();
    const earlier = sentry.events.length;

    await page.goto(url("/_error-tracking?invite=LOADED-SECRET"), {
      waitUntil: "hydration",
    });
    await page.evaluate(() =>
      history.pushState({}, "", "/_error-tracking?invite=PUSHED-SECRET"),
    );
    await page.getByRole("button", { name: "Explode" }).click();

    const event = await sentry.waitForEvent(
      (candidate) =>
        candidate.exception?.values?.at(-1)?.value ===
          "click handler exploded" &&
        sentry.events.indexOf(candidate) >= earlier &&
        JSON.stringify(candidate).includes('"category":"navigation"'),
    );

    expect(event.request?.url).toBe(url("/_error-tracking"));
    expect(JSON.stringify(event)).not.toContain("SECRET");

    await page.close();
  });
});
