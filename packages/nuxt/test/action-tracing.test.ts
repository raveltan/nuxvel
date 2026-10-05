import { expect } from "@nuxvel/nuxt/testing";
import { describe, it, vi } from "vitest";
import { getServerLogs } from "@nuxt/test-utils/e2e";
import { setupPlayground } from "./helpers/playground";
import { runProbeOnce } from "./helpers/probe";

describe("defineAction tracing", async () => {
  await setupPlayground();
  const probe = runProbeOnce("/api/_action-tracing-check");

  it("logs exactly one action line per call, with a readable msg and the actor as a string without its role", async () => {
    const body = probe();

    expect(body.calls).toHaveLength(2);

    const [msg, entry] = body.calls[0] as [string, Record<string, unknown>];

    expect(msg).toMatch(/^_action-tracing-check\.tracedPing ok \(\d+ms\)$/);
    expect(entry.action).toBe("_action-tracing-check.tracedPing");
    expect(entry.actor).toBe(`system:${body.actor.id}`);
    expect(typeof entry.durationMs).toBe("number");
    expect(entry).toMatchObject({ ok: true });
  });

  it("logs a readable message when the failure is a plain error shape", async () => {
    const body = probe();

    const [msg, entry] = body.calls[1] as [string, Record<string, unknown>];

    expect(msg).toMatch(/^_action-tracing-check\.tracedValidated failed: Invalid input \(\d+ms\)$/);
    expect(entry).toMatchObject({
      action: "_action-tracing-check.tracedValidated",
      ok: false,
      error: "Invalid input",
    });
  });

  it("writes each trace as one JSON line tagged with the request id", async () => {
    const body = probe();
    const line = await vi.waitFor(() => {
      const found = getServerLogs().find((candidate) => candidate.includes('"action":"_action-tracing-check.tracedPing"'));

      if (!found) throw new Error("no trace line yet");

      return found;
    });

    expect(JSON.parse(line)).toMatchObject({
      level: "info",
      tag: "action",
      action: "_action-tracing-check.tracedPing",
      actor: "system:_action-tracing-check",
      ok: true,
      requestId: body.requestId,
    });
  });
});
