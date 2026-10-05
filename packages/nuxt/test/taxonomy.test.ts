import { expect, guest } from "@nuxvel/nuxt/testing";
import { describe, it, vi } from "vitest";
import { getServerLogs } from "@nuxt/test-utils/e2e";
import { setupPlayground } from "./helpers/playground";

describe("error taxonomy", async () => {
  await setupPlayground();

  it("maps each taxonomy error to its expected tRPC code through the in-process caller", async () => {
    const body = await guest().$fetch("/api/_taxonomy-check");

    expect(body).toMatchObject({
      NotFoundError: "NOT_FOUND",
      ConflictError: "CONFLICT",
      RateLimitedError: "TOO_MANY_REQUESTS",
      TransientError: "SERVICE_UNAVAILABLE",
      UnknownError: "INTERNAL_SERVER_ERROR",
    });
  });

  it("answers a taxonomy error thrown from a plain Nitro handler with its HTTP status", async () => {
    const notFound = await guest().fetch("/api/_taxonomy-status-check?name=NotFoundError");
    const rateLimited = await guest().fetch("/api/_taxonomy-status-check?name=RateLimitedError");

    expect(notFound.status).toBe(404);
    expect(await notFound.json()).toMatchObject({
      statusCode: 404,
      message: "handler found nothing",
      data: { code: "NOT_FOUND", message: "handler found nothing" },
    });
    expect(rateLimited.status).toBe(429);
    expect(rateLimited.headers.get("retry-after")).toBe("7");
    expect(await rateLimited.json()).toMatchObject({
      data: { code: "TOO_MANY_REQUESTS", retryAfter: 7 },
    });
  });

  it("does not log a 4xx taxonomy error from a plain Nitro handler at error", async () => {
    await guest().fetch("/api/_taxonomy-status-check?name=NotFoundError", {
      headers: { "x-request-id": "taxonomy-not-logged" },
    });
    await guest().fetch("/api/_error-tracking-check", {
      headers: { "x-request-id": "taxonomy-logged-after" },
    });

    const errorLines = await vi.waitFor(() => {
      const lines = getServerLogs()
        .filter((line) => line.startsWith("{"))
        .map((line) => JSON.parse(line) as Record<string, unknown>)
        .filter((line) => line.level === "error");

      expect(lines.some((line) => line.requestId === "taxonomy-logged-after")).toBe(true);

      return lines;
    });

    expect(errorLines.filter((line) => line.requestId === "taxonomy-not-logged")).toEqual([]);
    expect(errorLines.filter((line) => String(line.msg).includes("_taxonomy-status-check"))).toEqual([]);
  });
});
