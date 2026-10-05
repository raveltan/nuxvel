import { randomUUID } from "node:crypto";
import { expect, guest } from "@nuxvel/nuxt/testing";
import { describe, it, vi } from "vitest";
import { getServerLogs } from "@nuxt/test-utils/e2e";
import type { EntrySummary } from "../../src/runtime/shared/devtools/sections/requests";
import { readDevtoolsSections, readySection } from "../helpers/devtools-sections";

type LogLine = { level: string; tag: string; path: string; status: number; requestId: string };

function requestLines(requestId: string, path: string) {
  return getServerLogs()
    .filter((line) => line.startsWith("{"))
    .map((line) => JSON.parse(line) as LogLine)
    .filter((line) => line.tag === "request" && line.level === "info" && line.requestId === requestId && line.path === path);
}

async function failingRequest(path: string, init: RequestInit = {}) {
  const response = await guest().fetch(path, init);
  const id = response.headers.get("x-nuxvel-debug-id");

  await response.text();
  if (!id) throw new Error(`${path} answered without an X-Nuxvel-Debug-Id header`);

  return { status: response.status, id };
}

async function expectLoggedAndListed(path: string, init: RequestInit, status: number) {
  const response = await failingRequest(path, init);
  const [pathname = ""] = path.split("?");

  expect(response.status).toBe(status);
  await vi.waitFor(() => expect(requestLines(response.id, pathname)).toHaveLength(1));
  expect(requestLines(response.id, pathname)[0]).toMatchObject({ status });

  const { results } = await readDevtoolsSections();

  expect(readySection<EntrySummary[]>(results, "requests")).toContainEqual(
    expect.objectContaining({ id: response.id, label: `GET ${pathname}`, status }),
  );

  return response.id;
}

describe("a request that ends in an error", () => {
  it("logs and collects a route's thrown 404", async () => {
    const id = await expectLoggedAndListed(
      "/api/_taxonomy-status-check?name=NotFoundError",
      { headers: { "x-request-id": "request-errors-not-found" } },
      404,
    );

    expect(id).toBe("request-errors-not-found");
  });

  it("logs and collects a missing page, with its error render under the page's id", async () => {
    const id = await expectLoggedAndListed("/request-errors-missing-page", { headers: { accept: "text/html" } }, 404);
    const { results } = await readDevtoolsSections();
    const entries = readySection<EntrySummary[]>(results, "requests");

    expect(entries.some((entry) => entry.label.startsWith("GET /__nuxt_error"))).toBe(false);
    await vi.waitFor(() => expect(requestLines(id, "/__nuxt_error")).toHaveLength(1));
  });

  it("logs and collects a route's thrown 500", async () => {
    await expectLoggedAndListed("/api/_error-tracking-check", { headers: { "x-request-id": "request-errors-500" } }, 500);
  });
});

type ErrorCause = { name: string; message: string; stack?: string; cause?: ErrorCause | string };
type ErrorSpan = {
  type: string;
  summary: string;
  data: { level?: string; message?: string; stack?: string; cause?: ErrorCause | string; hint?: string };
};

async function devtoolsEntry(id: string) {
  let spans: ErrorSpan[] | undefined;

  await expect
    .poll(async () => {
      const response = await guest().fetch(`/_nuxvel/devtools/api/entries/${encodeURIComponent(id)}`);
      spans = response.ok ? ((await response.json()) as { spans: ErrorSpan[] }).spans : undefined;
      return spans;
    })
    .toBeDefined();

  return spans ?? [];
}

const internalFailures: Record<string, string> = {
  "a tRPC query": `/api/trpc/_errorLeakCheck.query?input=${encodeURIComponent(JSON.stringify({ json: { kind: "plain" } }))}`,
  "a REST call": "/api/v1/_error-leak/plain",
  "a plain /api route": "/api/_error-leak-check?kind=plain",
};

describe("an internal error in development", () => {
  it.for(Object.entries(internalFailures))(
    "answers %s like production, and keeps the real error in the log and the DevTools entry of its request id",
    async ([, path]) => {
      const requestId = `dev-leak-${randomUUID()}`;
      const response = await guest().fetch(path, { headers: { "x-request-id": requestId } });
      const body = await response.text();

      expect(response.status).toBe(500);
      expect(body).toContain(`Something went wrong (ref: ${requestId})`);
      expect(body).not.toMatch(/leak_probe_secret|"stack"/);

      await vi.waitFor(() => {
        const logged = getServerLogs().filter((line) => line.startsWith("{") && line.includes(requestId));

        expect(logged.some((line) => JSON.parse(line).level === "error" && /leak_probe_secret/.test(line))).toBe(true);
      });

      expect(await devtoolsEntry(requestId)).toContainEqual(
        expect.objectContaining({
          type: "error",
          data: expect.objectContaining({
            message: expect.stringContaining("leak_probe_secret"),
            stack: expect.stringContaining("leak_probe_secret"),
          }),
        }),
      );
    },
  );
});

function causeChain(cause: ErrorCause | string | undefined): (ErrorCause | string)[] {
  return cause === undefined ? [] : [cause, ...(typeof cause === "string" ? [] : causeChain(cause.cause))];
}

const missingTableFailures: Record<string, string> = {
  "a tRPC query": `/api/trpc/_errorLeakCheck.query?input=${encodeURIComponent(JSON.stringify({ json: { kind: "postgres" } }))}`,
  "a plain /api route": "/api/_error-leak-check?kind=postgres",
};

