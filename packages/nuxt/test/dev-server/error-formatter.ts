import { stripVTControlCharacters } from "node:util";
import { randomUUID } from "node:crypto";
import { expect, guest } from "@nuxvel/nuxt/testing";
import { describe, it, vi } from "vitest";
import { getServerLogs } from "@nuxt/test-utils/e2e";
import superjson from "superjson";

describe("global tRPC errorFormatter (development)", () => {
  it("hides a plain thrown Error behind the production message and a ref, without a stack trace", async () => {
    const requestId = randomUUID();
    const fetchError = await guest().$fetch("/api/trpc/_errorFormatterCheck.throwPlain", {
      headers: { "x-request-id": requestId },
    }).catch((error) => error);

    const shape = superjson.deserialize<{ message: string; data: Record<string, unknown> }>(fetchError.data.error);

    expect(shape.data.code).toBe("INTERNAL_SERVER_ERROR");
    expect(shape.message).toBe(`Something went wrong (ref: ${requestId})`);
    expect(shape.data).not.toHaveProperty("stack");
  });

  it("logs the real error and its stack to the console, with the request id", async () => {
    const requestId = randomUUID();

    await guest().fetch("/api/trpc/_errorFormatterCheck.throwPlain", { headers: { "x-request-id": requestId } });

    await vi.waitFor(() => {
      const logs = stripVTControlCharacters(getServerLogs().join("\n"));

      expect(logs).toMatch(new RegExp(`throwPlain failed .*req=${requestId.slice(0, 8)}\\n.*boom detail\\n\\s+at `));
    });
  });

  it("hides the real message and the stack of a failing plain /api route", async () => {
    const requestId = randomUUID();
    const response = await guest().fetch("/api/_error-leak-check?kind=plain", { headers: { "x-request-id": requestId } });
    const body = await response.text();

    expect(response.status).toBe(500);
    expect(JSON.parse(body).message).toBe(`Something went wrong (ref: ${requestId})`);
    expect(body).not.toMatch(/leak_probe_secret|"stack"/);
  });
});
