import { expect, guest } from "@nuxvel/nuxt/testing";
import { describe, it } from "vitest";
import { url } from "@nuxt/test-utils/e2e";
import { createTRPCClient } from "@trpc/client";
import { createTrpcClientLink } from "../src/runtime/shared/trpc/client-link";
import type { AppRouter } from "../src/runtime/server/trpc/router";
import { setupPlayground } from "./helpers/playground";

describe("tRPC router auto-discovery", async () => {
  await setupPlayground();

  it("resolves the discovered health.ping procedure through an in-process caller", async () => {
    const body = await guest().$fetch("/api/_trpc-router-check");
    expect(body.ping).toBe("pong");
  });

  it("refuses a batch of more than 10 calls and runs a batch of 10", async () => {
    const batch = (size: number) => guest().fetch(`/api/trpc/${Array(size).fill("health.ping").join(",")}?batch=1`);

    const tooBig = await batch(11);
    expect(tooBig.status).toBe(400);
    expect(await tooBig.text()).toContain("Batch call exceeds maximum size");

    expect((await batch(10)).status).toBe(200);
  });

  it("splits more than 10 parallel calls from the client link into allowed batches", async () => {
    const client = createTRPCClient<AppRouter>({
      links: [createTrpcClientLink<AppRouter>(url("/api/trpc"))],
    });

    const results = await Promise.all(Array.from({ length: 25 }, () => client.health.ping.query()));

    expect(results).toEqual(Array(25).fill("pong"));
  });
});
