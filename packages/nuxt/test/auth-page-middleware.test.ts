import { actingAs, expect, guest } from "@nuxvel/nuxt/testing";
import { describe, it } from "vitest";
import { userFactory } from "../../../playground/server/factories/users.factory";
import { setupPlayground } from "./helpers/playground";

describe("auth page middleware", async () => {
  await setupPlayground();

  it("redirects a signed-out visitor from an auth-gated page to the configured sign-in path", async () => {
    const response = await guest().fetch("/protected");

    expect(response.status).toBe(200);
    expect(new URL(response.url).pathname).toBe("/sign-in");
  });

  it("keeps the locale of the page in the redirects of the auth and guest middleware", async () => {
    const user = await userFactory({ email: "auth-page-middleware-zh@example.com", name: "Test User" });

    const signedOut = await guest().fetch("/zh/protected", { redirect: "manual" });
    const signedIn = await actingAs(user).fetch("/zh/sign-in", { redirect: "manual" });

    expect(signedOut.headers.get("location")).toBe("/zh/sign-in");
    expect(signedIn.headers.get("location")).toBe("/zh");
  });

  it("renders an auth-gated page when signed in", async () => {
    const email = "auth-page-middleware@example.com";
    const user = await userFactory({ email, name: "Test User" });

    const response = await actingAs(user).fetch("/protected");

    expect(response.status).toBe(200);
    expect(new URL(response.url).pathname).toBe("/protected");
  });

  it("renders the signed-in user's markup on the server", async () => {
    const email = "auth-ssr-markup@example.com";
    const user = await userFactory({ email, name: "SSR User" });

    const html = await (await actingAs(user).fetch("/")).text();

    expect(html).toContain(`Signed in as ${email}`);
  });
});
