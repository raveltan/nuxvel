import { expect } from "@nuxvel/nuxt/testing";
import { describe, it, onTestFinished, vi } from "vitest";
import { startSecondServer } from "./helpers/second-server";

describe("pm2 ready message", () => {
  it("tells pm2 the server is ready once it listens, so wait_ready holds traffic until then", { timeout: 40_000 }, async () => {
    const server = await startSecondServer({ env: { pm_id: "0" } });
    onTestFinished(() => server.stop());

    await vi.waitFor(() => expect(server.messages()).toEqual(["ready"]));
  });

  it("sends nothing outside pm2", { timeout: 40_000 }, async () => {
    const server = await startSecondServer();
    onTestFinished(() => server.stop());

    expect(server.messages()).toEqual([]);
  });
});
