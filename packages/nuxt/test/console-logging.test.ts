import { expect, guest } from "@nuxvel/nuxt/testing";
import { describe, it, vi } from "vitest";
import { clearServerLogs, getServerLogs, url } from "@nuxt/test-utils/e2e";
import { setupPlayground } from "./helpers/playground";

function parsedLines() {
  return getServerLogs().map((line) => JSON.parse(line) as Record<string, unknown>);
}

async function consoleCheck() {
  clearServerLogs();
  await guest().$fetch("/api/_console-check?secret=console-check-secret", {
    headers: { "x-request-id": "console-check-request" },
    ignoreResponseError: true,
  });
  await guest().$fetch("/api/_error-tracking-check", {
    headers: { "x-request-id": "console-check-after" },
    ignoreResponseError: true,
  });

  return vi.waitFor(() => {
    const lines = parsedLines();

    expect(lines.some((line) => line.level === "error" && line.requestId === "console-check-after")).toBe(true);

    return lines;
  });
}

describe("console output in JSON mode", async () => {
  await setupPlayground();

  it("turns a stray console.log into a JSON line tagged console", async () => {
    const lines = await consoleCheck();

    expect(lines).toContainEqual(
      expect.objectContaining({ level: "info", tag: "console", msg: "console-check stray", detail: 1, requestId: "console-check-request" }),
    );
  });

  it("logs a Node process warning at warn, not error", async () => {
    const lines = await consoleCheck();
    const warnings = lines.filter((line) => String(line.msg).includes("console-check node warning"));

    expect(warnings).toEqual([
      expect.objectContaining({ level: "warn", tag: "console", msg: expect.stringMatching(/^\(node:\d+\) ExperimentalWarning: /) }),
    ]);
  });

  it("logs a failing handler once, as the request error line without its query string", async () => {
    const lines = await consoleCheck();
    const errors = lines.filter(
      (line) => line.level === "error" && JSON.stringify(line).includes("console-check boom"),
    );

    expect(errors).toEqual([
      expect.objectContaining({
        tag: "request",
        msg: "GET /api/_console-check failed",
        requestId: "console-check-request",
        err: expect.objectContaining({ cause: expect.objectContaining({ message: "console-check boom" }) }),
      }),
    ]);
    expect(getServerLogs().some((line) => line.includes("[request error]"))).toBe(false);
    expect(getServerLogs().some((line) => line.includes("console-check-secret"))).toBe(false);
  });

  it("still renders Nuxt's error page for a missing page", async () => {
    const response = await fetch(url("/console-check-missing-page"), { headers: { accept: "text/html" } });

    expect(response.status).toBe(404);
    expect(response.headers.get("content-type")).toContain("text/html");
    expect(await response.text()).toContain("<html");
  });
});
