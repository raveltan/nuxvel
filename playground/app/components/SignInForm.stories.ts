import type { Meta, StoryObj } from "@storybook-vue/nuxt";
import { button, expect, field, page } from "@nuxvel/nuxt/storybook/test";
import SignInForm from "./SignInForm.vue";

const meta = { component: SignInForm } satisfies Meta<typeof SignInForm>;
export default meta;

export const English: StoryObj<typeof meta> = {
  play: async () => {
    await expect(field(page, "Email")).toBeVisible();
    await expect(button(page, "Sign in")).toBeVisible();
  },
};

export const Chinese: StoryObj<typeof meta> = {
  parameters: { locale: "zh" },
  play: async () => {
    await expect(field(page, "电子邮件")).toBeVisible();
    await expect(button(page, "登录 playground")).toBeVisible();
  },
};
