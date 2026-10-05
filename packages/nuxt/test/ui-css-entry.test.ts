import { fileURLToPath } from "node:url";
import { loadNuxt } from "@nuxt/kit";
import { expect } from "@nuxvel/nuxt/testing";
import { describe, it } from "vitest";

const rootDir = fileURLToPath(new URL("../../../playground", import.meta.url));
const srcDir = fileURLToPath(new URL("./fixtures/ui-app", import.meta.url));

async function cssEntries(css?: string[]) {
  const nuxt = await loadNuxt({ cwd: rootDir, overrides: { srcDir, ...(css ? { css } : { css: [] }) } });

  try {
    return nuxt.options.css.filter((entry) => entry.endsWith("ui.css"));
  } finally {
    await nuxt.close();
  }
}

describe("the Tailwind CSS entry of the module", () => {
  it("adds the full entry when the app sets no css", async () => {
    expect(await cssEntries()).toHaveLength(1);
  });

  it("leaves the entry to the app when the app sets css", async () => {
    expect(await cssEntries(["~/assets/css/main.css"])).toEqual([]);
  });
});
