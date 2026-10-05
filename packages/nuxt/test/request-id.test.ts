import { expect, guest } from "@nuxvel/nuxt/testing";
import { describe, it, vi } from "vitest";
import { getServerLogs } from "@nuxt/test-utils/e2e";
import superjson from "superjson";
import { setupPlayground } from "./helpers/playground";

describe("the request id", async () => {
  await setupPlayground();

  it("generates a different request ID for each call without the header", async () => {
    const first = await guest().$fetch("/api/trpc/health.requestId");
    const second = await guest().$fetch("/api/trpc/health.requestId");

    expect(superjson.deserialize(first.result.data)).not.toBe(
      superjson.deserialize(second.result.data),
    );
  });

  it("reuses the x-request-id header when one is provided", async () => {
    const body = await guest().$fetch("/api/trpc/health.requestId", {
      headers: { "x-request-id": "test-request-id" },
    });

    expect(superjson.deserialize(body.result.data)).toBe("test-request-id");
  });

  it("ignores a malformed x-request-id and generates one instead", async () => {
    for (const header of ["x".repeat(200), "not a <valid> id"]) {
      const body = await guest().$fetch("/api/trpc/health.requestId", {
        headers: { "x-request-id": header },
      });

      expect(superjson.deserialize(body.result.data)).toMatch(/^[0-9a-f-]{36}$/);
    }
  });

  it("tags audit rows from a plain handler and from useCaller() with the request's id", async () => {
    const body = await guest().$fetch("/api/_request-id-audit-check", {
      headers: { "x-request-id": "request-id-audit-check" },
    });

    expect(body).toEqual({
      requestId: "request-id-audit-check",
      rows: [
        { action: "request-id.from-handler", requestId: "request-id-audit-check" },
        { action: "request-id.through-caller", requestId: "request-id-audit-check" },
      ],
    });
  });

  it("gives the procedure the id the request log records, without the header", async () => {
    const body = await guest().$fetch("/api/trpc/health.requestId");
    const seenByProcedure = superjson.deserialize(body.result.data);

    expect(seenByProcedure).toMatch(/^[0-9a-f-]{36}$/);
    await vi.waitFor(() => {
      const logged = getServerLogs()
        .filter((line) => line.startsWith("{"))
        .map((line) => JSON.parse(line) as { path: string; requestId: string })
        .filter((entry) => entry.path === "/api/trpc/health.requestId");

      expect(logged.map((entry) => entry.requestId)).toContain(seenByProcedure);
    });
  });
});
