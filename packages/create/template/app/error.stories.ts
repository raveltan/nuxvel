import type { Meta, StoryObj } from "@storybook-vue/nuxt";
import { createError, useState } from "#app";
import { expect, heading, page, text } from "@nuxvel/nuxt/storybook/test";
import { h } from "vue";
import ErrorPage from "./error.vue";

const meta = {
  component: ErrorPage,
  decorators: [
    (story) => ({
      setup() {
        useState("error-request-id").value = "req-7f3a";
        const Story = story();
        return () => h(Story);
      },
    }),
  ],
} satisfies Meta<typeof ErrorPage>;
export default meta;

export const NotFound: StoryObj<typeof meta> = {
  args: { error: createError({ statusCode: 404, message: "Page not found: /no-such-page" }) },
  play: async () => {
    await expect(text(page, "404")).toBeVisible();
    await expect(heading(page, "Page not found")).toBeVisible();
    await expect(text(page, "/no-such-page")).toBeVisible();
    await expect(text(page, "Request ID: req-7f3a")).toBeVisible();
  },
};
