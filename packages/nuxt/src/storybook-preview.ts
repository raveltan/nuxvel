import UApp from "@nuxt/ui/components/App.vue";
import { TOAST_FOCUS_PROXIES, WCAG_21_AA } from "./accessibility-rules";
import { getCurrentInstance, h, ref, watch, type Component, type ComponentOptions } from "vue";

declare const __NUXVEL_STORYBOOK_LOCALES__: { locales: string[]; defaultLocale: string };

type I18nApp = { $getLocale?: () => string; $switchLocale?: (locale: string) => Promise<unknown> };

const { locales, defaultLocale } = __NUXVEL_STORYBOOK_LOCALES__;
const multilingual = locales.length > 1;

function useStoryLocale(app: I18nApp | undefined, wanted: () => string | undefined) {
  const switchTo = (locale: string | undefined) => (locale && app?.$switchLocale && app.$getLocale?.() !== locale ? app.$switchLocale(locale) : undefined);
  const switching = switchTo(wanted());
  const ready = ref(!switching);
  switching?.finally(() => (ready.value = true));
  watch(wanted, switchTo);
  return ready;
}

/**
 * The Storybook project annotations that nuxvel needs in every story: the
 * `<UApp>` decorator, the `beforeEach` that gives the canvas an id and the
 * axe check after each story.
 *
 * The decorator wraps each story in `<UApp>`, so toasts and overlays such
 * as `UModal` work. It calls `story()` one time, in `setup`. A toast
 * renders `<UApp>` again, and a story that is created in the render
 * function would mount again and lose its state. The `beforeEach` sets
 * `canvasElement.id`: `@storybook-vue/nuxt` throws `StoryContext is not
 * provided` when the id is empty, as it is in a story that Vitest runs.
 * The `theme` global (a **Theme** toolbar menu, `light` or `dark`, `light` at
 * first) sets `$colorMode.preference` of `@nuxtjs/color-mode`, so a story
 * renders in dark mode with `globals: { theme: "dark" }`, also under
 * `nuxvel test:ui`. It needs the color-mode stub of `.storybook/preview-head.html`
 * that the starter has. The decorator reads `$colorMode` from the app,
 * because `.storybook/preview.ts` cannot import `useColorMode` from `#imports`.
 * The `locale` global (a **Locale** toolbar menu with the locales of the
 * app, the default locale at first, only with two or more locales) and
 * the `locale` story parameter select the locale of `$t`. The parameter
 * wins over the global. The story renders after the translations of the
 * locale are loaded, so a `play` function sees the translated text at once.
 * The module gives Storybook the `locales/` files of the app and of its layers.
 * `parameters.a11y` makes `@storybook/addon-a11y` fail a story on a WCAG
 * 2.1 AA violation, with the same rules as `expectAccessible` (it skips
 * the focus catchers of an open toast and the `vite-error-overlay` of a
 * story file that cannot load). A story turns off a rule with
 * `parameters: { a11y: { config: { rules: [{ id: "color-contrast", enabled: false }] } } }`.
 * Add `@storybook/addon-a11y` to `addons` in `.storybook/main.ts`.
 *
 * Spread it in `.storybook/preview.ts`, next to the `mswLoader` of
 * `msw-storybook-addon` (see {@link mockTrpc}). The stories of the app and
 * the stories from {@link nuxvelStories} need no wrapper of their own.
 *
 * @example
 * ```ts
 * import type { Preview } from "@storybook-vue/nuxt";
 * import { nuxvelPreview } from "@nuxvel/nuxt/storybook/preview";
 * import { mswLoader } from "msw-storybook-addon/csf3";
 *
 * const preview: Preview = { ...nuxvelPreview, loaders: [mswLoader(startWorker)] };
 *
 * export default preview;
 * ```
 */
export const nuxvelPreview = {
  parameters: {
    a11y: {
      test: "error" as const,
      context: { include: ["body"], exclude: [TOAST_FOCUS_PROXIES, "vite-error-overlay"] },
      options: { runOnly: { type: "tag" as const, values: WCAG_21_AA } },
    },
  },
  globalTypes: {
    theme: {
      description: "Colour mode",
      toolbar: { title: "Theme", icon: "mirror" as const, items: ["light", "dark"], dynamicTitle: true },
    },
    ...(multilingual ? { locale: { description: "Locale", toolbar: { title: "Locale", icon: "globe" as const, items: locales, dynamicTitle: true } } } : {}),
  },
  initialGlobals: { theme: "light", ...(multilingual ? { locale: defaultLocale } : {}) },
  decorators: [
    (story: () => Component, { globals, parameters }: { globals: Record<string, unknown>; parameters: Record<string, unknown> }): ComponentOptions => ({
      setup() {
        const app = getCurrentInstance()?.appContext.config.globalProperties;
        const colorMode = app?.$colorMode as { preference: string } | undefined;
        if (colorMode) colorMode.preference = globals.theme === "dark" ? "dark" : "light";
        const ready = useStoryLocale(app as I18nApp | undefined, () => (parameters.locale ?? globals.locale) as string | undefined);
        const Story = story();
        return () => (ready.value ? h(UApp, null, { default: () => h(Story) }) : null);
      },
    }),
  ],
  // @storybook-vue/nuxt keys the Nuxt app on canvasElement.id, which the Vitest runner's container lacks
  beforeEach: ({ canvasElement, id }: { canvasElement: HTMLElement; id: string }) => {
    canvasElement.id ||= `story-${id}`;
  },
};
