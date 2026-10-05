import type { Meta, StoryObj } from "@storybook-vue/nuxt";
import { expect, page, text } from "@nuxvel/nuxt/storybook/test";
import Greeting from "./Greeting.vue";

const meta = { component: Greeting } satisfies Meta<typeof Greeting>;
export default meta;

export const Chinese: StoryObj<typeof meta> = {
  parameters: { locale: "zh" },
  play: async () => {
    await expect(text(page, "你好")).toBeVisible();
  },
};

export const ChineseGlobal: StoryObj<typeof meta> = {
  globals: { locale: "zh" },
  play: async () => {
    await expect(text(page, "你好")).toBeVisible();
  },
};

export const English: StoryObj<typeof meta> = {
  play: async () => {
    await expect(text(page, "Hello")).toBeVisible();
  },
};
