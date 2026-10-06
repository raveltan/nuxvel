import { button, expect, expectMailSent, expectNoSmoke, expectRow, fillForm, heading, link, text, visit } from "@nuxvel/nuxt/testing";
import { describe, it } from "vitest";
import { userTable } from "#nuxvel/schema";
import { userFactory } from "#nuxvel/factories";

describe("the app in a browser", () => {
  it("signs a new user up and shows them as signed in on the home page", async () => {
    const email = "ada@example.com";

    const page = await visit({ name: "sign-up" });
    await fillForm(page, { Name: "Ada", Email: email, Password: "correct-horse-battery" });
    await button(page, "Sign up").click();

    await expect(text(page, `Signed in as ${email}.`)).toBeVisible();
    await expectRow(userTable, { email, name: "Ada" });
  });

  it("resets a forgotten password with the link of the mail and signs in with the new one", async () => {
    const email = "grace@example.com";
    await userFactory.withPassword("correct-horse-battery")({ name: "Grace", email });

    const page = await visit({ name: "sign-in" });
    await link(page, "Forgot your password?").click();
    await expect(heading(page, "Reset your password")).toBeVisible();
    await fillForm(page, { Email: email });
    await button(page, "Send reset link").click();
    await expect(text(page, "Check your inbox")).toBeVisible();

    const { url } = await expectMailSent("nuxvel.auth.reset-password", { to: email });
    const resetPage = await visit(url);
    await expect(heading(resetPage, "Choose a new password")).toBeVisible();
    await fillForm(resetPage, { "New password": "a-brand-new-passphrase" });
    await button(resetPage, "Set new password").click();
    await expect(heading(resetPage, "Sign in")).toBeVisible();

    await fillForm(resetPage, { Email: email, Password: "a-brand-new-passphrase" });
    await button(resetPage, "Sign in").click();
    await expect(text(resetPage, `Signed in as ${email}.`)).toBeVisible();
  });

  it("shows the request ID on the page of a missing path and leads back home", async () => {
    const page = await visit("/no-such-page", { status: 404, extraHTTPHeaders: { "x-request-id": "req-7f3a" } });

    await expect(heading(page, "Page not found")).toBeVisible();
    await expect(text(page, "/no-such-page")).toBeVisible();
    await expect(text(page, "Request ID: req-7f3a")).toBeVisible();

    await button(page, "Go home").click();
    await expect(heading(page, "Welcome to nuxvel")).toBeVisible();
  });

  it("opens each page without errors", async () => {
    await expectNoSmoke();
  }, 60_000);
});
