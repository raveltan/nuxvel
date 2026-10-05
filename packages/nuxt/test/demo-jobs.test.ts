import type { Page } from "playwright-core";
import { afterAll, beforeAll, describe, it } from "vitest";
import { actingAs, expect, expectAccessible } from "@nuxvel/nuxt/testing";
import { userFactory } from "../../../playground/server/factories/users.factory";
import { startQueueWorker } from "./helpers/queue-worker";
import { setupPlayground } from "./helpers/playground";

const RUN_TIMEOUT_MS = 30_000;

async function progressValues(page: Page) {
  return page.getByRole("progressbar").getAttribute("aria-valuenow");
}

function runStatus(page: Page) {
  return page.getByRole("status").filter({ has: page.locator("[data-run-status]") }).textContent();
}

describe("playground demo: jobs", async () => {
  await setupPlayground({
    browser: true,
  });

  let worker: Awaited<ReturnType<typeof startQueueWorker>>;

  beforeAll(async () => {
    worker = await startQueueWorker();
  }, 90_000);

  afterAll(async () => {
    await worker?.stop();
  });

  it("follows a dispatched job's progress to completed", async () => {
    const page = await actingAs(await userFactory({ email: "demo-jobs-completed@example.com" })).visit("/jobs");
    await expect.poll(() => runStatus(page)).toBe("idle");
    await expectAccessible(page);

    const seen = new Set<string | null>();
    await page.getByRole("button", { name: "Run countdown", exact: true }).click();

    await expect
      .poll(
        async () => {
          seen.add(await progressValues(page));
          return runStatus(page);
        },
        { timeout: RUN_TIMEOUT_MS, interval: 50 },
      )
      .toBe("completed");
    expect(await progressValues(page)).toBe("100");
    expect([...seen].some((value) => value !== null && Number(value) > 0 && Number(value) < 100)).toBe(
      true,
    );
    await page.locator("p", { hasText: "Finished at" }).waitFor();
    await page.mouse.move(0, 0);
    await page.waitForFunction(() => document.getAnimations().length === 0);
    await expectAccessible(page);
  }, RUN_TIMEOUT_MS + 10_000);

  it("shows failed with its error once a failing job runs out of attempts", async () => {
    const page = await actingAs(await userFactory({ email: "demo-jobs-failed@example.com" })).visit("/jobs");

    await page.getByRole("button", { name: "Run failing countdown" }).click();

    await expect
      .poll(() => runStatus(page), { timeout: RUN_TIMEOUT_MS })
      .toBe("failed");
    await page.getByText("Something went wrong").waitFor();
    await page.mouse.move(0, 0);
    await page.waitForFunction(() => document.getAnimations().length === 0);
    await expectAccessible(page);
  }, RUN_TIMEOUT_MS + 10_000);
});
