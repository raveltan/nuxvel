import { createHmac, randomUUID } from "node:crypto";
import { expect, guest } from "@nuxvel/nuxt/testing";
import { describe, it, vi } from "vitest";
import { getServerLogs } from "@nuxt/test-utils/e2e";
import { setupPlayground } from "./helpers/playground";

const WEBHOOK_SECRET = "error-leak-webhook-secret";
const LEAKED = /leak.probe.secret|pg_sleep|statement timeout|NoSuchKey|specified key|probe webhook handler failed|"stack"|"cause"/i;
const GENERIC = "Something went wrong";

type Send = (kind: string, headers: Record<string, string>) => Promise<Response>;

const trpcInput = (kind: string) => encodeURIComponent(JSON.stringify({ json: { kind } }));

const transports: Record<string, Send> = {
  "a tRPC query": (kind, headers) => guest().fetch(`/api/trpc/_errorLeakCheck.query?input=${trpcInput(kind)}`, { headers }),
  "a tRPC mutation": (kind, headers) =>
    guest().fetch("/api/trpc/_errorLeakCheck.mutation", {
      method: "POST",
      headers: { ...headers, "content-type": "application/json" },
      body: JSON.stringify({ json: { kind } }),
    }),
  "a REST call": (kind, headers) => guest().fetch(`/api/v1/_error-leak/${kind}`, { headers }),
  "a plain /api route": (kind, headers) => guest().fetch(`/api/_error-leak-check?kind=${kind}`, { headers }),
};

async function provoke(send: () => Promise<Response>, requestId: string) {
  const response = await send();

  return { status: response.status, body: await response.text(), requestId };
}

async function expectLogged(requestId: string, level: "error" | "warn", detail: RegExp) {
  await vi.waitFor(() => {
    const line = getServerLogs().find((candidate) => {
      if (!candidate.startsWith("{") || !candidate.includes(requestId) || !detail.test(candidate)) return false;

      return JSON.parse(candidate).level === level;
    });

    expect(line, `a ${level} line for ${requestId} matching ${detail}`).toBeDefined();
  }, { timeout: 10_000 });
}

function expectGeneric({ status, body, requestId }: Awaited<ReturnType<typeof provoke>>) {
  expect(status).toBe(500);
  expect(body).not.toMatch(LEAKED);
  expect(body).toContain(`${GENERIC} (ref: ${requestId})`);
}

describe("internal errors in production", async () => {
  await setupPlayground({ env: { NODE_ENV: "production", NUXT_PROBE_WEBHOOK_SECRET: WEBHOOK_SECRET } });

  it("logs a failed query's SQL without its bound parameters", async () => {
    const requestId = `leak-${randomUUID()}`;

    await provoke(() => guest().fetch("/api/_error-leak-check?kind=postgres", { headers: { "x-request-id": requestId } }), requestId);
    await expectLogged(requestId, "error", /leak_probe_secret_table/);

    const logged = getServerLogs().filter((line) => line.includes(requestId)).join("\n");

    expect(logged).not.toContain("leak_bound_param");
    expect(logged).not.toContain("db:generate");
  });

  it.for(
    Object.entries(transports).flatMap(([transport, send]) =>
      ["plain", "postgres", "upstream", "zod"].map((kind) => ({ transport, send, kind })),
    ),
  )("hides a $kind failure behind a generic message and a ref from $transport, and logs it", async ({ send, kind }) => {
    const requestId = `leak-${randomUUID()}`;

    expectGeneric(await provoke(() => send(kind, { "x-request-id": requestId }), requestId));
    await expectLogged(requestId, "error", /leak_probe_secret/);
  });

  it.for(Object.entries(transports))(
    "answers a transient database failure from %s with 503, its own message and the request id, and logs the detail",
    async ([, send]) => {
      const requestId = `leak-${randomUUID()}`;
      const { status, body } = await provoke(() => send("transient", { "x-request-id": requestId }), requestId);

      expect(status).toBe(503);
      expect(body).not.toMatch(LEAKED);
      expect(body).toContain("The database is briefly unavailable (57014), try again");
      expect(body).toContain(requestId);
      await expectLogged(requestId, "warn", /statement timeout/);
    },
  );

  it("hides the message of an UnknownError", async () => {
    const requestId = `leak-${randomUUID()}`;

    expectGeneric(await provoke(() => guest().fetch("/api/trpc/_errorLeakCheck.unknown", { headers: { "x-request-id": requestId } }), requestId));
    await expectLogged(requestId, "error", /leak_probe_secret in an UnknownError/);
  });

  it("hides a storage failure", async () => {
    const requestId = `leak-${randomUUID()}`;
    const send = () =>
      guest().fetch("/api/trpc/_errorLeakCheck.copyMissingObject", {
        method: "POST",
        headers: { "x-request-id": requestId, "content-type": "application/json" },
        body: JSON.stringify({ json: null }),
      });

    expectGeneric(await provoke(send, requestId));
    await expectLogged(requestId, "error", /copyMissingObject failed/);
  });

  it("hides a failing webhook handler", async () => {
    const requestId = `leak-${randomUUID()}`;
    const body = JSON.stringify({ id: `evt_${requestId}`, type: "probe.failing" });
    const send = () =>
      guest().fetch("/api/webhooks/_probe", {
        method: "POST",
        headers: {
          "x-request-id": requestId,
          "content-type": "application/json",
          "x-probe-signature": createHmac("sha256", WEBHOOK_SECRET).update(body).digest("hex"),
        },
        body,
      });

    expectGeneric(await provoke(send, requestId));
    await expectLogged(requestId, "error", /probe webhook handler failed/);
  });

  it.for(["plain", "upstream"])("renders the error page for a %s failure during SSR with a generic message and a ref", async (kind) => {
    const requestId = `leak-${randomUUID()}`;
    const send = () => guest().fetch(`/_error-leak?kind=${kind}`, { headers: { accept: "text/html", "x-request-id": requestId } });

    expectGeneric(await provoke(send, requestId));
    await expectLogged(requestId, "error", /leak_probe_secret/);
  });
});
