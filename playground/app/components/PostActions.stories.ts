import type { Meta, StoryObj } from "@storybook-vue/nuxt";
import { mockTrpc } from "@nuxvel/nuxt/storybook/mocks";
import { button, expect, link, page } from "@nuxvel/nuxt/storybook/test";
import PostActions from "./PostActions.vue";

const meta = { component: PostActions, args: { post: { id: 1, title: "Hello" } } } satisfies Meta<typeof PostActions>;
export default meta;

export const CanEdit: StoryObj<typeof meta> = {
  parameters: { msw: [mockTrpc({ post: { abilities: () => ({ update: true, delete: true }) } })] },
  play: async () => {
    await expect(link(page, "Edit Hello")).toBeVisible();
    await expect(button(page, "Delete Hello")).toBeEnabled();
  },
};

export const ReadOnly: StoryObj<typeof meta> = {
  parameters: { msw: [mockTrpc({ post: { abilities: () => ({ update: false, delete: false }) } })] },
  play: async () => {
    await expect(link(page, "Edit Hello")).toBeHidden();
    await expect(button(page, "Delete Hello")).toHaveCount(0);
  },
};
