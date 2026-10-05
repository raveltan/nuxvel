import { stripVTControlCharacters } from "node:util";
import { expect, guest } from "@nuxvel/nuxt/testing";
import { describe, it, vi } from "vitest";
import { createPage, getServerLogs, url } from "@nuxt/test-utils/e2e";
import type { CollectedEntry } from "../../src/runtime/server/observe/collector/collected-entry";

const EXPECTED_LINES = [
  /WARN\s+browser {2}\[Vue warn\]: injection "browser-problems-probe-missing" not found/,
  /ERROR\s+browser {2}Error: browser probe click exploded\n\s+at /,
  /ERROR\s+browser {2}Error: browser probe rejection\n\s+at /,
  /WARN\s+browser {2}tRPC query _errorLeakCheck\.unknown failed \(INTERNAL_SERVER_ERROR\)/,
];

async function browserLines(entryId: string) {
  const entries = await guest().$fetch<CollectedEntry[]>("/_nuxvel/test/collected");
  const entry = entries.find((candidate) => candidate.id === entryId);

  return (entry?.spans ?? []).flatMap((span) => (span.type === "log" && span.data.tag === "browser" ? [span.data.message] : []));
}

function browserLogs() {
  return getServerLogs().map(stripVTControlCharacters).join("\n");
}

describe("browser problems in dev", () => {
  it("logs a page's Vue warnings, errors, rejections and failed tRPC calls on the server and in DevTools", async () => {
    const page = await createPage();

    await page.goto(url("/_browser-problems"), { waitUntil: "hydration" });
    await page.getByRole("button", { name: "Explode" }).click();
    await page.getByRole("button", { name: "Reject" }).click();
    await page.getByRole("button", { name: "Fail call" }).click();

    await vi.waitFor(
      () => {
        const logs = browserLogs();

        for (const line of EXPECTED_LINES) expect(logs).toMatch(line);
      },
      { timeout: 20_000 },
    );

    const entries = await guest().$fetch<CollectedEntry[]>("/_nuxvel/test/collected");
    const messages = entries.flatMap((entry) =>
      entry.spans.flatMap((span) => (span.type === "log" && span.data.tag === "browser" ? [span.data.message] : [])),
    );

    expect(messages).toContainEqual(expect.stringContaining("browser probe click exploded"));
    expect(messages).toContainEqual(expect.stringContaining('injection "browser-problems-probe-missing" not found'));

    await page.close();
  }, 60_000);

  it("adds a problem to the entry of the page's server render", async () => {
    const page = await createPage();
    const response = await page.goto(url("/_browser-problems"), { waitUntil: "hydration" });
    const entryId = await response?.headerValue("x-nuxvel-debug-id");

    if (!entryId) throw new Error("the page has no debug id");

    await page.getByRole("button", { name: "Explode" }).click();

    await expect.poll(() => browserLines(entryId), { timeout: 20_000 }).toContainEqual(expect.stringContaining("browser probe click exploded"));
    await expect.poll(() => browserLines(entryId)).toContainEqual(expect.stringContaining('injection "browser-problems-probe-missing" not found'));

    await page.close();
  }, 60_000);

  it("puts the problems of a page reached by client-side navigation in one entry of that page", async () => {
    const page = await createPage();
    const response = await page.goto(url("/_browser-problems"), { waitUntil: "hydration" });
    const firstEntryId = await response?.headerValue("x-nuxvel-debug-id");

    if (!firstEntryId) throw new Error("the page has no debug id");

    await page.getByRole("link", { name: "Leave" }).click();
    await page.waitForURL("**/_browser-problems?next");
    await page.evaluate(() => {
      window.dispatchEvent(new ErrorEvent("error", { error: new Error("navigated problem one") }));
      window.dispatchEvent(new ErrorEvent("error", { error: new Error("navigated problem two") }));
    });

    await vi.waitFor(
      async () => {
        const entries = await guest().$fetch<CollectedEntry[]>("/_nuxvel/test/collected");
        const entry = entries.find((candidate) => candidate.label === "BROWSER /_browser-problems");
        const messages = (entry?.spans ?? []).flatMap((span) => (span.type === "log" ? [span.data.message] : []));

        expect(messages).toEqual([expect.stringContaining("navigated problem one"), expect.stringContaining("navigated problem two")]);
      },
      { timeout: 20_000 },
    );
    expect(await browserLines(firstEntryId)).not.toContainEqual(expect.stringContaining("navigated problem"));

    await page.close();
  }, 60_000);

  it("puts a problem without a known page entry in an entry of its own", async () => {
    await guest().$fetch("/_nuxvel/devtools/api/browser-problems", {
      method: "POST",
      body: { level: "error", message: "Error: orphan browser problem", path: "/_orphan", requestId: "not-an-entry" },
    });

    const entries = await guest().$fetch<CollectedEntry[]>("/_nuxvel/test/collected");
    const entry = entries.find((candidate) => candidate.label === "BROWSER /_orphan");

    expect(entry?.spans).toContainEqual(
      expect.objectContaining({ type: "log", data: { level: "error", message: "Error: orphan browser problem", tag: "browser" } }),
    );
  });

  it("refuses a problem that is not JSON", async () => {
    await expect(
      guest().$fetch("/_nuxvel/devtools/api/browser-problems", { method: "POST", body: "level=error", headers: { "content-type": "text/plain" } }),
    ).rejects.toMatchObject({ statusCode: 415 });
  });
});
