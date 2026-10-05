import { existsSync, rmSync } from "node:fs";
import { describe, it, onTestFinished } from "vitest";
import { devices } from "playwright-core";
import { actingAs, expect, visit } from "@nuxvel/nuxt/testing";
import { userFactory } from "../../../playground/server/factories/users.factory";
import { setupPlayground } from "./helpers/playground";

const screenshot = "test-results/visit.test.ts/fails-the-test-on-a-page-error.png";

describe("visit(path, options)", async () => {
  await setupPlayground({ browser: true });

  it("opens a private page as actingAs(user)", async () => {
    const page = await actingAs(await userFactory()).visit("/protected");

    expect(new URL(page.url()).pathname).toBe("/protected");
    await page.getByText("protected", { exact: true }).waitFor();
  });

  it("opens the page with a device and dark mode", async () => {
    const page = await visit("/", { ...devices["iPhone 13"], colorScheme: "dark" });

    expect(await page.evaluate("[innerWidth, matchMedia('(prefers-color-scheme: dark)').matches]")).toEqual([390, true]);
  });

  it("opens the path, query and hash of a full URL on the app under test, such as a link from a mail", async () => {
    const page = await visit("https://app.example.test/offline?from=mail#top");
    const opened = new URL(page.url());

    expect(opened.pathname + opened.search + opened.hash).toBe("/offline?from=mail#top");
    await page.getByRole("heading", { name: "You are offline" }).waitFor();
  });

  it("opens a route location by name", async () => {
    const page = await visit({ name: "sign-in" });

    expect(new URL(page.url()).pathname).toBe("/sign-in");
  });

  it("names a route that no page has", async () => {
    await expect(visit({ name: "no-such" } as unknown as Parameters<typeof visit>[0])).rejects.toThrow('visit: no page has the route name "no-such"');
  });

  it("opens a page that answers the expected status without an error", async () => {
    const page = await visit("/no-such-page", { status: 404 });

    expect(new URL(page.url()).pathname).toBe("/no-such-page");
  });

  it("opens a missing page as actingAs(user) with the expected status", async () => {
    await actingAs(await userFactory()).visit("/no-such-page", { status: 404 });
  });

  it("opens a noScripts page", async () => {
    const page = await visit("/offline");

    await page.getByRole("heading", { name: "You are offline" }).waitFor();
  });

  it("does not fail on a request that answers 404 after the page loads", async () => {
    const page = await visit("/");

    expect(await page.evaluate("fetch('/api/no-such-route').then((response) => response.status)")).toBe(404);
  });

  let lastPage: Awaited<ReturnType<typeof visit>> | undefined;

  it("keeps the page open while the test runs", async () => {
    lastPage = await visit("/");

    expect(lastPage.isClosed()).toBe(false);
  });

  it("closes the pages of a test before the next test, so they send no requests while the tables are emptied", () => {
    expect(lastPage?.isClosed()).toBe(true);
  });

  let recordedErrors: string[] = [];

  it.fails("fails the test on a page error", async ({ task }) => {
    rmSync(screenshot, { force: true });
    onTestFinished(() => {
      recordedErrors = (task.result?.errors ?? []).map((error) => error.message);
    });

    const page = await visit("/");

    await Promise.all([
      page.waitForEvent("pageerror"),
      page.evaluate("setTimeout(() => { throw new Error('injected failure') })"),
    ]);
  });

  it("names the page error and saves a screenshot", () => {
    expect(recordedErrors.join("\n")).toContain("page error: injected failure");
    expect(existsSync(screenshot)).toBe(true);
  });

  it.fails("fails the test on a page that answers 404", async ({ task }) => {
    onTestFinished(() => {
      recordedErrors = (task.result?.errors ?? []).map((error) => error.message);
    });

    await visit("/no-such-page");
  });

  it("names the 404 status", () => {
    expect(recordedErrors.join("\n")).toMatch(/HTTP 404: .*\/no-such-page/);
  });

  it.fails("fails the test when the page answers another status than the expected one", async ({ task }) => {
    onTestFinished(() => {
      recordedErrors = (task.result?.errors ?? []).map((error) => error.message);
    });

    await visit("/", { status: 404 });
  });

  it("names the expected and the actual status", () => {
    expect(recordedErrors.join("\n")).toMatch(/expected HTTP 404, got 200: .*\//);
  });

  const abortTrpc = async (options: Parameters<typeof visit>[1]) => {
    const page = await visit("/", options);
    await page.route("**/api/trpc/**", (route) => route.abort());
    await page.evaluate("fetch('/api/trpc/post.list').catch(() => 'aborted')");
  };

  it("does not fail on an aborted request that allowFailedRequests names", async () => {
    await abortTrpc({ allowFailedRequests: ["**/api/trpc/post.list*"] });
    await abortTrpc({ allowFailedRequests: [/trpc\/post\.list/] });
  });

  it.fails("fails the test on an aborted request without allowFailedRequests", async ({ task }) => {
    onTestFinished(() => {
      recordedErrors = (task.result?.errors ?? []).map((error) => error.message);
    });

    await abortTrpc({});
  });

  it("names the aborted request", () => {
    expect(recordedErrors.join("\n")).toMatch(/failed request: .*\/api\/trpc\/post\.list/);
  });

  it("does not fail on an event stream that the page closes while it connects", async () => {
    const page = await visit("/");
    await page.route("**/api/channels?*", () => {});
    const connecting = page.waitForRequest("**/api/channels?*");
    await page.evaluate(`window.stream = new EventSource("/api/channels?channels=" + encodeURIComponent(JSON.stringify([{ name: "maintenance" }])))`);
    await connecting;
    const failed = page.waitForEvent("requestfailed");

    await page.evaluate("window.stream.close()");
    await failed;
  });

  it.fails("fails the test on a failed request that no allowFailedRequests item matches", async () => {
    await abortTrpc({ allowFailedRequests: ["**/api/other/**"] });
  });
});
