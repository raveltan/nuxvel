import { describe, it } from "vitest";
import { url } from "@nuxt/test-utils/e2e";
import { expect, expectAccessible, visit } from "@nuxvel/nuxt/testing";
import { setupPlayground } from "./helpers/playground";

describe("playground demo: home and auth", async () => {
  await setupPlayground({
    browser: true,
  });

  it("signs up into the home page, signs out, and sends a signed-out visitor to sign-in", async () => {
    const email = "demo-home-auth@example.com";
    const page = await visit("/sign-up");
    await expectAccessible(page);

    await page.getByLabel("Name").fill("Demo User");
    await page.getByLabel("Email").fill(email);
    await page.getByLabel("Password").fill("correct-horse-battery-staple");
    await page.getByRole("button", { name: "Sign up" }).click();

    await page.waitForURL(url("/"));
    await page.getByText(`Signed in as ${email}`).waitFor();
    await page.getByRole("heading", { name: "Auth" }).waitFor();
    await expectAccessible(page);

    await page.getByRole("button", { name: "Sign out" }).click();
    await page.getByRole("link", { name: "Sign in" }).first().waitFor();

    await page.goto(url("/protected"), { waitUntil: "hydration" });
    expect(new URL(page.url()).pathname).toBe("/sign-in");
    await expectAccessible(page);
  });

  it("signs an existing user back in from the sign-in page", async () => {
    const email = "demo-sign-in@example.com";
    const password = "correct-horse-battery-staple";
    const page = await visit("/sign-in");

    await page.request.post(url("/api/auth/sign-up/email"), {
      data: { name: "Returning User", email, password },
    });
    await page.context().clearCookies();

    await page.getByLabel("Email").fill(email);
    await page.getByLabel("Password").fill(password);
    await page.getByRole("button", { name: "Sign in" }).click();

    await page.waitForURL(url("/"));
    await page.getByText(`Signed in as ${email}`).waitFor();
  });
});
