# Storybook

## Introduction

[Storybook](https://storybook.js.org) shows the components of your app one at a time, without a server. A story is one state of one component, for example a date in a given format. nuxvel uses the Nuxt framework of Storybook, `@storybook-vue/nuxt`.

## Setup

A new app from [`create-nuxvel`](./create.md) has Storybook already: the `.storybook/` folder, the devDependencies, the scripts and the MSW worker. It has no stories of its own. The nuxvel stories show from the start. Run `npm run storybook`. The steps in this section are for an app that does not have Storybook.

Add Storybook and its Nuxt framework to the devDependencies of the app:

```bash
npm install -D storybook @storybook-vue/nuxt @storybook/addon-vitest @storybook/addon-a11y @vitest/browser-playwright
```

Add the scripts to `package.json`:

```json
{
  "scripts": {
    "storybook": "storybook dev --port 6006",
    "storybook:build": "storybook build"
  }
}
```

Make a `.storybook/` folder with two files. `main.ts` tells Storybook where the stories are and which framework to use. `@storybook/addon-vitest` runs the stories as tests (see [Component tests](#component-tests)). `nuxvelStories()` adds the stories of the nuxvel components (see [The nuxvel stories](#the-nuxvel-stories)):

```ts
// .storybook/main.ts
import type { StorybookConfig } from "@storybook-vue/nuxt";
import { nuxvelStories } from "@nuxvel/nuxt/storybook";

const config: StorybookConfig = {
  stories: ["../app/**/*.stories.ts", nuxvelStories()],
  framework: { name: "@storybook-vue/nuxt", options: { docgen: "vue-component-meta" } },
  addons: ["@storybook/addon-vitest", "@storybook/addon-a11y"],
};

export default config;
```

`docgen: "vue-component-meta"` reads the props of each component for the controls table. The default reader, `vue-docgen-api`, is deprecated and prints a warning on each start.

`preview-head.html` goes into the head of the page that shows a story. The color-mode plugin of Nuxt UI reads `window.__NUXT_COLOR_MODE__`. A Nuxt page sets it with an inline script, but the Storybook page does not have this script. Without the stub below, no story renders:

```html
<!-- .storybook/preview-head.html -->
<script>window.__NUXT_COLOR_MODE__ = { preference: 'light', value: 'light', getColorScheme: () => 'light', addColorScheme(mode) { document.documentElement.classList.add(mode) }, removeColorScheme(mode) { document.documentElement.classList.remove(mode) } }</script>
```

`addColorScheme` and `removeColorScheme` add and remove the class `light` or `dark` on `<html>`. The module calls them when the mode changes, so the stub is what lets a story change the mode.

### Dark mode

`nuxvelPreview` adds a **Theme** menu to the toolbar, with `light` and `dark`. The menu starts on `light`. Its value is the `theme` global. The decorator of `nuxvelPreview` sets the color-mode preference from the global, so the story shows the class `dark` on `<html>`, as the app does. A story that must render in dark mode sets the global. `nuxvel test:ui` uses it too:

```ts
export const Dark: Story = { globals: { theme: "dark" } };
```

`.storybook/preview.ts` needs no code for the menu. It spreads `nuxvelPreview`.

### Locale

A component that uses `$t` renders in Storybook with the [translation files](./i18n.md#translation-files) of the app. The module gives Storybook the global files of `locales/` and of each layer. Page files do not apply, because a story is not a page.

With two or more locales, `nuxvelPreview` adds a **Locale** menu to the toolbar, with the locales of the app. The menu starts on the default locale. Its value is the `locale` global. A story that must render in one locale sets the `locale` parameter. The parameter wins over the global, so the menu does not change that story:

```ts
export const Chinese: Story = {
  parameters: { locale: "zh" },
  play: async () => {
    await expect(text(page, "你好")).toBeVisible();
  },
};
```

The story renders after the translations of its locale load, so the `play` function finds the translated text. `nuxvel test:ui` uses the same locale as the Storybook UI.

In a Storybook build, the module sets the i18n `strategy` to `no_prefix`. The story page has no locale prefix in its path, so the decorator selects the locale with `$switchLocale`. The Storybook page has no server, so the request of the library for the translations fails. The module adds the translations through the `i18n:register` hook of the library instead.

Add `storybook-static` to `.gitignore`. `storybook build` writes the static site there.

## Writing a story

Put the story next to its component, with the suffix `.stories.ts`. Nuxt ignores these files, so a story is never a page or a component of the app.

Nuxt transforms do not run on a story file. `#components` and the auto-imports are thus not available there. Import the component by its path:

```ts
// app/components/PostCard.stories.ts
import type { Meta, StoryObj } from "@storybook-vue/nuxt";
import PostCard from "./PostCard.vue";

const meta = { component: PostCard } satisfies Meta<typeof PostCard>;
export default meta;

export const Draft: StoryObj<typeof meta> = { args: { title: "Hello", published: false } };
```

`nuxvel make:story <path>` writes this file for you, with one story, `Default`, and a `play` stub that checks that the component rendered something. A new component then has a [component test](#component-tests) that passes at once. Add your own checks to the `play` function. The path is the file of the component under `app/components/`, without `.vue`, for example `nuxvel make:story base/Button`. The command fails when the component does not exist or when the story exists. See [`nuxvel make:story`](./cli.md#nuxvel-makestory-path).

The generated story types its story with `StoryObj<typeof Component>`, not `StoryObj<typeof meta>`. With `typeof meta`, each required prop of the component must be in `args`, so an empty story does not typecheck. With `typeof Component`, all args are optional. Change it to `typeof meta` when you add the args.

The component itself is a normal Nuxt component. Inside it, auto-imports, composables and Nuxt UI components work.

Story files have their own tsconfig, `.nuxt/tsconfig.storybook.json`, which `tsconfig.json` lists in its `references`. The app tsconfig leaves them out, so the types of Storybook and MSW do not slow down the editor in the rest of the app. `nuxt typecheck` still checks every story. Without that reference, the stories stay in the app tsconfig. The root `tsconfig.json` sets `disableReferencedProjectLoad`, so the editor loads each referenced project only when you open one of its files.

## The nuxvel stories

`@nuxvel/nuxt` ships a story for each of these components: `DataTable`, `SearchInput`, `UploadField`, `ConfirmDialog`, `PresenceAvatars`, `TypingIndicator`, `DateTime` and `SafeHtml`. They show in the sidebar under `nuxvel/`, for example `nuxvel/DataTable`. These components need no server to render. The `DataTable` stories give the table a fixed query result. The `UploadField` story shows the empty field. A file you choose there sends a request that fails, because Storybook has no server.

`nuxvelStories()` returns the Storybook `stories` entry for them: the folder of the nuxvel components and the title prefix `nuxvel`. The function finds the folder from the location of `@nuxvel/nuxt`, so it works wherever npm installs the package. Remove `nuxvelStories()` from `main.ts` to hide these stories.

## Mocking the server

Storybook has no server. A component that calls the server gets no answer, so the story shows no data. [MSW](https://mswjs.io) (Mock Service Worker) answers these requests in the browser. `@nuxvel/nuxt/storybook/mocks` gives you the handlers for the nuxvel requests:

- `mockTrpc(mocks)` answers the tRPC calls of `$api`. `mocks` has the shape of the app router. Each procedure is a function that takes the input and returns the output. TypeScript checks the input and the output against the router.
- `mockUser(user)` answers the session request of `useUser()`. The story renders signed in as `user`. With `null`, the story renders signed out. A field that you do not give gets a fixed value, for example the id `user-1`.

Install MSW and its Storybook addon:

```bash
npm install -D msw msw-storybook-addon
```

Write the MSW worker file into `.storybook/public/`. `--save` records the folder in `package.json`, so an update of `msw` also updates the file:

```bash
npx msw init .storybook/public --save
```

Tell Storybook to serve this folder. Add `staticDirs` to `.storybook/main.ts`:

```ts
// .storybook/main.ts
const config: StorybookConfig = {
  stories: ["../app/**/*.stories.ts", nuxvelStories()],
  framework: { name: "@storybook-vue/nuxt", options: { docgen: "vue-component-meta" } },
  addons: ["@storybook/addon-vitest", "@storybook/addon-a11y"],
  staticDirs: ["./public"],
};
```

Start MSW in `.storybook/preview.ts`. With `onUnhandledRequest: "bypass"`, a request that no handler answers goes to the network without an MSW warning:

```ts
// .storybook/preview.ts
import type { Preview } from "@storybook-vue/nuxt";
import { setupWorker } from "msw/browser";
import { mswLoader } from "msw-storybook-addon/csf3";
import { nuxvelPreview } from "@nuxvel/nuxt/storybook/preview";

async function startWorker() {
  const worker = setupWorker();
  await worker.start({ quiet: true, onUnhandledRequest: "bypass" });
  return worker;
}

const preview: Preview = { ...nuxvelPreview, loaders: [mswLoader(startWorker)] };

export default preview;
```

`nuxvelPreview` is the part of the preview that every nuxvel app needs. Spread it in the `preview.ts` of every app, also an app with no MSW. It wraps each story in `<UApp>`, so a toast (`useToast()`) or an overlay such as `UModal` works in a story. A toast and a modal render outside the story, in `document.body`. The wrapper creates the story one time. A story keeps its state, for example the values of a form, when a toast shows. `nuxvelPreview` also sets `canvasElement.id`, because `@storybook-vue/nuxt` throws `StoryContext is not provided` for a story with no id, which is the case when Vitest runs the story. Do not wrap a story in `<UApp>` yourself: a second `<UApp>` makes a second `Notifications` region.

Give each story its handlers in `parameters.msw`:

```ts
// app/components/PostActions.stories.ts
import type { Meta, StoryObj } from "@storybook-vue/nuxt";
import { mockTrpc, mockUser } from "@nuxvel/nuxt/storybook/mocks";
import PostActions from "./PostActions.vue";

const meta = { component: PostActions, args: { post: { id: 1, title: "Hello", can: { update: true, delete: true } } } } satisfies Meta<typeof PostActions>;
export default meta;

export const CanEdit: StoryObj<typeof meta> = {
  parameters: { msw: [mockUser({ name: "Ada" })] },
};
```

For other requests, for example `$fetch("/api/notifications")`, write an MSW handler with `http` from `msw`:

```ts
import { http, HttpResponse } from "msw";

const notifications = http.get("*/api/notifications", () => HttpResponse.json({ unreadCount: 0, notifications: [] }));
```

`mockTrpc` answers batched and single calls, queries and mutations. It encodes the answer with superjson, as the nuxvel server does, so a `Date` stays a `Date`. A call to a procedure that `mocks` does not name fails with the tRPC error `NOT_FOUND`. `mockUser` answers `GET /api/auth/get-session`, the request that `useUser()` sends, and `POST /api/auth/sign-out`, so a story can click "Sign out". After the sign-out, it answers the session request with `null`, as the server does.

To show the error state of a component, throw an error from the mock, as a real procedure does:

```ts
import { ActionError, mockTrpc, TRPCError } from "@nuxvel/nuxt/storybook/mocks";

export const Forbidden: StoryObj<typeof meta> = {
  parameters: { msw: [mockTrpc({ post: { byId: () => { throw new TRPCError({ code: "FORBIDDEN" }); } } })] },
};

export const BodyEmpty: StoryObj<typeof meta> = {
  parameters: {
    msw: [mockTrpc({ post: { update: () => { throw new ActionError("post.body-empty", "Body cannot be empty after trimming", "posts.update-post", "body"); } } })],
  },
};
```

The handler sends the error in the same shape and with the same HTTP status as the nuxvel server, so `error.data` in the component has the same values as in production. A `TRPCError` keeps its code and its message. Any other error becomes `INTERNAL_SERVER_ERROR`. `@nuxvel/nuxt/storybook/mocks` also exports the errors that add data to the answer:

- `ActionError(code, message, action?, field?)` adds `data.actionCode`, the error of an action's `fail()`. A `field` adds the message to `data.fields`, so `useActionForm` shows it under that field. The `failures` option of the form overrides the field.
- `ValidationFailedError(zodError)` and `ConflictError(message, { field })` add `data.fields`, the messages per input field.
- `RateLimitedError(message, { retryAfter })` adds `data.retryAfter`.

The server and the mock get these values from the same function (`errorExtras` in `runtime/server/trpc/error-extras.ts`), so they cannot differ. The server-only values (`data.requestId`, the generic message of a `500`, `CLIENT_OUTDATED`) do not occur in a story.

### Checking the tRPC calls

`trpcSpy(path, implementation)` makes a spy for one procedure. Give the spy to `mockTrpc` at the same path. The spy answers like the `implementation`, and it records each call. Then check the calls with `expect(spy)` of `@nuxvel/nuxt/storybook/test`:

```ts
// app/components/PostEditForm.stories.ts
import { mockTrpc, trpcSpy } from "@nuxvel/nuxt/storybook/mocks";
import { button, expect, field, page } from "@nuxvel/nuxt/storybook/test";

const update = trpcSpy("post.update", (input) => ({ ...post, ...input }));

export const Saves: StoryObj<typeof meta> = {
  parameters: { msw: [mockTrpc({ post: { update } })] },
  play: async () => {
    await field(page, "Title").fill("Hello again");
    await field(page, "Body").fill("New body");
    await button(page, "Save post").click();
    await expect(update).toHaveBeenCalledWith({ id: 1, title: "Hello again", body: "New body" });
    await expect(update).toHaveBeenCalledTimes(1);
  },
};
```

- TypeScript checks the path, the input and the output of the `implementation` against the router. `TrpcPath` is the type of a path, such as `"post.update"`. `TrpcProcedure<"post.update">` is the function type of that procedure.
- `expect(spy)` has `toHaveBeenCalled`, `toHaveBeenCalledTimes`, `toHaveBeenCalledWith` and `toHaveBeenLastCalledWith`, with `.not`. The arguments of `toHaveBeenCalledWith` have the input type of the procedure. Each assertion tries again until it passes or 5 seconds pass, because the call goes through the network. Then it fails with the calls of the spy and a diff.
- The spy is a `fn()` of `storybook/test` with the name of the path. Storybook clears it before each story, and the Actions panel shows its calls.

Some requests of the app have no handler and get a 404 in Storybook, for example `/api/flags`, `/api/channels` and the service worker of the PWA. The story still renders.

`msw` is an optional peer dependency of `@nuxvel/nuxt`: only `@nuxvel/nuxt/storybook/mocks` imports it, and the handlers must come from the same `msw` copy as the worker in `preview.ts`. Use `msw` 2, because Vitest 5 asks for `msw` 2. The mocks are in their own entry, not in `@nuxvel/nuxt/storybook`, because `main.ts` runs in Node and its types do not include the app router.

## Running Storybook

- `npm run storybook` starts Storybook on port 6006. Run it in its own terminal, next to `npm run dev`.
- `nuxt dev` and `nuxvel dev` do not start Storybook.
- `npm run storybook:build` writes a static site to `storybook-static/`. Any static file server can serve it.

## Play functions

A `play` function acts on the story after it renders, and checks the result. Write it with the helpers of `@nuxvel/nuxt/storybook/test`. They have the names, the arguments and the options of the [end-to-end helpers](./testing.md#find-elements), so a `play` function reads like an end-to-end test:

```ts
// app/components/PostEditForm.stories.ts
import type { Meta, StoryObj } from "@storybook-vue/nuxt";
import { ActionError, mockTrpc } from "@nuxvel/nuxt/storybook/mocks";
import { button, expect, field, page, text } from "@nuxvel/nuxt/storybook/test";
import PostEditForm from "./PostEditForm.vue";

const meta = { component: PostEditForm, args: { post: { id: 1, title: "Hello", body: " " } } } satisfies Meta<typeof PostEditForm>;
export default meta;

export const BodyEmpty: StoryObj<typeof meta> = {
  parameters: {
    msw: [mockTrpc({ post: { update: () => { throw new ActionError("post.body-empty", "Body cannot be empty after trimming", "posts.update-post", "body"); } } })],
  },
  play: async () => {
    await field(page, "Title").fill("Hello again");
    await button(page, "Save post").click();
    await expect(text(page, "Body cannot be empty after trimming")).toBeVisible();
    await expect(field(page, "Body")).toHaveAttribute("aria-invalid", "true");
  },
};
```

`PostEditForm` is an [`<ActionForm>`](./frontend.md#the-form-from-the-schema) on `$api.post.update`. The form renders its fields from the shared input schema, so the story needs only `mockTrpc` for the mutation. A schema error shows with no call:

```ts
const update = trpcSpy("post.update", (input) => ({ ...post, ...input }));

export const RequiresTitle: StoryObj<typeof meta> = {
  parameters: { msw: [mockTrpc({ post: { update } })] },
  play: async () => {
    await field(page, "Title").clear();
    await button(page, "Save post").click();
    await expect(field(page, "Title")).toHaveAttribute("aria-invalid", "true");
    await expect(update).not.toHaveBeenCalled();
  },
};
```

- `page` is the whole document of the story. It takes the place of the page that `visit()` returns. A dialog, a menu and a toast render outside the story's `canvasElement`, so find them in `page`. A helper also takes a locator or `canvasElement` as its scope.
- `button`, `link`, `heading`, `field`, `text`, `cell`, `dialog`, `menu`, `menuitem`, `alert` and `toast` return a `Locator`. Its methods have the names and the arguments of the Playwright `Locator`: `click`, `fill`, `clear`, `pressSequentially`, `press`, `check`, `uncheck`, `setChecked`, `hover`, `unhover`, `focus`, `blur`, `waitFor`, `count`, `all`, `first`, `last`, `nth`, `filter`, `getByRole`, `getByLabel`, `getByText` and `locator`.
- An action waits until exactly one element matches and is visible. `click`, `fill`, `check`, `hover` and `unhover` also wait until the element is enabled and takes pointer events. Reka UI sets `pointer-events: none` while a popover closes. The wait fails after 5 seconds. Give `{ timeout }` to change it for one call.
- `fill` pastes the text in one step. For a date, time, month, week, color or range input, it sets the value. `pressSequentially(text, { delay })` types one key at a time. `press` takes a Playwright key name, such as `Enter`, `Escape`, `ArrowDown` or `Control+A`.
- `fillForm(scope, { Label: value })` fills the Nuxt UI controls like the [end-to-end `fillForm`](./testing.md#find-elements): a string for a text field, a boolean for `UCheckbox` and `USwitch`, the option label for `USelect`, `USelectMenu` and `URadioGroup`, and an ISO date for `<UInput type="date">` and `UInputDate`. After a select, it waits until the list of options is gone. A value that does not fit the control fails with the label and the control kind.
- `expect(locator)` has the Playwright assertions `toBeVisible`, `toBeHidden`, `toHaveText`, `toContainText`, `toHaveValue`, `toHaveCount`, `toBeChecked`, `toBeDisabled`, `toBeEnabled` and `toHaveAttribute`, with `.not`. Each one tries again until it passes or 5 seconds pass. Then it fails with the locator, the expected value and the last value it received.
- `expect(value)` for any other value is the `expect` of `storybook/test`, with `.not`, `.resolves`, `.rejects`, the asymmetric matchers such as `expect.any(Number)` and the jest-dom matchers such as `toHaveTextContent`.

A `play` function has no fake timers: `vi.useFakeTimers` does not run in the Storybook UI. For a debounced search, a field that validates while the user types, or a tooltip, type with a short real `delay` and let `expect` try again until the call or the text arrives:

```ts
const list = trpcSpy("post.list", (input) => ({ rows: [], page: 1, perPage: 15, total: input?.q ? 1 : 0, lastPage: 1 }));

export const Debounces = {
  parameters: { msw: [mockTrpc({ post: { list } })] },
  play: async () => {
    await field(page, "Search").pressSequentially("hello", { delay: 50 });
    await expect(list).toHaveBeenCalledWith({ q: "hello" });
    await expect(list).toHaveBeenCalledTimes(2);
  },
};

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
```

The first call of `list` is the query with an empty search, when the component mounts. A Nuxt UI tooltip shows its text two times. The second copy has `aria-hidden="true"`, and `text()` skips it, so `text()` finds only the visible copy. See [Typing, timers and hover](./testing.md#typing-timers-and-hover) for the end-to-end form, with the Playwright clock.

Import `expect` from `@nuxvel/nuxt/storybook/test`, not from `storybook/test`. The helpers use Testing Library and `userEvent` of `storybook/test`, so the same `play` function runs under `nuxvel test:ui` and in the Storybook UI. Each action shows as a step in the Interactions panel. `@nuxvel/nuxt` has `storybook` as an optional peer dependency. A new app already has it. See the [helper table](./testing.md#component-tests) for the end-to-end form of each helper.

## Component tests

`nuxvel test:ui` runs each story as a Vitest browser test, and runs its `play` function. The test widget of the Storybook UI ("Run component tests") runs the same tests. Both need `@storybook/addon-vitest` in `main.ts` and the `ui` project in `vitest.config.ts`. See [Testing: component tests](./testing.md#component-tests).

### Debug a failed story

A failed story prints a link to the same story in the Storybook UI, with the Interactions panel open. Start Storybook with `npm run storybook` and open the link. The panel shows each step of the `play` function and the step that failed. Use the controls of the panel to go back one step.

## Accessibility

`@storybook/addon-a11y` runs axe-core after each story, in the Storybook UI (the Accessibility panel) and under `nuxvel test:ui`. `nuxvelPreview` sets `parameters.a11y` so that a violation fails the story. The rules are the rules of [`expectAccessible`](./testing.md#accessibility): the WCAG 2.1 AA tags, and the two hidden focus catchers that Nuxt UI adds next to an open toast are skipped. The overlay that Vite shows when a story file cannot load (`vite-error-overlay`) is skipped too, so only the broken story file fails, with its own load error, and the other stories pass. The failure names the rule, the element and a link to the fix. A story needs no code for this.

A story turns off a rule for itself with `parameters.a11y.config.rules`:

```ts
export const Embedded: StoryObj<typeof Map> = {
  parameters: { a11y: { config: { rules: [{ id: "color-contrast", enabled: false }] } } },
};
```

In the Storybook UI, the test widget runs the check only when its "Accessibility" box is on. `nuxvel test:ui` always runs it.

## How it works

When the app has a `.storybook/` folder, nuxvel adds it to the generated `tsconfig`, so `nuxt typecheck` checks `main.ts`. A story under `app/` is already in the app `tsconfig`.

`@storybook-vue/nuxt` loads the Nuxt app as a production build without SSR, and uses its Vite configuration for the stories. The app's modules, plugins and CSS thus apply to each story. With `nuxvel.ui` on, Nuxt UI and its styles are in each story. You do not import the CSS in `.storybook/preview.ts`.

While Storybook builds, the module removes the `nuxt-fonts-public-assets` plugin of `@nuxt/fonts` 0.14, because it crashes on each font request and stops `nuxvel test:ui`. Fonts still load in the Storybook page. The app needs no code for this.

While Storybook builds, the module also asks Vite to pre-bundle `sanitize-html`. It is a CommonJS package, so without the pre-bundle a story whose component imports a schema with `richText()` fails with "does not provide an export named 'default'". The module also does not install `nuxt-og-image` in this build. Storybook has no server rendering, and the module would print "Nuxt OG Image is enabled but SSR is disabled". The build of the app keeps `nuxt-og-image`.

The nuxvel stories are in `@nuxvel/nuxt`, next to their components. `nuxt-module-build` normally leaves `*.stories.*` files out of a module's `dist/`. The nuxvel build keeps them. The module also tells Nuxt to ignore `*.stories.*` in its component folder, so a story is never registered as a component.
