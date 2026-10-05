import { describe, it } from "vitest";
import { expect, expectAccessible, text, visit } from "@nuxvel/nuxt/testing";
import { setupPlayground } from "./helpers/playground";

describe("Nuxt UI by default", async () => {
  await setupPlayground({
    browser: true,
  });

  it("registers Nuxt UI and its theme", async () => {
    const page = await visit("/_ui");

    await expect(page.locator("#__nuxt")).toHaveClass("isolate");
    expect(await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue("--ui-primary"))).not.toBe("");
  });

  it("registers the Nuxt UI <QueryState>", async () => {
    const page = await visit("/_query-state");

    await expect(text(page.getByRole("status"), "Loading…")).toBeAttached();
    await expect(page.locator('p[role="status"]')).toHaveCount(0);
  });

  it("renders a <UButton> with Nuxt UI's styles applied", async () => {
    const page = await visit("/_ui");

    const style = await page
      .getByRole("button", { name: "Nuxt UI" })
      .evaluate((button) => {
        const computed = getComputedStyle(button);
        return {
          background: computed.backgroundColor,
          paddingLeft: computed.paddingLeft,
          borderRadius: computed.borderRadius,
        };
      });

    expect(style.background).not.toBe("rgba(0, 0, 0, 0)");
    expect(style.background).not.toBe("rgb(239, 239, 239)");
    expect(style.paddingLeft).not.toBe("0px");
    expect(style.borderRadius).not.toBe("0px");
  });

  it.for(["light", "dark"] as const)("gives every color and variant enough contrast in %s mode", async (colorScheme) => {
    const page = await visit("/_contrast", { colorScheme });

    await expectAccessible(page);
  });
});
