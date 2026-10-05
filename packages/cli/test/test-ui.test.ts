import { cpSync, mkdirSync, readdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { runBinAt, runCliAt, stripAnsi } from "./helpers/run.ts";
import { playgroundDir, repoNodeModules, repoRoot, scratchPlayground } from "./helpers/scratch.ts";

const probeStories = `import { h } from "vue";

const meta = { title: "Probe", render: () => ({ setup: () => () => h("p", "Hello from the probe") }) };

export default meta;

export const ShowsText = {
  play: ({ canvasElement }: { canvasElement: HTMLElement }) => {
    if (!canvasElement.textContent?.includes("Hello from the probe")) throw new Error("the probe text is missing");
  },
};

export const BreaksOnPurpose = {
  play: () => {
    throw new Error("the probe breaks on purpose");
  },
};
`;

const accessibilityStories = `import { h } from "vue";
import { useToast } from "#imports";

const meta = { title: "Accessibility" };

export default meta;

export const UnnamedButton = { render: () => ({ setup: () => () => h("button", { type: "button" }) }) };

export const OpenToast = {
  render: () => ({
    setup() {
      useToast().add({ title: "Saved", duration: 0 });
      return () => h("p", "Page");
    },
  }),
};
`;

const fontComponent = `<template><p class="font-probe">Hello font</p></template>

<style>
.font-probe {
  font-family: "Inter", sans-serif;
}
</style>
`;

const fontStories = `import FontProbe from "./FontProbe.vue";

export default { title: "Font", component: FontProbe };

export const Default = {};
`;

const richTextComponent = `<script setup lang="ts">
import { richTextProbeInput } from "../../shared/schemas/_rich-text-probe";

const cleaned = richTextProbeInput.parse({ body: "<b>Hi</b><img src=x onerror=y>" }).body;
</script>

<template><p class="rich-probe" v-html="cleaned" /></template>
`;

const richTextStories = `import RichProbe from "./RichProbe.vue";

export default { title: "RichText", component: RichProbe };

export const Default = {};
`;

function withPlaygroundDependencies(appDir: string) {
  const modulesDir = join(appDir, "node_modules");

  rmSync(modulesDir);
  mkdirSync(modulesDir);
  for (const source of [join(playgroundDir, "node_modules"), repoNodeModules]) {
    for (const name of readdirSync(source)) {
      if (name === "@nuxvel" || name.startsWith(".")) continue;
      try {
        symlinkSync(join(source, name), join(modulesDir, name));
      } catch {}
    }
  }
  symlinkSync(join(repoNodeModules, "@nuxvel"), join(modulesDir, "@nuxvel"));
}

function storyApp() {
  const appDir = scratchPlayground("test-ui");

  cpSync(join(repoRoot, "packages", "create", "template", "vitest.config.ts"), join(appDir, "vitest.config.ts"));
  writeFileSync(join(appDir, "app", "components", "Probe.stories.ts"), probeStories);

  return appDir;
}

describe("nuxvel test:ui", () => {
  it("runs each story's play function as a browser test, with no services, and fails when one fails", { timeout: 180000 }, async () => {
    const appDir = storyApp();

    const result = await runCliAt(appDir, "test:ui", "app/components/Probe.stories.ts", "--reporter=verbose");
    const output = stripAnsi(result.stdout + result.stderr);

    expect(result.exitCode, output).toBe(1);
    expect(output).toMatch(/✓ .*Shows Text/);
    expect(output).toMatch(/× .*Breaks On Purpose/);
    expect(output).toContain("the probe breaks on purpose");
    expect(output).toMatch(/Click to debug the error directly in Storybook: http:\/\/localhost:6006\/\?path=\/story\/probe--breaks-on-purpose/);
    expect(output).not.toContain("dev services");
  });

  it("the story that make:story writes passes at once", { timeout: 180000 }, async () => {
    const appDir = storyApp();

    writeFileSync(join(appDir, "app", "components", "Hello.vue"), "<template><p>Hello</p></template>\n");
    const made = await runCliAt(appDir, "make:story", "Hello");
    expect(made.exitCode, made.stderr).toBe(0);

    const result = await runCliAt(appDir, "test:ui", "app/components/Hello.stories.ts", "--reporter=verbose");
    const output = stripAnsi(result.stdout + result.stderr);

    expect(result.exitCode, output).toBe(0);
    expect(output).toMatch(/✓ .*Default/);
  });

  it("fails a story on an axe violation, and passes one with an open toast", { timeout: 180000 }, async () => {
    const appDir = storyApp();

    writeFileSync(join(appDir, "app", "components", "Accessibility.stories.ts"), accessibilityStories);
    const result = await runCliAt(appDir, "test:ui", "app/components/Accessibility.stories.ts", "--reporter=verbose");
    const output = stripAnsi(result.stdout + result.stderr);

    expect(result.exitCode, output).toBe(1);
    expect(output).toMatch(/× .*Unnamed Button/);
    expect(output).toContain("button-name");
    expect(output).toMatch(/✓ .*Open Toast/);
  });

  it("passes a story of a component that loads a web font through @nuxt/fonts", { timeout: 180000 }, async () => {
    const appDir = storyApp();

    writeFileSync(join(appDir, "app", "components", "FontProbe.vue"), fontComponent);
    writeFileSync(join(appDir, "app", "components", "FontProbe.stories.ts"), fontStories);
    const result = await runCliAt(appDir, "test:ui", "app/components/FontProbe.stories.ts", "--reporter=verbose");
    const output = stripAnsi(result.stdout + result.stderr);

    expect(result.exitCode, output).toBe(0);
    expect(output).toMatch(/✓ .*Default/);
  });

  it("passes a story that imports a schema with richText(), and prints no OG image warning", { timeout: 180000 }, async () => {
    const appDir = storyApp();
    const configPath = join(appDir, "nuxt.config.ts");

    withPlaygroundDependencies(appDir);
    writeFileSync(configPath, readFileSync(configPath, "utf8").replace("nuxvel: {", "nuxvel: {\n    seo: { siteName: 'Probe', ogImage: true },"));
    writeFileSync(join(appDir, "app", "components", "RichProbe.vue"), richTextComponent);
    writeFileSync(join(appDir, "app", "components", "RichProbe.stories.ts"), richTextStories);
    const result = await runCliAt(appDir, "test:ui", "app/components/RichProbe.stories.ts", "--reporter=verbose");
    const output = stripAnsi(result.stdout + result.stderr);

    expect(result.exitCode, output).toBe(0);
    expect(output).toMatch(/✓ .*Default/);
    expect(output).not.toContain("SSR is disabled");
  });

  it("the Vitest config of the starter loads the ui project only for test:ui, so nuxvel test never loads Storybook", async () => {
    const appDir = storyApp();

    const result = await runBinAt(appDir, "vitest", ["list", "--project", "ui"], { ...process.env, NUXVEL_TEST_UI: "", VITEST_STORYBOOK: "" });

    expect(result.exitCode).not.toBe(0);
    expect(stripAnsi(result.stdout + result.stderr)).toContain("The filter matched no projects: ui");
  });
});
