import { afterEach, describe, it } from "vitest";
import { createPage, url } from "@nuxt/test-utils/e2e";
import { Queue } from "bullmq";
import { actingAs, expect, expectAccessible, guest, startMaintenance, stopMaintenance } from "@nuxvel/nuxt/testing";
import { userFactory } from "../../../playground/server/factories/users.factory";
import { setupPlayground } from "./helpers/playground";

const MESSAGE = "Upgrading the blog. Back in a few minutes.";

async function queuePaused() {
  const queue = new Queue("nuxvel", { connection: { url: process.env.NUXT_REDIS_URL, maxRetriesPerRequest: null } });

  try {
    return await queue.isPaused();
  } finally {
    await queue.close();
  }
}

describe("maintenance mode", async () => {
  await setupPlayground({ browser: true });

  afterEach(() => stopMaintenance());

  it("answers a page with a 503 maintenance page that no cache keeps", async () => {
    await startMaintenance({ message: MESSAGE, retryAfter: 120 });

    const response = await guest().fetch("/", { headers: { accept: "text/html" } });

    expect(response.status).toBe(503);
    expect(response.headers.get("retry-after")).toBe("120");
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("content-security-policy")).toContain("script-src");
  });

  it("answers an API route with the MAINTENANCE code and a tRPC call with the message", async () => {
    await startMaintenance({ message: MESSAGE, retryAfter: 120 });

    const api = await guest().fetch("/api/flags");
    const trpc = await guest().fetch("/api/trpc/_errorFormatterCheck.forbidden");

    expect(api.status).toBe(503);
    expect(api.headers.get("retry-after")).toBe("120");
    expect(await api.json()).toMatchObject({
      statusCode: 503,
      message: MESSAGE,
      data: { code: "MAINTENANCE", message: MESSAGE, retryAfter: 120 },
    });
    expect(trpc.status).toBe(503);
    expect(trpc.headers.get("retry-after")).toBe("120");
    expect(await trpc.json()).toMatchObject({
      error: {
        json: {
          message: MESSAGE,
          data: { code: "SERVICE_UNAVAILABLE", httpStatus: 503, retryAfter: 120, maintenance: true },
        },
      },
    });
  });

  it("keeps the health endpoints up, saying the app is in maintenance", async () => {
    await startMaintenance();

    const live = await guest().fetch("/api/health/live");
    const ready = await guest().fetch("/api/health/ready");

    expect(live.status).toBe(200);
    expect(await live.json()).toEqual({ status: "live", maintenance: true });
    expect(ready.status).toBe(200);
    expect(await ready.json()).toMatchObject({ database: "reachable", redis: "reachable", maintenance: true });
  });

  it("lets a browser in after it opens /<secret>, and no other", async () => {
    await startMaintenance({ secret: "deploy-2026-09" });

    const unlock = await guest().fetch("/deploy-2026-09", { redirect: "manual" });
    const cookie = unlock.headers.getSetCookie().find((value) => value.startsWith("nuxvel_maintenance="));

    expect(unlock.status).toBe(302);
    expect(unlock.headers.get("location")).toBe("/");
    expect(cookie).toContain("HttpOnly");
    expect((await guest().fetch("/", { headers: { cookie: cookie?.split(";")[0] ?? "" } })).status).toBe(200);
    expect((await guest().fetch("/", { headers: { cookie: "nuxvel_maintenance=guess" } })).status).toBe(503);
    expect((await guest().fetch("/wrong-secret", { redirect: "manual" })).status).toBe(503);
  });

  it("lets an allowed IP in", async () => {
    await startMaintenance({ allow: ["127.0.0.1", "::1"] });

    expect((await guest().fetch("/")).status).toBe(200);
    expect((await guest().fetch("/api/flags")).status).toBe(200);
  });

  it("never serves or stores the 503 through a cached route", async () => {
    await guest().fetch("/_rendering/cached");
    await startMaintenance();

    const down = await guest().fetch("/_rendering/cached");

    expect(down.status).toBe(503);

    await stopMaintenance();

    const up = await guest().fetch("/_rendering/cached");

    expect(up.status).toBe(200);
    expect(await guest().$fetch<{ hits: number }>("/api/_rendering-sentinel-check", { query: { mode: "cached" } })).toEqual({
      hits: 1,
    });
  });

  it("pauses the queue, and resumes it on stopMaintenance()", async () => {
    await startMaintenance();
    expect(await queuePaused()).toBe(true);

    await stopMaintenance();
    expect(await queuePaused()).toBe(false);

    await startMaintenance({ keepQueue: true });
    expect(await queuePaused()).toBe(false);
  });

  it("shows an accessible maintenance page in the browser, and the message in a form that submits", async () => {
    const form = await createPage();
    await form.goto(url("/_action-form"), { waitUntil: "hydration" });

    await startMaintenance({ message: MESSAGE });

    const page = await createPage();
    const response = await page.goto(url("/"));

    expect(response?.status()).toBe(503);
    await page.getByRole("heading", { name: "Down for maintenance" }).waitFor();
    await page.getByText(MESSAGE).waitFor();
    await expectAccessible(page);

    await form.getByLabel("Name").fill("maintenance");
    await form.getByRole("button", { name: "Create tag" }).click();
    await form.locator('[data-slot="title"]', { hasText: MESSAGE }).waitFor();
    expect(await form.getByRole("alert").textContent()).toBe(MESSAGE);

    await page.close();
    await form.close();
  });

  it("shows a banner in an open tab when the app goes down and when it is back, with no reload", async () => {
    const page = await createPage();
    await actingAs(await userFactory({ email: "maintenance-banner@example.com" })).login(page);
    const joined = page.waitForResponse(
      (response) =>
        response.url().includes("/api/channels") &&
        `${response.url()}${response.request().postData() ?? ""}`.includes("maintenance"),
    );
    await page.goto(url("/posts"), { waitUntil: "hydration" });
    await joined;

    await startMaintenance({ message: MESSAGE, secret: "deploy-2026-09" });

    await page.getByText(MESSAGE).waitFor();
    await expectAccessible(page);

    await stopMaintenance();

    await page.getByText("The app is back.").waitFor();
    await page.getByRole("button", { name: "Reload" }).waitFor();

    await startMaintenance({ message: MESSAGE, secret: "deploy-2026-09" });
    await page.goto(url("/deploy-2026-09"));
    await page.goto(url("/posts"));

    expect(await page.getByText(MESSAGE).isVisible()).toBe(true);

    await page.close();
  });
});
