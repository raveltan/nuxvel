import { expect, guest } from "@nuxvel/nuxt/testing";
import { afterAll, describe, it, vi } from "vitest";
import { clearServerLogs, getServerLogs, url } from "@nuxt/test-utils/e2e";
import { startFakeSentry } from "@nuxvel/test-helpers/fake-sentry";
import { setupPlayground } from "./helpers/playground";

const sentry = await startFakeSentry();

describe("server error tracking", async () => {
  await setupPlayground({
    env: { NUXT_PUBLIC_SENTRY_DSN: sentry.dsn },
  });

  afterAll(async () => {
    await sentry.close();
  });

  it("captures an error thrown in a procedure, tagged with the request ID", async () => {
    await guest().$fetch("/api/trpc/health.explode", {
      headers: { "x-request-id": "error-tracking-procedure" },
      ignoreResponseError: true,
    });

    const event = await sentry.waitForEvent(
      (candidate) => candidate.tags?.requestId === "error-tracking-procedure",
    );

    expect(event.tags?.procedure).toBe("health.explode");
    expect(event.exception?.values?.at(-1)?.value).toBe("procedure exploded");
  });

  it("captures an error thrown while building the tRPC context", async () => {
    const response = await fetch(url("/api/trpc/health.ping"), {
      headers: { "x-request-id": "error-tracking-context", "x-probe-context-fail": "1" },
    });

    expect(response.status).toBe(500);

    const event = await sentry.waitForEvent(
      (candidate) => candidate.tags?.requestId === "error-tracking-context",
    );

    expect(event.exception?.values?.at(-1)?.value).toBe("context exploded");
  });

  it("does not capture a taxonomy error", async () => {
    await guest().$fetch("/api/trpc/health.missing", {
      headers: { "x-request-id": "error-tracking-taxonomy" },
      ignoreResponseError: true,
    });
    await guest().$fetch("/api/trpc/health.explode", {
      headers: { "x-request-id": "error-tracking-after-taxonomy" },
      ignoreResponseError: true,
    });

    await sentry.waitForEvent(
      (candidate) => candidate.tags?.requestId === "error-tracking-after-taxonomy",
    );

    expect(
      sentry.events.some(
        (candidate) => candidate.tags?.requestId === "error-tracking-taxonomy",
      ),
    ).toBe(false);
  });

  it("does not capture expected failures: validation, fail(), forbidden, unauthenticated", async () => {
    await guest().$fetch("/api/trpc/_errorFormatterCheck.actionInvalid", {
      headers: { "x-request-id": "error-tracking-validation" },
      ignoreResponseError: true,
    });
    await guest().$fetch("/api/trpc/_errorFormatterCheck.actionFailed", {
      headers: { "x-request-id": "error-tracking-action-failed" },
      ignoreResponseError: true,
    });
    await guest().$fetch("/api/trpc/_errorFormatterCheck.forbidden", {
      headers: { "x-request-id": "error-tracking-forbidden" },
      ignoreResponseError: true,
    });
    await guest().$fetch("/api/trpc/_errorFormatterCheck.unauthenticated", {
      headers: { "x-request-id": "error-tracking-unauthenticated" },
      ignoreResponseError: true,
    });
    await guest().$fetch("/api/trpc/health.explode", {
      headers: { "x-request-id": "error-tracking-after-validation" },
      ignoreResponseError: true,
    });

    await sentry.waitForEvent(
      (candidate) => candidate.tags?.requestId === "error-tracking-after-validation",
    );

    expect(
      sentry.events.filter((candidate) =>
        [
          "error-tracking-validation",
          "error-tracking-action-failed",
          "error-tracking-forbidden",
          "error-tracking-unauthenticated",
        ].includes(
          String(candidate.tags?.requestId),
        ),
      ),
    ).toEqual([]);
  });

  it("does not capture a taxonomy error thrown in a Nitro handler", async () => {
    await guest().$fetch("/api/_taxonomy-status-check?name=NotFoundError", {
      headers: { "x-request-id": "error-tracking-handler-taxonomy" },
      ignoreResponseError: true,
    });
    await guest().$fetch("/api/_error-tracking-check", {
      headers: { "x-request-id": "error-tracking-handler-after-taxonomy" },
      ignoreResponseError: true,
    });

    await sentry.waitForEvent(
      (candidate) => candidate.tags?.requestId === "error-tracking-handler-after-taxonomy",
    );

    expect(
      sentry.events.some(
        (candidate) => candidate.tags?.requestId === "error-tracking-handler-taxonomy",
      ),
    ).toBe(false);
  });

  it("captures an error thrown in a Nitro handler, tagged with the request ID", async () => {
    await guest().$fetch("/api/_error-tracking-check", {
      headers: { "x-request-id": "error-tracking-handler" },
      ignoreResponseError: true,
    });

    const event = await sentry.waitForEvent(
      (candidate) => candidate.tags?.requestId === "error-tracking-handler",
    );

    expect(event.exception?.values?.at(-1)?.value).toBe("handler exploded");
  });

  it("captures an error that Nitro reports without a request, such as an unhandled rejection", async () => {
    await guest().$fetch("/api/_eventless-error-check");

    await sentry.waitForEvent((candidate) => candidate.exception?.values?.at(-1)?.value === "eventless probe exploded");
  });

  it("sends only the method and the path of the request, never its headers, cookies, query or body", async () => {
    const secrets = {
      cookie: "better-auth.session_token=ops02-session",
      authorization: "Bearer nxk_ops02",
      "x-api-key": "ops02-key",
    };

    await fetch(url("/api/_error-tracking-check?code=ops02-code"), {
      headers: { ...secrets, "x-request-id": "error-tracking-request-data" },
    });
    await fetch(url("/api/trpc/_errorLeakCheck.mutation"), {
      method: "POST",
      headers: { cookie: secrets.cookie, "content-type": "application/json", "x-request-id": "error-tracking-request-body" },
      body: JSON.stringify({ json: { kind: "plain", password: "ops02-password" } }),
    });

    const events = await Promise.all(
      ["error-tracking-request-data", "error-tracking-request-body"].map((requestId) =>
        sentry.waitForEvent((candidate) => candidate.tags?.requestId === requestId),
      ),
    );

    expect(events.map(({ request }) => Object.keys(request ?? {}).sort())).toEqual([
      ["method", "url"],
      ["method", "url"],
    ]);
    expect(events.map(({ request }) => [request?.method, new URL(request?.url ?? "").pathname])).toEqual([
      ["GET", "/api/_error-tracking-check"],
      ["POST", "/api/trpc/_errorLeakCheck.mutation"],
    ]);
    expect(JSON.stringify(events)).not.toMatch(/ops02-(session|code|key|password)|nxk_ops02/);
  });

  it("logs and reports an error that Better Auth logs, such as a failed auth mail after the response", async () => {
    clearServerLogs();
    await guest().$fetch("/api/_auth-background-failure-check", { headers: { "x-request-id": "auth-background-failure" } });

    const event = await sentry.waitForEvent((candidate) => candidate.exception?.values?.at(-1)?.value === "auth mail exploded");
    expect(event).toBeDefined();

    const line = await vi.waitFor(() => {
      const found = getServerLogs().find((entry) => entry.includes('"tag":"auth"'));
      expect(found).toBeDefined();

      return JSON.parse(found ?? "{}") as { level: string; msg: string; err?: { message: string } };
    });

    expect(line.level).toBe("error");
    expect(line.msg).toContain("Failed to run background task");
    expect(line.err?.message).toBe("auth mail exploded");
  });

  it("logs and reports a background task that Better Auth hands over without a catch", async () => {
    clearServerLogs();
    await guest().$fetch("/api/_auth-background-rejection-check");

    const event = await sentry.waitForEvent((candidate) => candidate.exception?.values?.at(-1)?.value === "auth task rejected");
    expect(event).toBeDefined();

    const line = await vi.waitFor(() => {
      const found = getServerLogs().find((entry) => entry.includes("auth task rejected"));
      expect(found).toBeDefined();

      return JSON.parse(found ?? "{}") as { level: string; msg: string };
    });

    expect(line.level).toBe("error");
    expect(line.msg).toContain("Failed to run background task");
  });

  it("allows the page to connect to a DSN set only at runtime", async () => {
    const response = await fetch(url("/"));
    const connectSrc = response.headers
      .get("content-security-policy")
      ?.split(";")
      .map((part) => part.trim())
      .find((part) => part.startsWith("connect-src "));

    expect(connectSrc?.split(" ")).toContain(new URL(sentry.dsn).origin);
  });
});
