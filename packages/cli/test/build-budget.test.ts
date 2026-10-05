import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { loadNuxtConfig } from "@nuxt/kit";
import { describe, expect, it } from "vitest";
import { runBinAt, runCliAt, stripAnsi } from "./helpers/run.ts";
import { linkNodeModules, scratchDir } from "./helpers/scratch.ts";

function writeApp(appDir: string, maxInitialKb: number) {
  writeFileSync(join(appDir, "package.json"), JSON.stringify({ name: "budget-app", type: "module" }));
  writeFileSync(
    join(appDir, "nuxt.config.ts"),
    `export default defineNuxtConfig({ nuxvel: { perf: { bundle: { maxInitialKb: ${maxInitialKb} } } } });\n`,
  );
}

describe("nuxvel build:manifest bundle budget", () => {
  it("prints each page's initial bundle and fails when one is over nuxvel.perf.bundle.maxInitialKb", async () => {
    const appDir = scratchDir("build-budget");

    mkdirSync(join(appDir, "app", "pages"), { recursive: true });
    writeFileSync(join(appDir, "app", "app.vue"), "<template><NuxtPage /></template>\n");
    writeFileSync(join(appDir, "app", "pages", "index.vue"), "<template><h1>Posts</h1></template>\n");
    mkdirSync(join(appDir, "node_modules"));
    mkdirSync(join(appDir, ".nuxt"));
    writeApp(appDir, 1);

    const built = await runBinAt(appDir, "nuxt", ["build"]);
    expect(built.exitCode, built.stdout + built.stderr).toBe(0);

    const { buildDir } = await loadNuxtConfig({ cwd: appDir });
    expect(buildDir).toBe(join(appDir, "node_modules", ".cache", "nuxt", ".nuxt"));
    expect(existsSync(join(buildDir, "dist", "server", "client.manifest.mjs"))).toBe(true);

    const over = await runCliAt(appDir, "build:manifest");
    expect(over.exitCode, over.stderr).toBe(1);
    expect(stripAnsi(over.stderr)).toMatch(/pages\/index\.vue {2}[\d.]+ KB initial JS and CSS, gzipped/);
    expect(stripAnsi(over.stderr)).toContain("pages/index.vue over the 1 KB initial bundle budget");

    writeApp(appDir, 1000);

    const within = await runCliAt(appDir, "build:manifest");
    expect(within.exitCode, within.stderr).toBe(0);
    expect(stripAnsi(within.stderr)).toContain("Wrote nuxvel-manifest.json");
  }, 300000);
});

describe("nuxt build with a prerendered route", () => {
  it("passes without the variables the boot check requires", async () => {
    const appDir = scratchDir("build-prerender");

    mkdirSync(join(appDir, "app", "pages"), { recursive: true });
    writeFileSync(join(appDir, "app", "app.vue"), "<template><NuxtPage /></template>\n");
    writeFileSync(join(appDir, "app", "pages", "index.vue"), "<template><h1>Posts</h1></template>\n");
    writeFileSync(join(appDir, "package.json"), JSON.stringify({ name: "prerender-app", type: "module" }));
    writeFileSync(
      join(appDir, "nuxt.config.ts"),
      `export default defineNuxtConfig({ modules: ["@nuxvel/nuxt"], routeRules: { "/": { prerender: true } } });\n`,
    );
    linkNodeModules(appDir);

    const { NUXT_SITE_URL, NUXT_AUDIT_CHAIN_SECRET, ...rest } = process.env;
    const env = { ...rest, NODE_ENV: "production" };

    const built = await runBinAt(appDir, "nuxt", ["build"], env);

    expect(built.exitCode, built.stdout + built.stderr).toBe(0);
    expect(existsSync(join(appDir, ".output", "public", "index.html"))).toBe(true);
  }, 300000);
});
