import { randomUUID } from "node:crypto";
import { expect, guest } from "@nuxvel/nuxt/testing";
import { describe, it, vi } from "vitest";
import { getServerLogs } from "@nuxt/test-utils/e2e";
import { setupPlayground } from "./helpers/playground";

function jsonLines(marker: string) {
  return getServerLogs()
    .filter((line) => line.startsWith("{") && line.includes(marker))
    .map((line) => JSON.parse(line) as Record<string, unknown>);
}

async function errorLines(requestId: string) {
  return vi.waitFor(() => {
    const lines = jsonLines(requestId).filter((line) => line.level === "error");

    expect(lines).not.toHaveLength(0);

    return lines;
  });
}

describe("unexpected errors without a DSN", async () => {
  await setupPlayground();

  it("logs a throwing procedure once at error, with the procedure, request id and stack", async () => {
    await guest().$fetch("/api/trpc/health.explode", {
      headers: { "x-request-id": "error-logging-procedure" },
      ignoreResponseError: true,
    });

    const lines = await errorLines("error-logging-procedure");

    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatchObject({
      tag: "trpc",
      msg: "health.explode failed",
      procedure: "health.explode",
      requestId: "error-logging-procedure",
      err: { message: "procedure exploded", stack: expect.stringContaining("procedure exploded") },
    });
  });

  it("logs a Nitro handler that fails with a 5xx at error", async () => {
    await guest().$fetch("/api/_error-tracking-check", {
      headers: { "x-request-id": "error-logging-handler" },
      ignoreResponseError: true,
    });

    const [line] = await errorLines("error-logging-handler");

    expect(line).toMatchObject({
      tag: "request",
      msg: "GET /api/_error-tracking-check failed",
      requestId: "error-logging-handler",
      err: { cause: { message: "handler exploded" } },
    });
  });

  it("logs a suppressed mail by name and recipient domain, never the address", async () => {
    const to = `logged-${randomUUID()}@nuxvel.test`;

    await guest().$fetch("/api/_mail-suppression-check", {
      query: { to, suppressed: "yes" },
      headers: { "x-request-id": "error-logging-mail" },
    });

    const line = await vi.waitFor(() => {
      const found = getServerLogs().find((candidate) => candidate.includes('"tag":"mail"') && candidate.includes("error-logging-mail"));

      if (!found) throw new Error("no mail line yet");

      return found;
    });

    expect(line).not.toContain("@");
    expect(JSON.parse(line)).toMatchObject({ level: "info", msg: "welcome suppressed", mail: "welcome", recipientDomain: "nuxvel.test" });
  });
});
