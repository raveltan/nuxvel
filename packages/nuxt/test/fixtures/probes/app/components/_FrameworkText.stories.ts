import { button, expect, page, text } from "@nuxvel/nuxt/storybook/test";
import FrameworkText from "./_FrameworkText.vue";

export default { title: "Probes/FrameworkText", component: FrameworkText };

export const Chinese = {
  parameters: { locale: "zh" },
  play: async () => {
    await expect(text(page, "Ada 和 Linus 正在输入…")).toBeVisible();
    await button(page, "Archive").click();
    await expect(button(page, "取消")).toBeVisible();
    await expect(button(page, "确认")).toBeVisible();
  },
};
