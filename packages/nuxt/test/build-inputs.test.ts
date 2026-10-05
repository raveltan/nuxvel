import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadNuxtConfig } from "@nuxt/kit";
import { expect } from "@nuxvel/nuxt/testing";
import { describe, it } from "vitest";
import { buildInputs, buildKey, envInputs } from "../src/build-cache/build-key";

function scratchApp() {
  const dir = mkdtempSync(join(tmpdir(), "nuxvel-build-inputs-"));
  mkdirSync(join(dir, "server"));
  writeFileSync(join(dir, "nuxt.config.ts"), "export default defineNuxtConfig({})\n");
  writeFileSync(join(dir, "server", "tracked.ts"), "export {}\n");
  writeFileSync(join(dir, "server", "untracked.ts"), "export {}\n");
  writeFileSync(join(dir, "probe13.mjs"), "\n");
  writeFileSync(join(dir, "scratch.local.ts"), "\n");
  writeFileSync(join(dir, ".nuxtrc"), "ssr=false\n");
  return dir;
}

async function fileLabels(dir: string) {
  const inputs = await buildInputs(await loadNuxtConfig({ cwd: dir }), {
    client: false,
    recipe: "test",
  });
  return Object.keys(inputs).filter((label) => label.includes("."));
}

describe("the build inputs", () => {
  it("leave out the files that git ignores in an app that is a git repository, but keep .nuxtrc", async () => {
    const dir = scratchApp();
    writeFileSync(join(dir, ".gitignore"), "probe13.mjs\n*.local.ts\n.nuxtrc\n");
    execFileSync("git", ["init", "--quiet"], { cwd: dir });
    execFileSync("git", ["add", "nuxt.config.ts", "server/tracked.ts"], { cwd: dir });

    expect((await fileLabels(dir)).sort()).toEqual([".nuxtrc", "nuxt.config", "nuxt.config.ts", "server/tracked.ts", "server/untracked.ts"]);
  });

  it("hash every file of an app that is not a git repository", async () => {
    const dir = scratchApp();

    expect((await fileLabels(dir)).sort()).toEqual([
      ".nuxtrc",
      "nuxt.config",
      "nuxt.config.ts",
      "probe13.mjs",
      "scratch.local.ts",
      "server/tracked.ts",
      "server/untracked.ts",
    ]);
  });

  it("ignore the variables of the shell and of npm run, and keep NODE_ENV and the app's own", () => {
    const shell = ["npm_config_prefix", "npm_lifecycle_event", "npm_package_name", "TERM", "COLORTERM", "TERM_PROGRAM", "TMUX", "SSH_TTY", "SSH_CONNECTION", "SHLVL"];
    const keyWith = (value: string, names: string[]) => {
      const saved = names.map((name) => process.env[name]);
      for (const name of names) process.env[name] = value;
      try {
        return buildKey(envInputs(names));
      } finally {
        names.forEach((name, index) => (saved[index] === undefined ? delete process.env[name] : (process.env[name] = saved[index])));
      }
    };

    expect(keyWith("a", shell)).toBe(keyWith("b", shell));
    expect(keyWith("a", ["NODE_ENV", "NUXT_SITE_URL", "VITE_X"])).not.toBe(keyWith("b", ["NODE_ENV", "NUXT_SITE_URL", "VITE_X"]));
  });
});
