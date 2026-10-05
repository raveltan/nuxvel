import type { Meta, StoryObj } from "@storybook-vue/nuxt";
import { mockUser } from "@nuxvel/nuxt/storybook/mocks";
import { button, expect, menu, menuitem, page } from "@nuxvel/nuxt/storybook/test";
import { http, HttpResponse } from "msw";
import UserMenu from "./UserMenu.vue";

const meta = { component: UserMenu } satisfies Meta<typeof UserMenu>;
export default meta;

const notifications = http.get("*/api/notifications", () =>
  HttpResponse.json({
    unreadCount: 1,
    notifications: [
      {
        id: "1",
        name: "post.published",
        data: { title: "Your post is live", body: "Hello is published." },
        readAt: null,
        createdAt: new Date().toISOString(),
      },
    ],
  }),
);

export const SignedIn: StoryObj<typeof meta> = {
  parameters: { msw: [mockUser({ email: "ada@example.com" }), notifications] },
  play: async () => {
    await expect(button(page, "Notifications, 1 unread")).toBeVisible();
    await button(page, "ada@example.com").click();
    await expect(menuitem(menu(page), "Sign out")).toBeVisible();
    await menu(page).press("Escape");
    await expect(menuitem(page, "Sign out")).toBeHidden();
  },
};

export const SignsOut: StoryObj<typeof meta> = {
  parameters: { msw: [mockUser({ email: "ada@example.com" }), notifications] },
  play: async () => {
    await button(page, "ada@example.com").click();
    await menuitem(page, "Sign out").click();
    await expect(button(page, "ada@example.com")).toHaveCount(0);
  },
};

export const SignedOut: StoryObj<typeof meta> = {
  parameters: { msw: [mockUser(null)] },
  play: async () => {
    await expect(button(page, "ada@example.com")).toHaveCount(0);
  },
};
