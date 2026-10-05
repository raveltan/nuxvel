import { fileURLToPath } from "node:url";

/**
 * Returns the Storybook `stories` entry for the stories of the nuxvel UI
 * components, such as `<DataTable>` and `<DateTime>`, under the title
 * prefix `nuxvel/`.
 *
 * The stories ship in `@nuxvel/nuxt` next to each component. The entry
 * points at that folder, wherever npm installed the package. Use it in
 * `.storybook/main.ts`, next to the glob of the app's own stories.
 *
 * @example
 * ```ts
 * import type { StorybookConfig } from "@storybook-vue/nuxt";
 * import { nuxvelStories } from "@nuxvel/nuxt/storybook";
 *
 * const config: StorybookConfig = {
 *   stories: ["../app/**\/*.stories.ts", nuxvelStories()],
 *   framework: { name: "@storybook-vue/nuxt", options: { docgen: "vue-component-meta" } },
 * };
 *
 * export default config;
 * ```
 */
export function nuxvelStories() {
  return { directory: fileURLToPath(new URL("./runtime/app", import.meta.url)), titlePrefix: "nuxvel" };
}
