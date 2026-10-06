import { once } from "node:events";
import { cpSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { createServer } from "node:http";
import { basename, extname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { stripVTControlCharacters } from "node:util";
import { loadNuxt } from "@nuxt/kit";
import { expect } from "@nuxvel/nuxt/testing";
import { freePort } from "@nuxvel/test-helpers/free-port";
import { run } from "@nuxvel/test-helpers/run";
import { chromium } from "playwright-core";
import { afterAll, describe, it } from "vitest";

const repoRoot = fileURLToPath(new URL("../../../", import.meta.url));
const cliEntry = join(repoRoot, "packages/cli/bin/nuxvel.mjs");
const playgroundDir = join(repoRoot, "playground");
const playgroundOutputs = new Set([".nuxt", ".output", ".nuxvel", ".data", ".env", ".nuxtrc", "node_modules"]);

const contentTypes: Record<string, string> = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css" };

const appDir = mkdtempSync(join(repoRoot, ".nuxvel-test-storybook-"));
cpSync(playgroundDir, appDir, {
  recursive: true,
  filter: (source) => source === playgroundDir || !(playgroundOutputs.has(basename(source)) || basename(source).startsWith(".nuxvel-test")),
});
symlinkSync(join(playgroundDir, "node_modules"), join(appDir, "node_modules"));
const nuxtConfig = join(appDir, "nuxt.config.ts");
writeFileSync(nuxtConfig, readFileSync(nuxtConfig, "utf8").replace("nuxvel: {", "nuxvel: {\n    seo: { siteName: 'Playground', ogImage: true },"));
writeFileSync(join(appDir, "app/components/ToastKeepsState.vue"), `<script setup lang="ts">
const toast = useToast()
const saved = ref("")
function save() {
  saved.value = "kept"
  toast.add({ title: "Saved" })
}
</script>

<template>
  <div>
    <button type="button" @click="save">Save</button>
    <output>{{ saved }}</output>
  </div>
</template>
`);
writeFileSync(join(appDir, "app/components/ToastKeepsState.stories.ts"), `import { button, expect, page, toast } from "@nuxvel/nuxt/storybook/test";
import ToastKeepsState from "./ToastKeepsState.vue";

export default { title: "Probes/ToastKeepsState", component: ToastKeepsState };

export const Default = {
  play: async () => {
    await button(page, "Save").click();
    await expect(toast(page, "Saved")).toBeVisible();
    await expect(page.locator("output")).toHaveText("kept");
    await toast(page, "Saved").dismiss();
    await expect(toast(page, "Saved")).toHaveCount(0);
  },
};
`);
writeFileSync(join(appDir, "app/components/DarkProbe.vue"), `<template>
  <p>Mode probe</p>
</template>
`);
writeFileSync(join(appDir, "app/components/DarkProbe.stories.ts"), `import { expect, page, text } from "@nuxvel/nuxt/storybook/test";
import DarkProbe from "./DarkProbe.vue";

export default { title: "Probes/DarkProbe", component: DarkProbe };

export const Light = {
  play: async () => {
    await expect(text(page, "Mode probe")).toBeVisible();
    expect(document.documentElement).not.toHaveClass("dark");
  },
};

export const Dark = {
  globals: { theme: "dark" },
  play: async () => {
    await expect(text(page, "Mode probe")).toBeVisible();
    expect(document.documentElement).toHaveClass("dark");
  },
};
`);
writeFileSync(join(appDir, "app/components/LocatorProbe.vue"), `<script setup lang="ts">
const typed = ref("")
const keys = ref<string[]>([])
const agreed = ref(false)
const notify = ref(false)
const hovered = ref(false)
const focused = ref(false)
</script>

<template>
  <div>
    <label>Search <input v-model="typed" @keydown="keys.push($event.key)" @focus="focused = true" @blur="focused = false"></label>
    <label><input v-model="agreed" type="checkbox"> Agree</label>
    <UCheckbox v-model="notify" label="Notify me" />
    <button type="button" @mouseenter="hovered = true" @mouseleave="hovered = false">Hover me</button>
    <button type="button" disabled>Locked</button>
    <output aria-label="Keys">{{ keys.join(" ") }}</output>
    <p>{{ hovered ? "Hovered" : "Not hovered" }}</p>
    <p>{{ focused ? "Focused" : "Not focused" }}</p>
    <ul><li>One</li><li>Two</li></ul>
  </div>
</template>
`);
writeFileSync(join(appDir, "app/components/LocatorProbe.stories.ts"), `import { button, expect, field, page, text } from "@nuxvel/nuxt/storybook/test";
import LocatorProbe from "./LocatorProbe.vue";

export default { title: "Probes/LocatorProbe", component: LocatorProbe };

export const EveryMethod = {
  play: async ({ canvasElement }: { canvasElement: HTMLElement }) => {
    const search = field(canvasElement, "Search");
    await search.pressSequentially("a{b", { delay: 10 });
    await expect(search).toHaveValue("a{b");
    await expect(page.getByRole("status", { name: "Keys" })).toHaveText("a { b");
    await search.press("Control+A");
    await search.press("Backspace");
    await expect(search).toHaveValue("");
    await search.fill("Hello [world]");
    await expect(search).toHaveValue("Hello [world]");
    await search.clear();
    await expect(search).toHaveValue("");

    await search.focus();
    await expect(text(page, "Focused")).toBeVisible();
    await search.blur();
    await expect(text(page, "Not focused")).toBeVisible();

    await field(page, "Agree").check();
    await expect(field(page, "Agree")).toBeChecked();
    await field(page, "Agree").uncheck();
    await expect(field(page, "Agree")).not.toBeChecked();
    await field(page, "Notify me").check();
    await expect(field(page, "Notify me")).toBeChecked();

    await button(page, "Hover me").hover();
    await expect(text(page, "Hovered")).toBeVisible();
    await button(page, "Hover me").unhover();
    await expect(text(page, "Not hovered")).toBeVisible();

    await expect(button(page, "Locked")).toBeDisabled();
    await expect(button(page, "hover", { exact: false })).toBeEnabled();
    await expect(page.getByRole("listitem").filter({ hasText: "two" })).toHaveCount(1);
    await expect(page.getByRole("listitem").last()).toHaveText(/^Tw/);
    await expect(text(canvasElement, "One")).toContainText("ne");

    await expect(expect(text(page, "Missing")).toBeVisible({ timeout: 50 })).rejects.toThrow('Locator: page.getByText("Missing")');
    await expect(button(page, "Locked").click({ timeout: 50 })).rejects.toThrow("the element is disabled");
    expect({ id: 7 }).toEqual({ id: expect.any(Number) });
  },
};
`);
cpSync(join(repoRoot, "packages/nuxt/test/fixtures/probes/app/pages/_form-controls.vue"), join(appDir, "app/components/FormControls.vue"));
writeFileSync(join(appDir, "app/components/FormControls.stories.ts"), `import { button, expect, fillForm, page } from "@nuxvel/nuxt/storybook/test";
import FormControls from "./FormControls.vue";

export default { title: "Probes/FormControls", component: FormControls };

export const FillsEveryControl = {
  play: async ({ canvasElement }: { canvasElement: HTMLElement }) => {
    await fillForm(canvasElement, {
      Name: "Ada",
      Bio: "Hello",
      Role: "Editor",
      Tag: "Green",
      "Accept terms": true,
      "Notify me": true,
      Plan: "Pro",
      Born: "1990-05-06",
      Starts: "2026-03-14",
    });
    await button(canvasElement, "Send").click();
    const sent = page.getByRole("status", { name: "Sent" });
    for (const part of ['"name":"Ada"', '"role":"Editor"', '"tag":"Green"', '"terms":true', '"notify":true', '"plan":"Pro"', '"born":"1990-05-06"', '"starts":"2026-03-14"']) {
      await expect(sent).toContainText(part);
    }
    await expect(fillForm(canvasElement, { Terms: "yes" })).rejects.toThrow("no field has the label");
    await expect(fillForm(canvasElement, { Name: true })).rejects.toThrow('"Name" is a text control and cannot take the boolean true');
    await expect(fillForm(canvasElement, { "Accept terms": "yes" })).rejects.toThrow('"Accept terms" is a toggle control and cannot take the string "yes"');
  },
};
`);
for (const file of ["_PostSearch.vue", "_PostSearch.stories.ts", "_PostList.vue", "_PostList.stories.ts", "_LiveForm.vue", "_LiveForm.stories.ts", "_FrameworkText.vue", "_FrameworkText.stories.ts"]) {
  cpSync(join(repoRoot, "packages/nuxt/test/fixtures/probes/app/components", file), join(appDir, "app/components", file));
}
cpSync(join(repoRoot, "packages/create/template/vitest.config.ts"), join(appDir, "vitest.config.ts"));
afterAll(() => rmSync(appDir, { recursive: true, force: true }));

async function storybookModules(dev: boolean) {
  const nuxt = await loadNuxt({ cwd: appDir, dev, overrides: { test: false, buildDir: join(appDir, ".nuxt") } });
  const names = nuxt.options._installedModules.map(({ meta }) => meta?.name ?? "").filter((name) => name.includes("storybook"));
  await nuxt.close();
  return names;
}

describe("Storybook", () => {
  it.for([true, false])("installs no Storybook module in an app with .storybook/ (dev %s)", { timeout: 60_000 }, async (dev) => {
    expect(await storybookModules(dev)).toEqual([]);
  });

  it("builds the nuxvel stories and the app stories, with Nuxt UI styles and MSW mocks, in an app with Open Graph images", { timeout: 180_000 }, async () => {
    const { TEST: _test, VITEST: _vitest, NODE_ENV: _nodeEnv, ...env } = process.env;
    const buildEnv = { ...env, STORYBOOK_DISABLE_TELEMETRY: "1" };
    const prepare = await run("npx", ["nuxt", "prepare"], appDir, buildEnv);
    expect(prepare.exitCode, prepare.output).toBe(0);
    expect(readFileSync(join(appDir, ".nuxt/components.d.ts"), "utf8")).not.toMatch(/stories/i);
    const build = await run("npx", ["storybook", "build", "--output-dir", "storybook-static"], appDir, buildEnv);
    expect(build.exitCode, build.output).toBe(0);

    // a service worker (MSW) registers only in a secure context, so the stories are served from localhost, not through page.route
    const port = await freePort();
    const server = createServer((request, response) => {
      const file = join(appDir, "storybook-static", new URL(request.url ?? "/", "http://localhost").pathname);
      readFile(file).then(
        (body) => response.writeHead(200, { "content-type": contentTypes[extname(file)] ?? "application/octet-stream" }).end(body),
        () => response.writeHead(404).end(),
      );
    }).listen(port);
    await once(server, "listening");
    const browser = await chromium.launch();
    try {
      const page = await browser.newPage({ timezoneId: "UTC" });
      // the play function can end before page.evaluate runs, so the listener goes on the channel when Storybook creates it
      await page.addInitScript(() => {
        let channel: { on(event: string, listener: (payload: { status?: string; message?: string }) => void): void } | undefined;
        Object.defineProperty(window, "__STORYBOOK_ADDONS_CHANNEL__", {
          configurable: true,
          get: () => channel,
          set(next: NonNullable<typeof channel>) {
            channel = next;
            next.on("storyFinished", ({ status }) => Reflect.set(window, "storyFinished", status));
            next.on("playFunctionThrewException", ({ message }) => Reflect.set(window, "playError", message));
          },
        });
      });
      const story = (id: string) => page.goto(`http://localhost:${port}/iframe.html?id=${id}&viewMode=story`);

      await story("nuxvel-datetime--absolute");
      await expect.poll(() => page.locator("#storybook-root time").textContent()).toBe("Jan 2, 2026, 3:04 AM");
      expect(await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue("--ui-primary"))).not.toBe("");

      await story("components-postactions--can-edit");
      await expect.poll(() => page.getByRole("button", { name: "Delete Hello" }).count()).toBe(1);
      expect(await page.getByRole("link", { name: "Edit Hello" }).count()).toBe(1);

      await story("probes-toastkeepsstate--default");
      await page.waitForFunction(() => Reflect.get(window, "storyFinished"));
      expect(await page.evaluate(() => [Reflect.get(window, "storyFinished"), Reflect.get(window, "playError")])).toEqual(["success", undefined]);

      await story("nuxvel-confirmdialog--default");
      await expect.poll(() => page.getByRole("dialog", { name: "Delete post?" }).count()).toBe(1);
      expect(await page.locator('[role="region"][aria-label^="Notifications"]').count()).toBe(1);

      await story("components-greeting--english");
      await expect.poll(() => page.getByText("Hello").count()).toBe(1);
      await page.evaluate(() => Reflect.get(window, "__STORYBOOK_ADDONS_CHANNEL__").emit("updateGlobals", { globals: { locale: "zh" } }));
      await expect.poll(() => page.getByText("你好").count()).toBe(1);

      await story("components-usermenu--signed-in");
      await expect.poll(() => page.getByRole("button", { name: "Notifications, 1 unread" }).count()).toBe(1);
      expect(await page.getByRole("button", { name: "ada@example.com" }).count()).toBe(1);
    } finally {
      await browser.close();
      server.close();
    }
  });

  it("runs the play functions of the stories under nuxvel test:ui", { timeout: 180_000 }, async () => {
    const { TEST: _test, VITEST: _vitest, NODE_ENV: _nodeEnv, ...env } = process.env;
    const prepare = await run("npx", ["nuxt", "prepare"], appDir, env);
    expect(prepare.exitCode, prepare.output).toBe(0);

    const result = await run("node", [cliEntry, "test:ui", "--reporter=verbose"], appDir);
    const output = stripVTControlCharacters(result.output);

    expect(result.exitCode, output).toBe(0);
    for (const story of ["Every Method", "Fills Every Control", "Default", "Can Edit", "Read Only", "Body Empty", "Signed In", "Signed Out", "Debounces", "Refetches After Delete", "Validates And Hovers", "Light", "Dark"]) {
      expect(output).toMatch(new RegExp(`✓ .*${story}`));
    }
    expect(output).toMatch(/✓ .*PostEditForm.*Saves/);
    expect(output).toMatch(/✓ .*UserMenu.*Signs Out/);
    expect(output).toMatch(/✓ .*Greeting.*Chinese(?! Global)/);
    expect(output).toMatch(/✓ .*Greeting.*Chinese Global/);
    expect(output).toMatch(/✓ .*Greeting.*English/);
    expect(output).toMatch(/✓ .*SignInForm.*English/);
    expect(output).toMatch(/✓ .*SignInForm.*Chinese/);
    expect(output).toMatch(/✓ .*FrameworkText.*Chinese/);
  });

  it("fails only the story file that cannot load, with its own error", { timeout: 180_000 }, async () => {
    const { TEST: _test, VITEST: _vitest, NODE_ENV: _nodeEnv, ...env } = process.env;
    const prepare = await run("npx", ["nuxt", "prepare"], appDir, env);
    expect(prepare.exitCode, prepare.output).toBe(0);
    const broken = join(appDir, "app/components/Broken.stories.ts");
    writeFileSync(broken, `import Missing from "./does-not-exist.vue";

export default { title: "Probes/Broken", component: Missing };

export const Default = {};
`);
    try {
      const result = await run("node", [cliEntry, "test:ui", "--reporter=verbose"], appDir, env);
      const output = stripVTControlCharacters(result.output);

      expect(result.exitCode, output).not.toBe(0);
      expect(output).toMatch(/does-not-exist/);
      expect(output).not.toMatch(/vite-error-overlay/);
      expect(output).toMatch(/✓ .*Every Method/);
      expect(output).toMatch(/✓ .*Signed In/);
    } finally {
      rmSync(broken, { force: true });
    }
  });
});
