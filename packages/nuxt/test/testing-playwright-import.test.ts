import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { expect } from "@nuxvel/nuxt/testing";
import { it } from "vitest";

const src = fileURLToPath(new URL("../src", import.meta.url));
const importFromPlaywrightCore = /(?:from|import)\s*\(?\s*["']playwright-core(?:\/[^"']*)?["']/;

it("the testing entries import Playwright types from playwright/test", () => {
  const offenders = ["testing", "storybook-test"].flatMap((dir) =>
    readdirSync(join(src, dir), { recursive: true, encoding: "utf8" })
      .filter((file) => /\.(ts|vue)$/.test(file))
      .filter((file) => importFromPlaywrightCore.test(readFileSync(join(src, dir, file), "utf8")))
      .map((file) => `src/${dir}/${file} imports from playwright-core: import from playwright/test`),
  );

  expect(offenders).toEqual([]);
});
