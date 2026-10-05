import { randomUUID } from "node:crypto";
import { afterAll, describe, it, vi } from "vitest";
import { getServerLogs } from "@nuxt/test-utils/e2e";
import { expect, expectErrorReported, guest } from "@nuxvel/nuxt/testing";
import { startFakeSentry } from "@nuxvel/test-helpers/fake-sentry";
import { setupPlayground } from "./helpers/playground";

const sentry = await startFakeSentry();

async function failRevalidation(query: Record<string, string>) {
  const key = randomUUID();

  await guest().$fetch("/api/_cached-error-check", { query: { key, ...query } });
  await guest().$fetch("/api/_cached-error-check", { query: { key, fail: "1", ...query }, headers: { "x-request-id": key } });

  return key;
}

async function errorLines(key: string) {
  return vi.waitFor(() => {
    const lines = getServerLogs()
      .filter((line) => line.includes(key))
      .map((line) => JSON.parse(line) as Record<string, unknown>)
      .filter((line) => line.level === "error");

    expect(lines).not.toHaveLength(0);

    return lines;
  });
}

describe("errors in a Nitro cached handler or function", async () => {
  await setupPlayground({ env: { NUXT_PUBLIC_SENTRY_DSN: sentry.dsn } });

  afterAll(async () => {
    await sentry.close();
  });

  it("logs a failed revalidation of a cached handler once, as the request error line", async () => {
    const key = await failRevalidation({});

    expect(await errorLines(key)).toEqual([
      expect.objectContaining({
        tag: "request",
        msg: "GET /api/_cached-error-check failed",
        requestId: key,
        err: expect.objectContaining({ message: `cached handler exploded ${key}` }),
      }),
    ]);
    await expectErrorReported(`cached handler exploded ${key}`, { times: 1 });
    await sentry.waitForEvent((event) => event.tags?.requestId === key);
    expect(sentry.events.filter((event) => event.tags?.requestId === key)).toHaveLength(1);
  });

  it("logs a failed revalidation of a cached function called without an event once", async () => {
    const key = await failRevalidation({ eventless: "1" });

    expect(await errorLines(key)).toEqual([
      expect.objectContaining({
        tag: "cache",
        msg: "a cached function failed",
        err: expect.objectContaining({ message: `cached function exploded ${key}` }),
      }),
    ]);
    await expectErrorReported(`cached function exploded ${key}`, { times: 1 });
  });
});
