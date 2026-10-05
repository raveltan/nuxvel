import { describe, it } from "vitest";
import { url } from "@nuxt/test-utils/e2e";
import { actingAs, expect, expectAccessible, guest } from "@nuxvel/nuxt/testing";
import { userFactory } from "../../../playground/server/factories/users.factory";
import { setupPlayground } from "./helpers/playground";

describe("<NotificationBell>", async () => {
  await setupPlayground({ browser: true });

  it("shows a notification sent on the server without a reload, and opening it clears the badge", async () => {
    const page = await actingAs(await userFactory({ email: "notification-bell@example.com" })).visit("/");
    const connected = page.waitForResponse((response) => response.url().includes("/api/channels"));
    await page.goto(url("/profile"), { waitUntil: "hydration" });
    await connected;
    await page.evaluate(() => Object.assign(window, { loadedOnce: true }));
    const userId = await page.evaluate(async () => {
      const session: { user: { id: string } } = await (await fetch("/api/auth/get-session")).json();
      return session.user.id;
    });

    await page.getByRole("button", { name: "Notifications", exact: true }).waitFor();
    await guest().$fetch("/api/_notify-send", { query: { userId, name: "Ada" } });

    const bell = page.getByRole("button", { name: "Notifications, 1 unread" });
    await bell.click();
    const notification = page.getByRole("link", { name: /Welcome, Ada \(unread\)/ });
    await notification.waitFor();
    await expect.poll(() => page.getByText(/seconds? ago|now/).count()).toBeGreaterThan(0);
    await expectAccessible(page);

    await notification.click();

    await page.getByRole("button", { name: "Notifications", exact: true }).waitFor();
    expect(await page.evaluate(() => "loadedOnce" in window)).toBe(true);
  });
});
