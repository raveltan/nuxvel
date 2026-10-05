import { button, expect, field, page, text } from "@nuxvel/nuxt/storybook/test";
import LiveForm from "./_LiveForm.vue";

export default { title: "Probes/LiveForm", component: LiveForm };

export const ValidatesAndHovers = {
  play: async () => {
    await field(page, "Title").pressSequentially("ab", { delay: 50 });
    await expect(text(page, "Title needs at least 3 characters")).toBeVisible();
    await field(page, "Title").pressSequentially("c");
    await expect(text(page, "Title needs at least 3 characters")).toHaveCount(0);

    await button(page, "Save draft").hover();
    await expect(text(page, "Saves the draft")).toBeVisible();
    await button(page, "Save draft").unhover();
    await expect(text(page, "Saves the draft")).toHaveCount(0);
  },
};
