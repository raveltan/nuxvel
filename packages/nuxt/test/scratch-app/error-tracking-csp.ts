import { expect, guest } from "@nuxvel/nuxt/testing";
import { describe, it } from "vitest";
import { getServerLogs, startServer, stopServer } from "@nuxt/test-utils/e2e";

const RUNTIME_DSN = "http://public@127.0.0.2:9/1";

export const cspWithoutConnectSrc = {
  headers: { contentSecurityPolicy: { "connect-src": false as const, "default-src": ["'self'"] } },
};

function directive(policy: string | null, name: string) {
  return policy
    ?.split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${name} `));
}

async function connectSrc() {
  const response = await guest().fetch("/");

  return directive(response.headers.get("content-security-policy"), "connect-src");
}

describe("error tracking and the Content Security Policy", () => {
  it("adds a build-time DSN's origin, building connect-src from default-src when the policy has none", async () => {
    const response = await guest().fetch("/");
    const policy = response.headers.get("content-security-policy");

    expect(directive(policy, "default-src")).toBe("default-src 'self'");
    expect(directive(policy, "connect-src")).toBe("connect-src 'self' http://127.0.0.1:9");
  });

  it("uses the DSN NUXT_PUBLIC_SENTRY_DSN sets at runtime instead", async () => {
    await stopServer();

    try {
      await startServer({ env: { NUXT_PUBLIC_SENTRY_DSN: RUNTIME_DSN } });

      expect(await connectSrc()).toBe("connect-src 'self' http://127.0.0.2:9");
    } finally {
      await stopServer();
      await startServer();
    }
  }, 120000);

  it("refuses to boot with a malformed DSN, naming the variable", async () => {
    await stopServer();

    try {
      await expect(startServer({ env: { NUXT_PUBLIC_SENTRY_DSN: "not a dsn" } })).rejects.toThrow();
      expect(getServerLogs().join("\n")).toContain("NUXT_PUBLIC_SENTRY_DSN is not a valid DSN URL");
    } finally {
      await startServer();
    }
  }, 120000);
});
