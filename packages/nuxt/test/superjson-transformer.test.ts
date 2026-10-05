import { expect, guest } from "@nuxvel/nuxt/testing";
import { describe, it } from "vitest";
import { url } from "@nuxt/test-utils/e2e";
import { createTRPCClient } from "@trpc/client";
import { createTrpcClientLink } from "../src/runtime/shared/trpc/client-link";
import type { AppRouter } from "../src/runtime/server/trpc/router";
import { setupPlayground } from "./helpers/playground";

describe("superjson transformer", async () => {
  await setupPlayground();

  it("keeps a real Date through the in-process caller", async () => {
    const body = await guest().$fetch("/api/_trpc-superjson-check");
    expect(body.isDate).toBe(true);
  });

  it("round-trips a Date over HTTP through the client link factory", async () => {
    const client = createTRPCClient<AppRouter>({
      links: [createTrpcClientLink<AppRouter>(url("/api/trpc"))],
    });

    const result = await client.health.now.query();

    expect(result.at).toBeInstanceOf(Date);
  });
});
