import { useTestContext } from "@nuxt/test-utils/e2e";
import { expect, guest } from "@nuxvel/nuxt/testing";
import { describe, it } from "vitest";

function serverLogs() {
  return useTestContext().serverLogs ?? [];
}

describe("the dev payload size warning", () => {
  it("names the largest queries of a page whose payload passes 100 KB", async () => {
    const from = serverLogs().length;

    expect((await guest().fetch("/_payload-size")).status).toBe(200);

    await expect
      .poll(() => serverLogs().slice(from).some((line) => /The payload of \/_payload-size is \d+ KB, over 100 KB/.test(line)), { timeout: 10_000 })
      .toBe(true);
    expect(serverLogs().slice(from).some((line) => line.includes('"_payloadCheck","large"'))).toBe(true);
  }, 60_000);

  it("stays quiet for a small page", async () => {
    const from = serverLogs().length;

    expect((await guest().fetch("/_trpc-ssr")).status).toBe(200);
    expect((await guest().fetch("/_payload-size")).status).toBe(200);

    await expect.poll(() => serverLogs().slice(from).some((line) => line.includes("The payload of /_payload-size")), { timeout: 10_000 }).toBe(true);
    expect(serverLogs().slice(from).some((line) => line.includes("The payload of /_trpc-ssr"))).toBe(false);
  }, 60_000);
});
