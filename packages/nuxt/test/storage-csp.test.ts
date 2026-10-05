import { expect } from "@nuxvel/nuxt/testing";
import { describe, it, onTestFinished } from "vitest";
import { startSecondServer } from "./helpers/second-server";

describe("uploads and the Content Security Policy", () => {
  it("lets the page connect to the NUXT_STORAGE_PUBLIC_URL origin set at runtime, where the browser sends its uploads", { timeout: 40_000 }, async () => {
    const server = await startSecondServer({ env: { NUXT_STORAGE_PUBLIC_URL: "https://files.example.test/" } });
    onTestFinished(() => server.stop());

    const policy = (await fetch(server.url)).headers.get("content-security-policy") ?? "";
    const connectSrc = policy.split(";").find((part) => part.trim().startsWith("connect-src"));

    expect(connectSrc).toContain(" https://files.example.test");
  });
});
