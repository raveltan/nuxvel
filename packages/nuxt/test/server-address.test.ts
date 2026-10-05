import { expect } from "@nuxvel/nuxt/testing";
import { describe, it, onTestFinished, vi } from "vitest";
import { serverAddress } from "../src/testing/server-address";

async function portsOfWorker(pool: string) {
  vi.stubEnv("VITEST_POOL_ID", pool);
  const ports: number[] = [];
  for (let i = 0; i < 20; i++) ports.push((await serverAddress({})).port);
  return ports;
}

describe("the port of a test server", () => {
  it("comes from a block of its own Vitest worker, so two workers never start a server on the same port", async () => {
    onTestFinished(() => vi.unstubAllEnvs());

    const first = await portsOfWorker("1");
    const second = await portsOfWorker("2");

    expect(new Set(first.map((port) => Math.floor(port / 100))).size).toBe(1);
    expect(first.filter((port) => second.includes(port))).toEqual([]);
  });
});
