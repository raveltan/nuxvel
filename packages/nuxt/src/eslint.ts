import typescriptParser from "@typescript-eslint/parser";
import vueA11y from "eslint-plugin-vuejs-accessibility";
import type { Linter } from "eslint";

export { architecture, nuxvelPlugin } from "./eslint/architecture";

/**
 * The nuxvel accessibility lint preset: `eslint-plugin-vuejs-accessibility`'s
 * recommended rules (missing labels, alt text, keyboard handlers, ARIA
 * misuse) applied to every `.vue` file, as errors. `<script lang="ts">`
 * blocks are parsed with `@typescript-eslint/parser`.
 *
 * @example
 * ```ts
 * // eslint.config.ts
 * import accessibility from "@nuxvel/nuxt/eslint";
 *
 * export default [...accessibility];
 * ```
 */
const accessibility: Linter.Config[] = [
  ...vueA11y.configs["flat/recommended"].map((config) => ({
    ...config,
    files: ["**/*.vue"],
  })),
  {
    files: ["**/*.vue"],
    languageOptions: { parserOptions: { parser: typescriptParser } },
  },
];

export default accessibility;
