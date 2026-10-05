import { randomUUID } from "node:crypto";
import { expect, guest } from "@nuxvel/nuxt/testing";
import { describe, it, vi } from "vitest";
import { getServerLogs } from "@nuxt/test-utils/e2e";
import type { TimelineSpan } from "../../src/runtime/shared/devtools/collected-entry";

async function spansOf(requestId: string, type: string) {
  let spans: TimelineSpan[] = [];

  await expect
    .poll(async () => {
      const response = await guest().fetch(`/_nuxvel/devtools/api/entries/${encodeURIComponent(requestId)}`);
      spans = response.ok ? ((await response.json()) as { spans: TimelineSpan[] }).spans.filter((span) => span.type === type) : [];
      return spans.length;
    })
    .toBeGreaterThan(0);

  return spans;
}

describe("the DevTools log span", () => {
  it("keeps the fields and the error with its cause chain, with secret-named fields redacted", async () => {
    const requestId = `log-span-${randomUUID()}`;

    await (await guest().fetch("/api/_log-span-check", { headers: { "x-request-id": requestId } })).text();

    const [span] = await spansOf(requestId, "log");

    expect(span?.data).toMatchObject({
      level: "warn",
      message: "log-span-check warned",
      tag: "log-span-check",
      fields: { detail: 1, password: "[redacted]" },
      err: { name: "Error", message: "log-span-check outer", cause: { message: "log-span-check inner" } },
    });
    expect(JSON.stringify(span)).not.toContain("log-span-secret");
  });
});

type JsonLine = { level: string; tag: string; msg: string; requestId?: string; procedure?: string; code?: string; fields?: unknown };

function trpcLines(requestId: string) {
  return getServerLogs()
    .filter((line) => line.startsWith("{"))
    .map((line) => JSON.parse(line) as JsonLine)
    .filter((line) => line.tag === "trpc" && line.requestId === requestId);
}

function trpcPath(procedure: string, input: unknown) {
  return `/api/trpc/${procedure}?input=${encodeURIComponent(JSON.stringify({ json: input }))}`;
}

describe("a tRPC call that fails with a 4xx in development", () => {
  it("shows the message and the field errors in its trpc:call span, and logs them at warn", async () => {
    const requestId = `trpc-4xx-${randomUUID()}`;
    const response = await guest().fetch(trpcPath("_errorFormatterCheck.inputInvalid", { title: "" }), { headers: { "x-request-id": requestId } });

    expect(response.status).toBe(400);

    const [span] = await spansOf(requestId, "trpc:call");

    expect(span?.data).toMatchObject({ ok: false, error: "BAD_REQUEST", message: "Invalid input", fields: { title: ["Title is required"] } });
    expect(span?.summary).toContain("BAD_REQUEST: Invalid input (title: Title is required)");

    await vi.waitFor(() =>
      expect(trpcLines(requestId)).toContainEqual(
        expect.objectContaining({
          level: "warn",
          procedure: "_errorFormatterCheck.inputInvalid",
          code: "BAD_REQUEST",
          msg: expect.stringContaining("Invalid input"),
          fields: { title: ["Title is required"] },
        }),
      ),
    );
  });

  it("logs a thrown ForbiddenError at warn with its message", async () => {
    const requestId = `trpc-403-${randomUUID()}`;
    const response = await guest().fetch(trpcPath("_errorFormatterCheck.forbidden", undefined), { headers: { "x-request-id": requestId } });

    await response.text();
    expect(response.status).toBe(403);

    await vi.waitFor(() =>
      expect(trpcLines(requestId)).toContainEqual(
        expect.objectContaining({ level: "warn", procedure: "_errorFormatterCheck.forbidden", code: "FORBIDDEN", msg: expect.stringContaining("Not yours") }),
      ),
    );
  });

  it("does not log a call to a procedure that does not exist", async () => {
    const requestId = `trpc-missing-${randomUUID()}`;
    const response = await guest().fetch(trpcPath("_errorFormatterCheck.removed", undefined), { headers: { "x-request-id": requestId } });

    await response.text();
    expect(response.status).toBe(404);

    const marker = `trpc-missing-marker-${randomUUID()}`;

    await (await guest().fetch(trpcPath("_errorFormatterCheck.inputInvalid", { title: "" }), { headers: { "x-request-id": marker } })).text();
    await vi.waitFor(() => expect(trpcLines(marker)).not.toHaveLength(0));
    expect(trpcLines(requestId)).toHaveLength(0);
  });
});
