import { existsSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";

const subpathEntries = [
  "src/cli",
  "src/database",
  "src/storage",
  "src/queue",
  "src/redis",
  "src/env",
  "src/migrations",
  "src/factories",
  "src/storybook",
  "src/storybook-mocks",
  "src/storybook-preview",
  "src/storybook-test",
  "src/eslint",
  "src/eslint/architecture",
  "src/testing/index",
  "src/testing/setup",
  "src/testing/database-setup",
  "src/testing/global-setup",
  "src/testing/changes-reporter",
  "src/testing/factories/factory-defaults",
];

type StubContext = { options: { stub: boolean; rootDir: string; outDir: string } };
type MkdistOptions = { pattern?: string | string[] };

function reexportSource(rootDir: string, outDir: string, entry: string) {
  const out = join(outDir, `${entry.replace(/^src\//, "")}.mjs`);
  const source = join(rootDir, `${entry}.ts`);
  const specifier = JSON.stringify(relative(dirname(out), source));
  const exportsDefault = /^export default\b/m.test(readFileSync(source, "utf8"));

  writeFileSync(
    out,
    `export * from ${specifier};\n${exportsDefault ? `export { default } from ${specifier};\n` : ""}`,
  );
}

export default {
  // rollup-plugin-dts roots its TS programs at the inputs as given: an extensionless one matches no file, so each entry got a program of its own and the declaration pass ran out of heap
  entries: subpathEntries.map((entry) => `${entry}.ts`),
  externals: [/^#nuxvel\//],
  hooks: {
    // nuxt-module-build leaves *.stories.* out of dist/runtime, but nuxvelStories() serves the framework stories from there
    "mkdist:entry:options"(_ctx: unknown, _entry: unknown, options: MkdistOptions) {
      if (Array.isArray(options.pattern)) options.pattern = options.pattern.filter((pattern) => !pattern.includes(".stories."));
    },
    // the declaration pass types each story's `component` as any, and nothing imports a story's types
    "build:done"(ctx: StubContext) {
      const runtime = join(ctx.options.outDir, "runtime");
      if (!existsSync(runtime)) return;
      for (const file of readdirSync(runtime, { recursive: true, encoding: "utf8" })) {
        if (file.endsWith(".stories.d.ts")) rmSync(join(runtime, file));
      }
    },
    // unbuild stubs these through jiti, which esbuild (the CLI's bundles) cannot bundle and which evaluates axe-core's CommonJS without `window`
    "copy:done"(ctx: StubContext) {
      if (!ctx.options.stub) return;
      for (const entry of subpathEntries) reexportSource(ctx.options.rootDir, ctx.options.outDir, entry);
    },
  },
};
