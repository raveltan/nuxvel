# Tutorial: a garden journal with its own look

## Introduction

This tutorial gives a nuxvel app its own design. The app is Grove, a small journal of house plants. It has a green brand colour (moss), an orange accent colour (clay), a serif font for headings, its own icons and a dark mode. The pages use the nuxvel components (`<DataTable>`, `<SearchInput>`, the confirm dialog), and these components get the same design.

The tutorial covers these topics, one per chapter:

- The brand colours and the design tokens: `ui.colors` in `app.config.ts`, the `@theme` block and the CSS variables of Nuxt UI.
- Fonts with `@nuxt/fonts`, and a custom icon set with `@nuxt/icon`.
- The `ui` config of a component: slots, variants and default variants, for all instances and for one instance.
- Design-system components of the app (`AppButton`, `AppCard`) with typed props.
- Dark mode with `useColorMode()` and a toggle, also in Storybook.
- The nuxvel components with the app's design, and the replacement of one of them.
- The strict Content Security Policy with the custom colours, on a server-rendered page and on a client-only page.

| Layer | Runs | This tutorial checks |
|---|---|---|
| Component | `npm run test:ui`, one story in Chromium | each component in light and dark mode, and the colour contrast of each state |
| End-to-end | `npm run test:e2e`, a real browser on the production build | the dark mode of the system, the toggle, and the colours under the strict CSP |

Most tests are component tests. The component-by-component workflow itself (MSW mocks, `trpcSpy`, one story for each state) is the topic of [Tutorial: a product catalogue, component by component](./component-driven-ui.md). This tutorial uses that workflow and does not explain it again.

You need Node.js 24, Docker, and about 45 minutes. Run every command from the app folder.

## 1. Create the app

```bash
npm create nuxvel@latest grove
cd grove
npm install
./nv services up
./nv test:functional
```

```
 Test Files  2 passed (2)
      Tests  5 passed (5)
```

The journal needs one table. Generate it with its pages, then make the migration and apply it:

```bash
./nv make:resource plant species light:enum=shade,partial,sun watered_on:date:nullable --searchable name --ui
./nv db:generate --name plants
./nv db:migrate
```

```
✔ Created server/database/schema/plant.schema.ts
✔ Created shared/schemas/plant.ts
✔ Created server/privacy/plant.user-data.ts
✔ Created server/policies/plant.policy.ts
✔ Created server/actions/plant/create-plant.action.ts
✔ Created server/actions/plant/update-plant.action.ts
✔ Created server/actions/plant/delete-plant.action.ts
✔ Created server/trpc/routers/plant.router.ts
✔ Created server/trpc/routers/plant.router.test.ts
✔ Created app/pages/(app)/plant/index.vue
✔ Created app/pages/(app)/plant/new.vue
✔ Created app/components/PlantForm.vue
```

