import { expect, guest, visit } from "@nuxvel/nuxt/testing";
import type { Page } from "playwright-core";
import { describe, it } from "vitest";
import { createPage, url } from "@nuxt/test-utils/e2e";
import { setupPlayground } from "./helpers/playground";

const UFORM_INPUT_VALIDATION_DELAY_MS = 300;

function tagCreateRequests(page: Page) {
  const requests: string[] = [];

  page.on("request", (request) => {
    if (request.url().includes("/api/trpc/tag.create")) requests.push(request.url());
  });

  return requests;
}

async function visitTagForm() {
  const page = await visit("/_action-form");
  const requests = tagCreateRequests(page);
  await page.clock.install();

  return { page, requests };
}

async function openTagForm() {
  const page = await createPage();
  const requests = tagCreateRequests(page);
  await page.clock.install();
  await page.goto(url("/_action-form"), { waitUntil: "hydration" });

  return { page, requests };
}

async function describedBy(page: Page) {
  const ids = await page.getByLabel("Name").getAttribute("aria-describedby");

  if (!ids) return [];

  return Promise.all(ids.split(" ").map((id) => page.locator(`[id="${id}"]`).textContent()));
}

describe("useActionForm with <UForm>", async () => {
  await setupPlayground({
    browser: true,
  });

  it("shows a schema error under its field, linked to the input, with no round trip", async () => {
    const { page, requests } = await visitTagForm();

    await page.getByRole("button", { name: "Create tag" }).click();

    await expect.poll(() => describedBy(page)).toEqual([
      expect.stringMatching(/>=1 characters/),
    ]);
    await expect
      .poll(() => page.getByLabel("Name").evaluate((input) => input === document.activeElement))
      .toBe(true);
    expect(requests).toEqual([]);
  });

  it("puts a server-side conflict on a single column under that field", async () => {
    await guest().$fetch("/api/trpc/tag.create", {
      method: "POST",
      body: { json: { name: "taken" } },
    });
    const { page, requests } = await visitTagForm();

    await page.getByLabel("Name").fill("taken");
    await page.getByRole("button", { name: "Create tag" }).click();

    await expect.poll(() => describedBy(page)).toEqual([
      "A row with this value already exists",
    ]);
    await page.clock.runFor(UFORM_INPUT_VALIDATION_DELAY_MS * 2);
    expect(await describedBy(page)).toEqual(["A row with this value already exists"]);
    await expect
      .poll(() => page.getByLabel("Name").evaluate((input) => input === document.activeElement))
      .toBe(true);
    expect(requests).toHaveLength(1);
  });

  it("announces a form-level error in a live region", async () => {
    const { page } = await openTagForm();

    await page.route("**/api/trpc/tag.create**", (route) =>
      route.fulfill({
        status: 503,
        contentType: "application/json",
        body: JSON.stringify({
          error: {
            json: {
              message: "Tags are read-only right now",
              code: -32603,
              data: { code: "SERVICE_UNAVAILABLE", httpStatus: 503 },
            },
          },
        }),
      }),
    );
    await page.getByLabel("Name").fill("fresh");
    await page.getByRole("button", { name: "Create tag" }).click();

    await expect
      .poll(() => page.locator('[aria-live="assertive"]').textContent())
      .toBe("Tags are read-only right now");

    await page.close();
  });

  it("shows an internal server error as a generic message with its request id", async () => {
    const { page } = await openTagForm();

    await page.route("**/api/trpc/tag.create**", (route) =>
      route.continue({
        url: url("/api/trpc/_errorLeakCheck.mutation"),
        headers: { ...route.request().headers(), "x-request-id": "form-ref-1" },
        postData: JSON.stringify({ json: { kind: "postgres" } }),
      }),
    );
    await page.getByLabel("Name").fill("fresh");
    await page.getByRole("button", { name: "Create tag" }).click();

    await expect
      .poll(() => page.locator('[aria-live="assertive"]').textContent())
      .toBe("Something went wrong (ref: form-ref-1)");

    await page.close();
  });
});
