import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { button, expect, guest, visit } from "@nuxvel/nuxt/testing";
import { describe, it } from "vitest";
import { getServerLogs, startServer, stopServer, url } from "@nuxt/test-utils/e2e";
import { BUILD_DSN } from "./dotenv";

export const githubSignIn = {
  nuxvel: { auth: { social: { github: true } } },
  env: { NUXT_AUTH_GITHUB_CLIENT_ID: "fake-github-client", NUXT_AUTH_GITHUB_CLIENT_SECRET: "fake-github-secret" },
};

export function addSocialSignIn(appDir: string) {
  mkdirSync(join(appDir, "app", "pages"), { recursive: true });
  writeFileSync(join(appDir, "app", "pages", "index.vue"), "<template><SocialSignIn /></template>\n");
}

describe("social sign-in with github turned on", () => {
  it("redirects to GitHub's authorize page with the client ID and the callback route", async () => {
    const origin = new URL(url("/")).origin;
    const response = await guest().fetch("/api/auth/sign-in/social", {
      method: "POST",
      headers: { "content-type": "application/json", origin },
      body: JSON.stringify({ provider: "github", callbackURL: "/" }),
    });

    expect(response.status).toBe(200);

    const body = await response.json();
    const authorize = new URL(body.url);

    expect(body.redirect).toBe(true);
    expect(response.headers.get("location")).toBe(body.url);
    expect(authorize.origin + authorize.pathname).toBe("https://github.com/login/oauth/authorize");
    expect(authorize.searchParams.get("client_id")).toBe("fake-github-client");
    expect(authorize.searchParams.get("redirect_uri")).toBe(`${origin}/api/auth/callback/github`);
    expect(authorize.searchParams.get("state")).toBeTruthy();
  });

  it("shows a GitHub button in <SocialSignIn>", async () => {
    const page = await visit("/", { allowFailedRequests: [`${new URL(BUILD_DSN).origin}/**`] });

    await expect(button(page, "Continue with GitHub")).toBeVisible();
  });

  it("boots in production in a test build without the provider's client credentials", async () => {
    await stopServer();

    try {
      await startServer({
        env: { NODE_ENV: "production", NUXT_AUTH_GITHUB_CLIENT_ID: "", NUXT_AUTH_GITHUB_CLIENT_SECRET: "" },
      });

      expect((await guest().fetch("/")).status).toBe(200);
    } finally {
      await stopServer();
      await startServer();
    }
  }, 120000);

  it("refuses to boot in production without the provider's client secret, naming it", async () => {
    await stopServer();

    try {
      await expect(
        startServer({
          env: { NODE_ENV: "production", NUXT_AUTH_REQUIRE_SOCIAL_CREDENTIALS: "true", NUXT_AUTH_GITHUB_CLIENT_SECRET: "" },
        }),
      ).rejects.toThrow();

      const logs = getServerLogs().join("\n");

      expect(logs).toContain("NUXT_AUTH_GITHUB_CLIENT_SECRET: Required in production");
      expect(logs).not.toContain("NUXT_AUTH_GITHUB_CLIENT_ID: Required in production");
    } finally {
      await startServer();
    }
  }, 120000);
});