describe("a failed query in development", () => {
  it.for(Object.entries(missingTableFailures))(
    "keeps the Postgres error of %s in the cause chain of the DevTools error span, without the bound parameters",
    async ([, path]) => {
      const requestId = `dev-cause-${randomUUID()}`;

      expect((await guest().fetch(path, { headers: { "x-request-id": requestId } })).status).toBe(500);

      const errorSpan = (await devtoolsEntry(requestId)).find((span) => span.type === "error");
      const postgresError = causeChain(errorSpan?.data.cause).find(
        (cause): cause is ErrorCause => typeof cause !== "string" && cause.name === "PostgresError",
      );

      expect(postgresError).toMatchObject({
        message: 'relation "leak_probe_secret_table" does not exist',
        stack: expect.stringContaining("PostgresError"),
      });
      expect(errorSpan?.summary).toContain('caused by PostgresError: relation "leak_probe_secret_table" does not exist');
      expect(JSON.stringify(errorSpan)).not.toContain("leak_bound_param");
    },
  );

  it.for(Object.entries(missingTableFailures))(
    "hints at db:generate and db:migrate for the missing table of %s, in the log line and the DevTools error span",
    async ([, path]) => {
      const requestId = `dev-hint-${randomUUID()}`;

      await (await guest().fetch(path, { headers: { "x-request-id": requestId } })).text();

      const errorLine = await vi.waitFor(() => {
        const line = getServerLogs()
          .filter((logged) => logged.startsWith("{") && logged.includes(requestId))
          .map((logged) => JSON.parse(logged) as { level: string; hint?: string })
          .find((logged) => logged.level === "error");

        expect(line).toBeDefined();

        return line;
      });
      const errorSpan = (await devtoolsEntry(requestId)).find((span) => span.type === "error");

      expect(errorLine?.hint).toMatch(/nuxvel db:generate.*nuxvel db:migrate/);
      expect(errorSpan?.data.hint).toBe(errorLine?.hint);
    },
  );

  it("gives no migration hint for an error that is not about the schema", async () => {
    const requestId = `dev-no-hint-${randomUUID()}`;

    await (await guest().fetch("/api/_error-leak-check?kind=plain", { headers: { "x-request-id": requestId } })).text();

    const errorSpan = (await devtoolsEntry(requestId)).find((span) => span.type === "error");

    const logged = await vi.waitFor(() => {
      const lines = getServerLogs().filter((line) => line.includes(requestId) && line.includes('"level":"error"'));

      expect(lines).not.toHaveLength(0);

      return lines.join("\n");
    });

    expect(errorSpan?.data).not.toHaveProperty("hint");
    expect(logged).not.toContain("db:generate");
  });
});

describe("the DevTools entry of a route that fails", () => {
  it("keeps the failure line, the access line and the N+1 warning, and the terminal lines keep the request id", async () => {
    const requestId = `failed-entry-${randomUUID()}`;
    const response = await guest().fetch("/api/_failing-n-plus-one-check", { headers: { "x-request-id": requestId } });

    await response.text();
    expect(response.status).toBe(500);

    const logs = (await devtoolsEntry(requestId)).filter((span) => span.type === "log").map((span) => span.data);

    expect(logs).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ level: "error", message: expect.stringContaining("GET /api/_failing-n-plus-one-check failed") }),
        expect.objectContaining({ level: "info", message: expect.stringContaining("GET /api/_failing-n-plus-one-check 500") }),
        expect.objectContaining({ level: "warn", message: expect.stringContaining("N+1 suspected in GET /api/_failing-n-plus-one-check") }),
      ]),
    );

    const lines = getServerLogs()
      .filter((line) => line.startsWith("{") && line.includes("_failing-n-plus-one-check"))
      .map((line) => JSON.parse(line) as { msg: string; requestId?: string });

    for (const msg of ["failed", "500", "N+1 suspected"]) {
      expect(lines.find((line) => line.msg.includes(msg) && line.requestId === requestId)).toBeDefined();
    }
  });
});

describe("a taxonomy 4xx from a route in development", () => {
  async function warnLine(path: string, requestId: string) {
    const response = await guest().fetch(path, { headers: { "x-request-id": requestId } });

    await response.text();

    return vi.waitFor(() => {
      const line = getServerLogs()
        .filter((logged) => logged.startsWith("{") && logged.includes(requestId))
        .map((logged) => JSON.parse(logged) as Record<string, unknown>)
        .find((logged) => logged.level === "warn" && logged.tag === "request");

      if (!line) throw new Error(`no warn line for ${requestId}`);

      return line;
    });
  }

  it("logs it at warn, with its code and message", async () => {
    const requestId = `dev-4xx-${randomUUID()}`;

    expect(await warnLine("/api/_taxonomy-status-check?name=NotFoundError", requestId)).toMatchObject({
      msg: "GET /api/_taxonomy-status-check failed with NOT_FOUND: handler found nothing",
      code: "NOT_FOUND",
      requestId,
    });
  });

  it("logs a validation error at warn, with its fields", async () => {
    const requestId = `dev-4xx-${randomUUID()}`;

    expect(await warnLine("/api/_fetch-error-upstream?status=abc", requestId)).toMatchObject({
      code: "BAD_REQUEST",
      fields: { status: [expect.any(String)] },
      requestId,
    });
  });
});
