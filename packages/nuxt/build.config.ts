import { existsSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { basename, dirname, join, relative } from "node:path";

const topicEntries = ["src/server", "src/app", "src/shared"].flatMap((dir) =>
  readdirSync(dir, { withFileTypes: true })
    .filter((file) => file.isFile() && file.name.endsWith(".ts"))
    .map((file) => `${dir}/${file.name.replace(/\.ts$/, "")}`),
);

const subpathEntries = [
  "src/cli",
  "src/database",
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
  ...topicEntries,
];

type StubContext = { options: { stub: boolean; rootDir: string; outDir: string; failOnWarn?: boolean } };
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
    // `npm run dev:types` builds into .types, and unbuild reports every import of .types/runtime as an implicit dependency
    "build:prepare"(ctx: StubContext) {
      if (basename(ctx.options.outDir) === ".types") ctx.options.failOnWarn = false;
    },
    // rollup hoists the side-effect imports of every entry into each declaration file, so @nuxvel/nuxt/database loaded the types of BullMQ, ioredis and the AWS SDK
    "rollup:dts:options"(_ctx: unknown, options: { plugins: unknown[] }) {
      options.plugins.push({ name: "nuxvel:declaration-imports", outputOptions: (output: object) => ({ ...output, hoistTransitiveImports: false }) });
    },
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
