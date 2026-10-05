import { createServer, type Server } from "node:http";
import { once } from "node:events";
import { url } from "@nuxt/test-utils/e2e";
import { expect } from "@nuxvel/nuxt/testing";
import { createTRPCClient, TRPCClientError } from "@trpc/client";
import { afterAll, describe, it } from "vitest";
import { createTrpcClientLink } from "../src/runtime/shared/trpc/client-link";
import { isNetworkError } from "../src/runtime/app/trpc/is-network-error";
import type { AppRouter } from "../src/runtime/server/trpc/router";
import { setupPlayground } from "./helpers/playground";

const friendly = "Can't reach the server. Check your connection and try again.";

function clientAt(base: string) {
  return createTRPCClient<AppRouter>({ links: [createTrpcClientLink<AppRouter>(`${base}/api/trpc`)] });
}

async function failureOf(call: Promise<unknown>) {
  const error = await call.then(() => undefined, (failure: unknown) => failure);
  if (!(error instanceof TRPCClientError)) throw new Error("the call did not fail with a TRPCClientError");
  return { message: error.message, code: error.data?.code, shapeMessage: error.shape?.message, networkError: isNetworkError(error) };
}

async function listen(server: Server) {
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  return `http://127.0.0.1:${typeof address === "object" && address ? address.port : 0}`;
}

describe("a tRPC call that gets no tRPC answer", async () => {
  await setupPlayground();

  const proxy = createServer((request, response) => {
    if (request.url?.includes("health.now")) {
      response.writeHead(504).end();
      return;
    }
    response.writeHead(502, { "content-type": "text/html" }).end("<!DOCTYPE html><h1>502 Bad Gateway</h1>");
  });
  const proxyUrl = await listen(proxy);
  afterAll(() => new Promise((resolve) => proxy.close(resolve)));

  it("fails with NETWORK_ERROR and a clear message when a proxy answers with an HTML 502", async () => {
    expect(await failureOf(clientAt(proxyUrl).health.ping.query())).toEqual({ message: friendly, code: "NETWORK_ERROR", shapeMessage: friendly, networkError: true });
  });

  it("fails with NETWORK_ERROR when a proxy answers with an empty 504", async () => {
    expect(await failureOf(clientAt(proxyUrl).health.now.query())).toMatchObject({ message: friendly, code: "NETWORK_ERROR" });
  });

  it("fails with NETWORK_ERROR when the server cannot be reached", async () => {
    const closed = createServer();
    const closedUrl = await listen(closed);
    await new Promise((resolve) => closed.close(resolve));

    expect(await failureOf(clientAt(closedUrl).health.echo.mutate("hi"))).toMatchObject({ message: friendly, code: "NETWORK_ERROR" });
  });

  it("keeps the code and message of a real tRPC error", async () => {
    const client = clientAt(url("/").replace(/\/$/, ""));

    expect(await failureOf(client.health.missing.query())).toMatchObject({ message: "procedure found nothing", code: "NOT_FOUND", networkError: false });
    expect((await failureOf(client.health.explode.query())).code).toBe("INTERNAL_SERVER_ERROR");
  });
});