The list page at `/plant` shows the plants in a `<DataTable>` with a `<SearchInput>`. Each row has a **Delete** button that opens the confirm dialog of `useConfirm()`. See [CLI: make:resource](../cli.md#nuxvel-makeresource-name).

The `plant` table has an `ownerId` column, so it holds user data. `make:resource` declares it in `server/privacy/plant.user-data.ts`. Without that file, `npm run test:arch` fails. See [Privacy: declaring user data](../privacy.md#declaring-user-data).

The server is done. The rest of the tutorial changes only the UI.

## 2. Brand colours and design tokens

Nuxt UI gives each component a colour by its role: `primary`, `secondary`, `success`, `info`, `warning`, `error` and `neutral`. The app tells Nuxt UI which palette each role uses. The starter uses a red palette, `crimson`. Grove replaces it with two palettes of its own.

### The palettes

A palette is eleven shades, from `50` to `950`. Tailwind CSS reads them from the `@theme` block of the main CSS file. The block is `@theme static`: Nuxt UI reads the shades of `primary` and `neutral` as CSS variables at run time, and a plain `@theme` keeps only the shades that a class uses. Replace the `crimson` shades in `app/assets/css/main.css`:

```css
/* app/assets/css/main.css */
@import "tailwindcss";
@import "@nuxt/ui";
@import "@nuxvel/nuxt/ui.css";

@theme static {
  --font-sans: "Inter", ui-sans-serif, system-ui, sans-serif;
  --font-display: "Fraunces", ui-serif, Georgia, serif;
  --font-mono: "Geist Mono", ui-monospace, "SF Mono", Menlo, monospace;

  --color-moss-50: #f3f8f1;
  --color-moss-100: #e3efdd;
  --color-moss-200: #c7dfbd;
  --color-moss-300: #9fc791;
  --color-moss-400: #74a962;
  --color-moss-500: #538d42;
  --color-moss-600: #3f7032;
  --color-moss-700: #33592a;
  --color-moss-800: #2b4825;
  --color-moss-900: #253c21;
  --color-moss-950: #11200f;

  --color-clay-50: #fdf5f1;
  --color-clay-100: #fbe7dd;
  --color-clay-200: #f6ccb9;
  --color-clay-300: #efa88a;
  --color-clay-400: #e67c59;
  --color-clay-500: #dc5c37;
  --color-clay-600: #c9452a;
  --color-clay-700: #a73524;
  --color-clay-800: #872e24;
  --color-clay-900: #6e2921;
  --color-clay-950: #3b120e;
}

:root {
  --ui-radius: 0.5rem;
}

.dark {
  --ui-bg: var(--ui-color-neutral-950);
}
```

- Each `--color-<name>-<shade>` variable makes Tailwind utilities, such as `bg-moss-200` and `text-clay-700`.
- `--font-sans` is the font of the body text. `--font-display` makes the utility `font-display`, which the headings of this tutorial use. Chapter 3 explains how the fonts load.
- The rules after `@theme` change the CSS variables of Nuxt UI. `--ui-radius` is the base radius of all components. `--ui-bg` is the page background. Here dark mode gets the darkest neutral shade, `950`, in place of the default `900`.

The variables of Nuxt UI are the design tokens of the app. Use them in your own markup through their utilities: `bg-default`, `bg-elevated`, `text-muted`, `text-highlighted`, `border-default`, and `text-primary` or `bg-primary` for a colour role. A token changes with the colour mode, and a shade such as `text-moss-700` does not. Chapter 6 shows the result of a fixed shade in dark mode.

The starter uses `crimson` in three more files: `app/components/AppLogoMark.vue`, `app/components/CommandStep.vue` and `app/pages/index.vue`. Replace `crimson` with `moss` in each file. In `nuxt.config.ts`, change `pwa.themeColor` to `'#2b4825'`, which is `moss-800`.

### The colour roles

`app.config.ts` maps each role to a palette:

```ts
// app/app.config.ts
colors: { primary: "moss", secondary: "clay", neutral: "stone" },
```

`stone` is a palette of Tailwind CSS. A palette of your own is valid only when `@theme` defines all eleven shades. Chapter 4 shows the complete file.

Nuxt UI uses the `500` shade for each role in light mode and the `400` shade in dark mode. These shades often fail the WCAG AA contrast against white. `@nuxvel/nuxt/ui.css` thus sets each role to its `800` shade in light mode. Here `primary` is `moss-800` on a light page and `moss-400` on a dark page. To use other shades, set the variables after the import, as in [Frontend: colour contrast](../frontend.md#colour-contrast).

Nuxt UI writes the shades of each role into one `<style>` element. On a server-rendered page, the nonce of the page covers this element. For a client-only page, nuxvel adds the sha256 hash of the element to the CSP when it builds the app. Chapter 9 checks both.

## 3. Fonts and icons

### Fonts

Nuxt UI installs [`@nuxt/fonts`](https://fonts.nuxt.com). The module finds each `font-family` in the CSS of the app, here Inter, Fraunces and Geist Mono. During the build, it downloads the font files from a font provider and stores them in the app. The production server sends them from `/_fonts/`. Thus the fonts load under the `font-src 'self'` of the strict CSP, and the browser sends no request to Google Fonts. Nuxt UI asks for the weights 400, 500, 600 and 700 of each font.

The app needs no font code. To use a font, name it in `@theme`, as in chapter 2.

### Icons

The `i-lucide-*` icons come from the Lucide set, which `@nuxvel/nuxt` installs. Grove also has two icons of its own. Put each icon in a folder as an SVG file. Use `stroke="currentColor"` or `fill="currentColor"`, so the icon takes the colour of its text:

```svg
<!-- app/assets/icons/sprout.svg -->
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 21v-9"/><path d="M12 12c0-4 3-7 8-7 0 4-3 7-8 7Z"/><path d="M12 14c0-3-2.5-5-6-5 0 3 2.5 5 6 5Z"/></svg>
```

```svg
<!-- app/assets/icons/watering-can.svg -->
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 10h11v8a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2Z"/><path d="M15 12l6-5"/><path d="M7 10V7a3 3 0 0 1 6 0v3"/></svg>
```

Declare the folder as an icon set in `nuxt.config.ts`:

```ts
// nuxt.config.ts
export default defineNuxtConfig({
  modules: ['@nuxvel/nuxt'],
  css: ['~/assets/css/main.css'],
  icon: {
    customCollections: [{ prefix: 'grove', dir: './app/assets/icons' }],
  },
})
```

The icons are now `i-grove-sprout` and `i-grove-watering-can`. `npx nuxt prepare` shows the set:

```
[nuxt:icon] ✔ Nuxt Icon loaded local collection grove with 2 icons
```

Your `icon` options merge with the options of nuxvel. The icons stay inline SVG (`mode: "svg"`), and the app's own server sends them (`fallbackToApi: false`). See [Frontend: Nuxt UI](../frontend.md#nuxt-ui). For an icon set from Iconify, install its package, for example `npm install @iconify-json/ph`.

## 4. The `ui` config of a component

Each Nuxt UI component has a theme. The theme has three parts:

- `slots`: the classes of each part of the component. A `UCard` has the slots `root`, `header`, `body` and `footer`.
- `variants`: the classes for each value of a prop, for example `variant: "outline"` of a `UCard`.
- `defaultVariants`: the value of a prop when the instance does not give it.

The theme of each component is in `.nuxt/ui/<component>.ts`, for example `.nuxt/ui/card.ts`. Open it to see the slot and variant names.

### For all instances

`app.config.ts` changes the theme for every instance of a component. This is the complete file of Grove:

```ts
// app/app.config.ts
export default defineAppConfig({
  ui: {
    colors: { primary: "moss", secondary: "clay", neutral: "stone" },
    button: {
      slots: { base: "rounded-full font-semibold" },
    },
    card: {
      slots: { root: "rounded-2xl" },
      variants: {
        variant: {
          leaf: { root: "bg-primary/5 ring ring-primary/25 divide-y divide-primary/15" },
        },
      },
    },
    badge: {
      defaultVariants: { variant: "subtle" },
    },
    table: {
      slots: { th: "font-display text-highlighted", tr: "hover:bg-elevated/50" },
    },
    modal: {
      slots: { content: "rounded-2xl", title: "font-display text-lg" },
    },
    input: {
      defaultVariants: { size: "lg" },
    },
    fileUpload: {
      slots: { base: "border-primary/40 bg-primary/5" },
    },
  },
});
```

- `button.slots.base` gives every button round ends. The classes merge with the classes of the theme. Tailwind Merge removes the theme class that a new class replaces, here `rounded-md`.
- `card.variants.variant.leaf` adds a new value, `leaf`, to the `variant` prop of `UCard`.
- `badge.defaultVariants` makes `subtle` the variant of a badge that sets no `variant`.
- `table`, `modal`, `input` and `fileUpload` change the components inside the nuxvel components. Chapter 7 explains this.

The new variant is part of the prop type. `nuxt prepare` reads `app.config.ts`, so `<UCard variant="leaf">` compiles, and a misspelled value fails `npm run typecheck`:

```
app/components/AppCard.vue(6,11): error TS2322: Type '"outline" | "leafy"' is not assignable to type '"solid" | "outline" | "soft" | "subtle" | "leaf" | undefined'.
```

### For one instance

The `ui` prop changes the slots of one instance. The `class` prop adds classes to the root slot. Grove has a page at `/garden` with a badge that has a different shape:

```vue
<!-- app/pages/garden.vue -->
<script setup lang="ts">
definePageMeta({ layout: "app" });

useSeo({ title: "Garden" });
</script>

<template>
  <div class="space-y-6">
    <div class="flex items-center gap-3">
      <h1 class="font-display text-3xl text-highlighted">Garden</h1>
      <UBadge color="secondary" label="2 plants" :ui="{ base: 'rounded-full px-3' }" />
    </div>
    <div class="grid gap-4 sm:grid-cols-2">
      <AppCard title="Monstera" eyebrow="Partial light" tone="leaf">
        Water once a week.
        <template #footer>
          <AppButton label="Water now" icon="i-grove-watering-can" />
        </template>
      </AppCard>
      <AppCard title="Fern" eyebrow="Shade">
        Keep the soil damp.
        <template #footer>
          <AppButton label="Mist the leaves" tone="accent" icon="i-grove-sprout" />
        </template>
      </AppCard>
    </div>
  </div>
</template>
```

The order is: the theme, then `app.config.ts`, then the `ui` and `class` props of the instance. A prop on the instance, such as `variant="solid"`, wins over `defaultVariants`. The next chapter writes `AppCard` and `AppButton`.

## 5. Design-system components

A page of Grove does not choose a colour and a variant for each button. It uses components of the app that know the design. These components wrap Nuxt UI, and their props say what the element is for, not how it looks.

### AppButton

```vue
<!-- app/components/AppButton.vue -->
<script setup lang="ts">
import type { ButtonProps } from "@nuxt/ui";

export type AppButtonTone = "brand" | "accent" | "quiet" | "danger";

const props = withDefaults(
  defineProps<{
    label: string;
    tone?: AppButtonTone;
    icon?: string;
    to?: ButtonProps["to"];
    loading?: boolean;
  }>(),
  { tone: "brand" },
);

const looks = {
  brand: { color: "primary", variant: "solid" },
  accent: { color: "secondary", variant: "soft" },
  quiet: { color: "neutral", variant: "ghost" },
  danger: { color: "error", variant: "outline" },
} as const satisfies Record<AppButtonTone, Pick<ButtonProps, "color" | "variant">>;
</script>

<template>
  <UButton v-bind="looks[props.tone]" :label="label" :icon="icon" :to="to" :loading="loading" />
</template>
```

- `tone` has four values. Each value maps to one colour and one variant of `UButton`. A page cannot ask for a combination that the design does not have.
- `label` is required, so each button has an accessible name.
- `ButtonProps["to"]` is the type of the `to` prop of `UButton`. A route name in `to` is type-checked, as in [Frontend: links](../frontend.md#links).
- `satisfies` checks each colour and variant against the types of Nuxt UI, and `as const` keeps the literal values.

### AppCard

```vue
<!-- app/components/AppCard.vue -->
<script setup lang="ts">
withDefaults(defineProps<{ title: string; eyebrow?: string; tone?: "plain" | "leaf" }>(), { tone: "plain" });
</script>

<template>
  <UCard :variant="tone === 'leaf' ? 'leaf' : 'outline'">
    <template #header>
      <p v-if="eyebrow" class="text-xs font-semibold tracking-wide text-moss-700 uppercase">{{ eyebrow }}</p>
      <h2 class="font-display text-xl text-highlighted">{{ title }}</h2>
    </template>
    <slot />
    <template v-if="$slots.footer" #footer>
      <slot name="footer" />
    </template>
  </UCard>
</template>
```

`tone: "leaf"` uses the `leaf` variant from `app.config.ts`. The eyebrow is the small label above the title. It uses the fixed shade `text-moss-700`. This is a mistake, and chapter 6 finds it.

### The stories

```ts
// app/components/AppButton.stories.ts
import type { Meta, StoryObj } from "@storybook-vue/nuxt";
import { button, expect, page } from "@nuxvel/nuxt/storybook/test";
import AppButton from "./AppButton.vue";

const meta = { component: AppButton, args: { label: "Water now" } } satisfies Meta<typeof AppButton>;
export default meta;

type Story = StoryObj<typeof meta>;

export const Brand: Story = {
  play: async () => {
    await expect(button(page, "Water now")).toHaveAttribute("class", /bg-primary/);
  },
};

export const Accent: Story = { args: { tone: "accent", icon: "i-lucide-sprout" } };
export const Quiet: Story = { args: { tone: "quiet" } };
export const Danger: Story = { args: { tone: "danger", label: "Remove plant" } };
export const BrandInDark: Story = { globals: { theme: "dark" } };

export const Loading: Story = {
  args: { loading: true },
  play: async () => {
    await expect(button(page, "Water now")).toBeDisabled();
  },
};
```

```ts
// app/components/AppCard.stories.ts
import type { Meta, StoryObj } from "@storybook-vue/nuxt";
import { expect, heading, page, text } from "@nuxvel/nuxt/storybook/test";
import AppCard from "./AppCard.vue";

const meta = {
  component: AppCard,
  args: { title: "Monstera", eyebrow: "Partial light" },
  render: (args) => ({
    components: { AppCard },
    setup: () => ({ args }),
    template: `<AppCard v-bind="args">Water once a week.</AppCard>`,
  }),
} satisfies Meta<typeof AppCard>;
export default meta;

type Story = StoryObj<typeof meta>;

export const Plain: Story = {
  play: async () => {
    await expect(heading(page, "Monstera")).toBeVisible();
    await expect(text(page, "Water once a week.")).toBeVisible();
  },
};

export const Leaf: Story = { args: { tone: "leaf" } };
export const PlainInDark: Story = { globals: { theme: "dark" } };
export const LeafInDark: Story = { args: { tone: "leaf" }, globals: { theme: "dark" } };
```

Each story is one state of the component. A story with no `play` function is still a test: it must render, and axe-core must find no violation in it. The `render` function of `AppCard` gives the card some text in its default slot.

`globals: { theme: "dark" }` renders a story in dark mode. `nuxvelPreview` gives the `theme` global.

## 6. Dark mode

### The toggle

Nuxt UI installs `@nuxtjs/color-mode`. Its `useColorMode()` is auto-imported. `preference` is the choice of the user: `"system"`, `"light"` or `"dark"`. The default is `"system"`, which follows the setting of the operating system. `value` is the mode that the page shows now. The module puts the class `light` or `dark` on `<html>`, and Nuxt UI changes its CSS variables for the `.dark` class.

```vue
<!-- app/components/ColorModeToggle.vue -->
<script setup lang="ts">
const colorMode = useColorMode();
const dark = computed(() => colorMode.value === "dark");

function toggle() {
  colorMode.preference = dark.value ? "light" : "dark";
}
</script>

<template>
  <ClientOnly>
    <UButton
      color="neutral"
      variant="ghost"
      :icon="dark ? 'i-lucide-sun' : 'i-lucide-moon'"
      :aria-label="dark ? 'Use light mode' : 'Use dark mode'"
      @click="toggle"
    />
    <template #fallback>
      <span class="size-9" />
    </template>
  </ClientOnly>
</template>
```

The server does not know the setting of the operating system, so it cannot know `value`. `<ClientOnly>` renders the button only in the browser, and the fallback keeps its space. Without it, the server and the browser render a different icon, which causes a hydration mismatch.

Add `<ColorModeToggle />` to the header of each layout in `app/layouts/`: in `default.vue` and `app.vue`, put it first in the `<div>` with the header buttons. In `home.vue`, put it before `<PwaInstallPrompt />`.

The module stores the choice in `localStorage`. An inline script reads it before the page shows, so a reload does not flash the other mode. Each switch adds a short `<style>` element that stops the transitions for one frame. nuxvel adds the hash of its text to the CSP, so the switch needs no setting.

### A theme switch in Storybook

`nuxvelPreview` has a **Theme** menu in the Storybook toolbar, with the values `light` and `dark`. It sets the color-mode preference of each story, also the nuxvel stories, so `.storybook/preview.ts` needs no code for it. The starter's `.storybook/preview-head.html` has the stub of `@nuxtjs/color-mode` that adds and removes the class of `<html>`. An app that was made before this change replaces its stub with the one in [Storybook: dark mode](../storybook.md#dark-mode).

A story sets `globals: { theme: "dark" }` to render in dark mode. `nuxvel test:ui` uses the same value.

This chapter was changed after the tutorial was run. The new text was not re-run in the Grove app. It is checked by a test of nuxvel (`packages/nuxt/test/storybook.test.ts`).

The stories of the toggle click it in each direction:

```ts
// app/components/ColorModeToggle.stories.ts
import type { Meta, StoryObj } from "@storybook-vue/nuxt";
import { button, expect, page } from "@nuxvel/nuxt/storybook/test";
import ColorModeToggle from "./ColorModeToggle.vue";

const meta = { component: ColorModeToggle } satisfies Meta<typeof ColorModeToggle>;
export default meta;

type Story = StoryObj<typeof meta>;

export const SwitchesToDark: Story = {
  play: async () => {
    await button(page, "Use dark mode").click();

    await expect(button(page, "Use light mode")).toBeVisible();
    expect(document.documentElement).toHaveClass("dark");
  },
};

export const SwitchesBackToLight: Story = {
  globals: { theme: "dark" },
  play: async () => {
    await button(page, "Use light mode").click();

    await expect(button(page, "Use dark mode")).toBeVisible();
    expect(document.documentElement).not.toHaveClass("dark");
  },
};
```

`page` is the document of the story without `<html>`, so the story checks the class of `document.documentElement` with the jest-dom matcher `toHaveClass`. The label changes after the class, so the class check needs no retry.

### The contrast check finds the eyebrow

Run the stories of the design system:

```bash
npm run test:ui -- app/components
```

```
 FAIL  |ui (chromium)| app/components/AppCard.stories.ts > Plain In Dark
Error: 
Click to debug the error directly in Storybook: http://localhost:6006/?path=/story/components-appcard--plain-in-dark&addonPanel=storybook/interactions/panel
expect(received).toHaveNoViolations(expected)
Expected the HTML found at $('.text-xs') to have no violations:
<p class="text-xs font-semibold tracking-wide text-moss-700 uppercase">Partial light</p>
Received:
"Elements must meet minimum color contrast ratio thresholds (color-contrast)"
Fix any of the following:
  Element has insufficient color contrast of 2.44 (foreground color: #33592a, background color: #0c0a09, font size: 9.0pt (12px), font weight: normal). Expected contrast ratio of 4.5:1
```

`LeafInDark` fails with the same rule. The light stories pass: `moss-700` on white has enough contrast. On the dark background (`#0c0a09`, the `--ui-bg` of chapter 2) it has a contrast of 2.44, and WCAG AA asks for 4.5. A fixed shade is correct in one mode only. `@storybook/addon-a11y` runs axe-core after each story and fails the story on a violation. See [Storybook: accessibility](../storybook.md#accessibility).

Use the token of the role in place of the shade. In `AppCard.vue`, change `text-moss-700` to `text-primary`. `text-primary` is `moss-800` in light mode and `moss-400` in dark mode. Run the stories again:

```bash
npm run test:ui -- app/components
```

```
 Test Files  4 passed (4)
      Tests  15 passed (15)
```

The fourth file is the starter's `UserMenu.stories.ts`.

## 7. The nuxvel components

### Restyling

The nuxvel components are made of Nuxt UI components. So the `ui` config of chapter 4 also changes them:

| nuxvel component | Nuxt UI components inside | Grove changes |
|---|---|---|
| `<DataTable>` | `UTable`, `UPagination`, `<SearchInput>` | `table`: the header font and the row hover |
| the dialog of `useConfirm()` | `UModal`, `UButton` | `modal`: the radius and the title font. `button`: the round ends |
| `<SearchInput>` | `UInput`, `UButton` | `input`: the size `lg` |
| `<UploadField>` | `UFormField`, `UFileUpload`, `UProgress` | `fileUpload`: the border and the background of the drop area |

The colours of all four come from the colour roles, so they follow the brand colours and the colour mode with no more code. The `ui` config changes every `UTable` and every `UModal` of the app, not only the ones inside the nuxvel components.

`<DataTable>`, `<UploadField>` and the dialog of `useConfirm()` take a `ui` prop for the component inside them (`UTable`, `UFileUpload` and `UModal`), for example `<DataTable :ui="{ th: 'uppercase' }" />`. On one instance, `class` goes to the root element of the component: the wrapper `<div>` of `<DataTable>`, the `UInput` of `<SearchInput>` and the `UFormField` of `<UploadField>`. See [Frontend: replacing a nuxvel component](../frontend.md#replacing-a-nuxvel-component).

This chapter was not run again in its app after the `ui` prop was added.

### Replacing a component

A component in `app/components/` with the name of a nuxvel component replaces it. Nuxt registers the component of the app in place of the one of the module, and it shows no warning. The replacement applies everywhere, also inside `<DataTable>`, which renders its search input as `<SearchInput>`.

Grove replaces `<SearchInput>` with a version that has a keyboard shortcut: the `/` key puts the focus in the search box. The replacement must keep the contract of the original, because `<DataTable>` relies on it:

- It writes the text to `?q=` in the URL, 300 ms after the last key, or at once on Enter.
- A new text removes `?page=`.
- The input follows `?q=` when the URL changes.

```vue
<!-- app/components/SearchInput.vue -->
<script setup lang="ts">
const q = defineModel<string>({ default: "" });
const route = useRoute();
const router = useRouter();
const input = useTemplateRef("input");

function urlQuery() {
  return typeof route.query.q === "string" ? route.query.q : "";
}

const text = ref(urlQuery());
q.value = text.value;
let timer: ReturnType<typeof setTimeout> | undefined;

function commit() {
  clearTimeout(timer);
  const value = text.value.trim();
  q.value = value;
  if (value !== urlQuery()) router.push({ query: { ...route.query, q: value || undefined, page: undefined } });
}

watch(text, () => {
  clearTimeout(timer);
  timer = setTimeout(commit, 300);
});
watch(urlQuery, (value) => {
  q.value = value;
  if (value !== text.value.trim()) text.value = value;
});
onScopeDispose(() => clearTimeout(timer));

defineShortcuts({ "/": () => input.value?.inputRef?.focus() });
</script>

<template>
  <UInput ref="input" v-model="text" role="searchbox" icon="i-lucide-search" variant="soft" class="w-full max-w-sm" @keydown.enter="commit">
    <template #trailing>
      <UKbd value="/" />
    </template>
  </UInput>
</template>
```

- `defineShortcuts()` is a composable of Nuxt UI. It is auto-imported, and it ignores the key while the focus is in another input.
- `<DataTable>` gives the input its `aria-label` and `placeholder`. They fall through to the `<input>` element of `UInput`.
- `<UKbd>` shows the key in the input.

The component of the app replaces the whole nuxvel component. It cannot import the original and wrap it, because `@nuxvel/nuxt` does not export the component files. Replace a nuxvel component only when the `ui` config cannot give the result. The dialog of `useConfirm()` cannot be replaced: `useConfirm()` opens its own component, not a registered one.

### The stories of the list page

A page is a component, so a story can render it. The stories of the plant list check the restyled table, the replaced search input and the confirm dialog, in light and dark mode:

```ts
// app/pages/(app)/plant/index.stories.ts
import type { Meta, StoryObj } from "@storybook-vue/nuxt";
import { mockTrpc, mockUser, trpcSpy } from "@nuxvel/nuxt/storybook/mocks";
import { button, cell, dialog, expect, field, page, text } from "@nuxvel/nuxt/storybook/test";
import { userEvent } from "storybook/test";
import PlantList from "./index.vue";

const meta = { component: PlantList } satisfies Meta<typeof PlantList>;
export default meta;

type Story = StoryObj<typeof meta>;

const createdAt = new Date("2026-03-14T09:30:00Z");
const plant = {
  id: 1,
  ownerId: "user-1",
  name: "Monstera",
  species: "Monstera deliciosa",
  light: "partial" as const,
  wateredOn: "2026-03-12",
  searchVector: null,
  createdAt,
  updatedAt: createdAt,
};
const plants = [plant, { ...plant, id: 2, name: "Fern", species: "Nephrolepis exaltata", light: "shade" as const }];

const list = trpcSpy("plant.list", (input) => {
  const rows = input?.q ? plants.filter((row) => row.name.toLowerCase().includes(input.q ?? "")) : plants;
  return { rows, page: 1, perPage: 15, total: rows.length, lastPage: 1 };
});
const mocks = [mockUser({ id: "user-1", name: "Ada" }), mockTrpc({ plant: { list } })];

export const Light: Story = {
  parameters: { msw: mocks },
  play: async () => {
    await expect(cell(page, "Monstera deliciosa")).toBeVisible();
    await expect(field(page, "Search plant")).toBeVisible();
    await expect(text(page, "/")).toBeVisible();
  },
};

export const Dark: Story = { ...Light, globals: { theme: "dark" } };

export const ConfirmInDark: Story = {
  parameters: { msw: mocks },
  globals: { theme: "dark" },
  play: async () => {
    await button(page, "Delete plant 1").click();

    await expect(dialog(page, "Delete plant?")).toBeVisible();
  },
};

export const SearchesFromTheKeyboard: Story = {
  parameters: { msw: mocks },
  play: async () => {
    await cell(page, "Monstera").waitFor();
    await userEvent.keyboard("/");
    expect(document.activeElement).toHaveAttribute("role", "searchbox");

    await field(page, "Search plant").pressSequentially("fern", { delay: 50 });
    await expect(list).toHaveBeenLastCalledWith({ q: "fern" });
    await expect(cell(page, "Monstera")).toHaveCount(0);
  },
};
```

- `text(page, "/")` finds the `<UKbd>` of the replacement. With the original `<SearchInput>`, `Light` and `Dark` fail.
- `ConfirmInDark` opens the dialog. axe-core runs after the `play` function, so it checks the open dialog in dark mode.
- `SearchesFromTheKeyboard` presses `/` on the page with `userEvent` of `storybook/test`, because no element has the focus yet. Then it types into the search box, and the spy checks that `<DataTable>` asked for the list with the new `q`. So the replacement keeps the contract.

```bash
npm run test:ui -- app/pages
```

```
 Test Files  1 passed (1)
      Tests  4 passed (4)
```

## 8. A client-only page

The garden page of chapter 4 renders only in the browser. Set the `client` preset for it in `nuxt.config.ts`:

```ts
// nuxt.config.ts
export default defineNuxtConfig({
  nuxvel: {
    rendering: { '/garden': 'client' },
  },
})
```

The server sends an empty shell for `/garden`. The browser renders the page, and Nuxt UI adds its `<style>` element with the shades of chapter 2. The element has no nonce, because the browser creates it before any code of the app runs. nuxvel computes the text of this element when it builds the app, from `ui.colors` of each `app.config.ts`, and adds its sha256 hash to `style-src`. The hash allows exactly the text of the moss and clay shades. When you change `ui.colors`, the next build gives a new hash. See [Security headers](../security.md#security-headers) and [Rendering presets](../rendering.md#rendering-presets).

The hash covers only `ui.colors` and `ui.prefix` from `app.config.ts`. A change of `useAppConfig().ui.colors` while the app runs gives a different text, and the CSP blocks it.

## 9. End to end

The component tests use Storybook. The end-to-end tests run the production build of the app, with the strict CSP. Here they check three things: the dark mode of the system, the toggle, and the brand colours on the client-only page.

```ts
// tests/e2e/theme.test.ts
import { button, describe, expect, expectAccessible, heading, it, visit } from "@nuxvel/nuxt/testing";

describe("the theme in a browser", () => {
  it("follows a dark system setting and switches back to light", async () => {
    const page = await visit({ name: "index" }, { colorScheme: "dark" });

    await expect(page.locator("html")).toHaveAttribute("class", /\bdark\b/);
    await expectAccessible(page);

    await button(page, "Use light mode").click();
    await expect(page.locator("html")).toHaveAttribute("class", /\blight\b/);
    await expectAccessible(page);
  });

  it("keeps the brand colours on a client-only page under the strict CSP", async () => {
    const page = await visit({ name: "garden" }, { colorScheme: "dark" });

    await expect(heading(page, "Garden")).toBeVisible();
    await expect(button(page, "Water now")).toHaveCSS("background-color", "rgb(116, 169, 98)");
    await expect(button(page, "Water now").locator("svg")).toHaveCount(1);
    await expectAccessible(page);

    const policy = (await page.request.get(page.url())).headers()["content-security-policy"];
    expect(policy).toMatch(/style-src [^;]*'sha256-/);
    expect(policy).not.toContain("'unsafe-inline'");
  });
});
```

- `visit(target, { colorScheme: "dark" })` opens the page in a browser whose system setting is dark. The preference is `"system"`, so the page renders dark. See [visit](../testing.md#visit).
- `expectAccessible(page)` runs axe-core on the page in its current mode. The first test calls it in dark mode and again after the switch to light mode. See [Accessibility](../testing.md#accessibility).
- `visit()` fails the test on an error in the browser console, and a CSP violation is such an error. So both tests also prove that the CSP blocks nothing: the nonce on the server-rendered home page, the hash on the client-only garden page.
- `rgb(116, 169, 98)` is `moss-400`, the `primary` shade of dark mode. Without the theme style, the button has no background colour.
- The `<svg>` is the `i-grove-watering-can` icon of chapter 3.

```bash
npm run test:e2e
```

```
 Test Files  2 passed (2)
      Tests  6 passed (6)
```

The second file is the starter's `tests/e2e/home.test.ts`. Its `expectNoSmoke()` opens each route without params, `/garden` too, and checks each one with axe in light mode.

## 10. Run every check

```bash
npm run typecheck
./nv test:functional
npm run test:ui
npm run test:e2e
npm run test:arch
```

```
 Test Files  3 passed (3)
      Tests  11 passed (11)

 Test Files  6 passed (6)
      Tests  20 passed (20)

 Test Files  2 passed (2)
      Tests  6 passed (6)

✔ All architecture rules pass
```

`./nv test:functional` runs the generated router test and the two starter files. `npm run test:ui` runs the 16 stories of this tutorial and the 4 stories of the starter. `npm run test:arch` also checks that each test and each story imports `expect` from its nuxvel entry.

## What this tutorial leaves out

- A colour role of your own, such as `tertiary`. Nuxt UI makes the roles from the `ui.theme.colors` option in `nuxt.config.ts`. `@nuxvel/nuxt/ui.css` sets the darker light-mode shade only for the six roles of Nuxt UI, so set the variable of a new role yourself.
- Fonts from a provider other than the default. See the [`@nuxt/fonts` documentation](https://fonts.nuxt.com).
