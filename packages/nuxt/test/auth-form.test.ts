import { describe, it } from "vitest";
import { url } from "@nuxt/test-utils/e2e";
import { button, expect, expectAccessible, expectMailSent, fakeFetch, text, totpCode, visit } from "@nuxvel/nuxt/testing";
import postgres from "postgres";
import { userFactory } from "../../../playground/server/factories/users.factory";
import { postJson, signUpWithTwoFactor } from "./helpers/auth-flows";
import { setupPlayground } from "./helpers/playground";

describe("<AuthForm> on the playground's sign-up and sign-in pages", async () => {
  await setupPlayground({
    browser: true,
    env: {
      NUXT_PUBLIC_SOCIAL_PROVIDERS: '["github"]',
      NUXT_AUTH: JSON.stringify({ github: { clientId: "fake-github-client", clientSecret: "fake-github-secret" } }),
    },
  });

  it("signs a new user up and opens /", async () => {
    const page = await visit("/sign-up");
    await expectAccessible(page);

    await page.getByLabel("Name").fill("Form User");
    await page.getByLabel("Email").fill("auth-form-sign-up@example.com");
    await page.getByLabel("Password").fill("correct-horse-battery-staple");
    await page.getByRole("button", { name: "Sign up" }).click();

    await page.waitForURL(url("/"));
  });

  it("signs a new user up on /zh in Chinese and opens /zh", async () => {
    const page = await visit("/zh/sign-up");

    await page.getByLabel("姓名").fill("Form User");
    await page.getByLabel("电子邮件").fill("auth-form-sign-up-zh@example.com");
    await page.getByLabel("密码").fill("correct-horse-battery-staple");
    await page.getByRole("button", { name: "注册" }).click();

    await page.waitForURL(url("/zh"));
  });

  it("shows Better Auth's refusal of a wrong password above the button", async () => {
    const page = await visit("/sign-in");

    await page.getByLabel("Email").fill("auth-form-nobody@example.com");
    await page.getByLabel("Password").fill("wrong-password");
    await page.getByRole("button", { name: "Sign in" }).click();

    await page.locator("[data-slot=title]", { hasText: "Invalid email or password" }).waitFor();
    expect(new URL(page.url()).pathname).toBe("/sign-in");
    await expectAccessible(page);
  });

  it("asks a user with two-factor sign-in on for a code after the password", async () => {
    const email = "auth-form-two-factor@example.com";
    const { totpURI } = await signUpWithTwoFactor(email, "correct-horse-battery-staple");
    const page = await visit("/sign-in");

    await page.getByLabel("Email").fill(email);
    await page.getByLabel("Password").fill("correct-horse-battery-staple");
    await page.getByRole("button", { name: "Sign in" }).click();
    await page.getByLabel("Authentication code").fill(totpCode(totpURI));
    await page.mouse.move(0, 0);
    await expectAccessible(page);
    await page.getByRole("button", { name: "Verify" }).click();

    await page.waitForURL(url("/"));
  });

  it("asks a user with two-factor sign-in on for a code after a social sign-in", async () => {
    const email = "auth-form-social-two-factor@example.com";
    const { totpURI } = await signUpWithTwoFactor(email, "correct-horse-battery-staple");
    const sql = postgres(process.env.NUXT_DATABASE_URL ?? "", { max: 1 });

    try {
      await sql`update "user" set email_verified = true where email = ${email}`;
    } finally {
      await sql.end();
    }

    await fakeFetch({
      "https://github.com/login/oauth/access_token": { body: { access_token: "gho_fake", token_type: "bearer", scope: "user:email" } },
      "https://api.github.com/user": { body: { id: 4242, login: "ada", name: "Ada", email, avatar_url: "https://avatars.githubusercontent.com/u/4242" } },
      "https://api.github.com/user/emails": { body: [{ email, primary: true, verified: true }] },
    });

    const page = await visit("/sign-in");
    const start = await page.request.post(url("/api/auth/sign-in/social"), {
      data: { provider: "github", callbackURL: "/" },
      headers: { origin: new URL(url("/")).origin },
    });
    const { url: authorize }: { url: string } = await start.json();
    const state = new URL(authorize).searchParams.get("state") ?? "";

    await page.goto(url(`/api/auth/callback/github?code=fake-code&state=${state}`), { waitUntil: "hydration" });
    await page.getByLabel("Authentication code").fill(totpCode(totpURI));
    await page.getByRole("button", { name: "Verify" }).click();
    await page.waitForURL(url("/"));

    const session = await page.request.get(url("/api/auth/get-session")).then((response) => response.json());

    expect(session.session.twoFactorVerified).toBe(true);
  });

  it("resets a forgotten password through the forgot-password and reset-password pages", async () => {
    const email = "auth-form-forgetful@example.com";

    await postJson("/api/auth/sign-up/email", { name: "Ada", email, password: "correct-horse-battery-staple" });

    const page = await visit("/sign-in");

    await page.getByRole("link", { name: "Forgot your password?" }).click();
    await page.waitForURL(url("/forgot-password"));
    await page.getByLabel("Email").fill(email);
    await page.getByRole("button", { name: "Send reset link" }).click();
    await page.getByText("Check your inbox").waitFor();
    await expectAccessible(page);

    const { url: resetLink } = await expectMailSent("nuxvel.auth.reset-password", { to: email });
    const resetPage = await visit(resetLink);

    await resetPage.getByLabel("New password").fill("a-brand-new-long-passphrase");
    await expectAccessible(resetPage);
    await resetPage.getByRole("button", { name: "Set new password" }).click();
    await resetPage.waitForURL(url("/sign-in"));

    expect((await postJson("/api/auth/sign-in/email", { email, password: "a-brand-new-long-passphrase" })).status).toBe(200);
  });

  it("renders the verify-email page with a way to send the link again", async () => {
    const page = await visit("/verify-email?email=waiting%40example.com");

    await expect(text(page, "waiting@example.com")).toBeVisible();
    await expect(button(page, "Send the link again")).toBeVisible();
  });

  it("sends the link again from the verify-email page", async () => {
    const user = await userFactory({ email: "resend-link@example.com", emailVerified: false });
    const page = await visit("/verify-email?email=resend-link%40example.com");

    await button(page, "Send the link again").click();

    await expect(text(page, "A new link is on its way")).toBeVisible();
    await expectMailSent("nuxvel.auth.verify-email", { to: user.email });
  });
});
