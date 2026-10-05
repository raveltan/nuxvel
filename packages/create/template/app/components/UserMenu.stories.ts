import type { Meta, StoryObj } from "@storybook-vue/nuxt";
import { mockUser } from "@nuxvel/nuxt/storybook/mocks";
import { button, expect, link, menu, menuitem, page, text } from "@nuxvel/nuxt/storybook/test";
import UserMenu from "./UserMenu.vue";

const meta = { component: UserMenu } satisfies Meta<typeof UserMenu>;
export default meta;

const ada = mockUser({ email: "ada@example.com" });

export const SignedIn: StoryObj<typeof meta> = {
  parameters: { msw: [ada] },
  play: async () => {
    await button(page, "ada@example.com").click();

    await expect(text(menu(page), "ada@example.com")).toBeVisible();
    await expect(menuitem(menu(page), "Sign out")).toBeVisible();
  },
};

export const SignsOut: StoryObj<typeof meta> = {
  parameters: { msw: [ada] },
  play: async () => {
    await button(page, "ada@example.com").click();
    await menuitem(page, "Sign out").click();

    await expect(link(page, "Sign in")).toBeVisible();
    await expect(button(page, "ada@example.com")).toBeHidden();
  },
};

export const SignedOut: StoryObj<typeof meta> = {
  parameters: { msw: [mockUser(null)] },
  play: async () => {
    await expect(link(page, "Sign in")).toBeVisible();
    await expect(button(page, "ada@example.com")).toBeHidden();
  },
};
