import { cpSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { run } from "@nuxvel/test-helpers/run";

const createEntry = fileURLToPath(new URL("../bin/create-nuxvel.mjs", import.meta.url));
const cliEntry = fileURLToPath(new URL("../../cli/bin/nuxvel.mjs", import.meta.url));
const templateDir = fileURLToPath(new URL("../template", import.meta.url));
const repoEnvExample = fileURLToPath(new URL("../../../.env.example", import.meta.url));
const playgroundEnvExample = fileURLToPath(new URL("../../../playground/.env.example", import.meta.url));
const docsIndex = fileURLToPath(new URL("../../../docs/index.md", import.meta.url));
const packageDir = fileURLToPath(new URL("..", import.meta.url));
const playgroundConfig = fileURLToPath(new URL("../../../playground/nuxt.config.ts", import.meta.url));
const playgroundManifest = fileURLToPath(new URL("../../../playground/package.json", import.meta.url));
const rootManifest = fileURLToPath(new URL("../../../package.json", import.meta.url));
const repoNodeModules = fileURLToPath(new URL("../../../node_modules", import.meta.url));
const playgroundNodeModules = fileURLToPath(new URL("../../../playground/node_modules", import.meta.url));

describe("create-nuxvel", () => {
  it.for([repoEnvExample, playgroundEnvExample])("keeps %s the same as the starter's .env.example", (path) => {
    expect(readFileSync(path, "utf8")).toBe(readFileSync(join(templateDir, ".env.example"), "utf8"));
  });

  it("writes a vitest.config.ts with the projects functional and e2e", () => {
    const text = readFileSync(join(templateDir, "vitest.config.ts"), "utf8");
    expect(text).toContain('name: "functional"');
    expect(text).toContain('name: "e2e"');
  });

  it("writes a docker-compose.yml that publishes each dev service on 127.0.0.1 only", async () => {
    const scratchDir = mkdtempSync(join(tmpdir(), "nuxvel-create-"));
    const appDir = join(scratchDir, "app");
    const publishedPorts = (compose: string) =>
      [...compose.matchAll(/^ +ports:\n((?: +- .*\n)+)/gm)].flatMap((match) =>
        (match[1] ?? "").trim().split("\n").map((line) => line.trim()),
      );

    try {
      const created = await run("node", [createEntry, appDir, "--local"], scratchDir);
      expect(created.exitCode, created.output).toBe(0);

      const compose = readFileSync(join(appDir, "docker-compose.yml"), "utf8");
      expect(publishedPorts(compose)).toEqual([
        '- "127.0.0.1:5432:5432"',
        '- "127.0.0.1:6379:6379"',
        '- "127.0.0.1:1025:1025"',
        '- "127.0.0.1:8025:8025"',
        '- "127.0.0.1:8333:8333"',
      ]);
    } finally {
      rmSync(scratchDir, { recursive: true, force: true });
    }
  });

  it("writes a CI workflow that typechecks before it tests and builds", async () => {
    const scratchDir = mkdtempSync(join(tmpdir(), "nuxvel-create-"));
    const appDir = join(scratchDir, "app");

    try {
      const created = await run("node", [createEntry, appDir, "--local"], scratchDir);
      expect(created.exitCode, created.output).toBe(0);

      const steps = readFileSync(join(appDir, ".github/workflows/ci.yml"), "utf8")
        .split("\n")
        .filter((line) => line.trim().startsWith("- run:"))
        .map((line) => line.trim().slice("- run: ".length));
      expect(steps).toEqual([
        "npm ci",
        "cp .env.example .env",
        "npm run typecheck",
        "npx nuxvel test:functional",
        "npx nuxt build",
      ]);
    } finally {
      rmSync(scratchDir, { recursive: true, force: true });
    }
  });

  it("writes a .gitignore that keeps generator tracking, template overrides, pinned host keys and the rehearsal record", async () => {
    const scratchDir = mkdtempSync(join(tmpdir(), "nuxvel-create-"));
    const appDir = join(scratchDir, "app");

    try {
      const created = await run("node", [createEntry, appDir, "--local"], scratchDir);
      expect(created.exitCode, created.output).toBe(0);

      await run("git", ["init", "--quiet"], appDir);
      const paths = [
        ".nuxvel/generated.json",
        ".nuxvel/templates/action.ts.txt",
        ".nuxvel/known_hosts",
        ".nuxvel/rehearsals.json",
        ".nuxvel/tinker/entry.ts",
        ".nuxt/nuxt.d.ts",
        ".env",
        ".env.deploy",
        ".env.deploy.example",
        ".vitest/blob/blob-1-3.json",
        "storybook-static/index.html",
      ];
      const checked = await run("git", ["check-ignore", ...paths], appDir);

      expect(checked.output.trim().split("\n")).toEqual([
        ".nuxvel/tinker/entry.ts",
        ".nuxt/nuxt.d.ts",
        ".env",
        ".env.deploy",
        ".vitest/blob/blob-1-3.json",
        "storybook-static/index.html",
      ]);
    } finally {
      rmSync(scratchDir, { recursive: true, force: true });
    }
  });

  it("writes a .dockerignore that keeps local state and CLI builds out of the Docker context", async () => {
    const scratchDir = mkdtempSync(join(tmpdir(), "nuxvel-create-"));
    const appDir = join(scratchDir, "app");

    try {
      const created = await run("node", [createEntry, appDir, "--local"], scratchDir);
      expect(created.exitCode, created.output).toBe(0);

      const ignored = readFileSync(join(appDir, ".dockerignore"), "utf8").trim().split("\n");

      expect(ignored).toEqual(expect.arrayContaining(["node_modules", ".env", ".env.deploy", ".nuxt", ".output", ".nuxvel", ".data"]));
    } finally {
      rmSync(scratchDir, { recursive: true, force: true });
    }
  });

  it("prints next steps that migrate the database before starting the dev server, then the app's URL", async () => {
    const scratchDir = mkdtempSync(join(tmpdir(), "nuxvel-create-"));

    try {
      const created = await run("node", [createEntry, "my_app", "--local"], scratchDir, { ...process.env, NO_COLOR: "1" });
      expect(created.exitCode, created.output).toBe(0);
      expect(created.output).not.toContain("\x1b");

      const note = created.output.split(/Next steps ─+╮\n/)[1]?.split("├")[0] ?? "";
      const steps = note
        .split("\n")
        .map((line) => line.replace(/^│/, "").replace(/│$/, "").trim())
        .filter((line) => line !== "");
      expect(steps).toEqual([
        "cd my_app",
        "npm install",
        "./nv services up",
        "./nv test:functional",
        "./nv db:migrate",
        "./nv db:seed",
        "npm run dev",
        "then open https://my-app.localhost",
        "README.md shows what to build next",
      ]);
    } finally {
      rmSync(scratchDir, { recursive: true, force: true });
    }
  });

  it("writes a .env, grouped under headings, that explains every variable on the line above it", async () => {
    const scratchDir = mkdtempSync(join(tmpdir(), "nuxvel-create-"));
    const appDir = join(scratchDir, "app");

    try {
      const created = await run("node", [createEntry, appDir, "--local"], scratchDir);
      expect(created.exitCode, created.output).toBe(0);

      const lines = readFileSync(join(appDir, ".env"), "utf8").trim().split("\n");
      const variables = lines.filter((line) => line !== "" && !line.startsWith("#"));

      expect(variables.map((line) => line.split("=")[0])).toEqual([
        "NUXT_DATABASE_URL",
        "NUXT_DATABASE_OWNER_URL",
        "NUXT_AUTH_SECRET",
        "NUXT_REDIS_URL",
        "NUXT_MAIL_URL",
        "NUXT_STORAGE_URL",
        "NUXT_STORAGE_BUCKET",
        "NUXT_PUBLIC_PUSH_VAPID_PUBLIC_KEY",
        "NUXT_PUSH_VAPID_PRIVATE_KEY",
        "NUXT_PUSH_VAPID_SUBJECT",
        "NUXT_PUBLIC_SENTRY_DSN",
      ]);
      for (const variable of variables) {
        expect(lines[lines.indexOf(variable) - 1], variable).toMatch(/^# \S/);
      }
      expect(lines).toContain("# NUXT_AUDIT_CHAIN_SECRET=");
      expect(lines).toContain("# NUXT_OG_IMAGE_SECRET=");
      expect(lines).toContainEqual(expect.stringMatching(/^NUXT_AUTH_SECRET=[\w-]{43}$/));

      const documented = readFileSync(docsIndex, "utf8");
      for (const [, name = ""] of lines.join("\n").matchAll(/^(?:# )?([A-Z][A-Z0-9_]+)=/gm)) {
        const pattern = name.replace(/^NUXT_AUTH_GITHUB_/, "NUXT_AUTH_<PROVIDER>_");
        expect(documented, `${name} is not in docs/index.md`).toContain(`| \`${pattern}\``);
      }
    } finally {
      rmSync(scratchDir, { recursive: true, force: true });
    }
  });

  it("writes a README whose commands are the app's scripts and nuxvel commands with the flags they take", async () => {
    const scratchDir = mkdtempSync(join(tmpdir(), "nuxvel-create-"));
    const appDir = join(scratchDir, "app");

    try {
      const created = await run("node", [createEntry, appDir, "--local"], scratchDir);
      expect(created.exitCode, created.output).toBe(0);

      const readme = readFileSync(join(appDir, "README.md"), "utf8");
      expect(readme).not.toContain("/post/<id>");
      expect(readme).toContain("/post?edit=<id>");
      const { scripts } = JSON.parse(readFileSync(join(appDir, "package.json"), "utf8"));
      const commands = [...readme.matchAll(/(npm run|\.\/nv) ([\w:-]+)((?: [\w/-]+)*)/g)];
      const listed = (await run("node", [cliEntry, "--help"], appDir, { ...process.env, NO_COLOR: "1" })).output;
      expect(commands.length).toBeGreaterThan(5);

      const helps = commands.map(([, tool, name = ""]) =>
        tool === "./nv" ? run("node", [cliEntry, name, "--help"], appDir, { ...process.env, NO_COLOR: "1" }) : undefined,
      );

      for (const [index, [line, tool, name = "", flags = ""]] of commands.entries()) {
        if (tool === "npm run") {
          expect(Object.keys(scripts), line).toContain(name);
          continue;
        }

        const description = listed.match(new RegExp(`^ +${name} +(.*)$`, "m"))?.[1];
        expect(description, line).toBeDefined();

        const help = await helps[index];
        for (const flag of flags.match(/--[\w-]+/g) ?? []) {
          expect(`${description}\n${help?.output}`, line).toContain(flag);
        }
      }
    } finally {
      rmSync(scratchDir, { recursive: true, force: true });
    }
  }, 30000);

  it("writes a nuxvel agent skill whose commands are CLI commands and whose API names are documented", async () => {
    const scratchDir = mkdtempSync(join(tmpdir(), "nuxvel-create-"));
    const appDir = join(scratchDir, "app");

    try {
      const created = await run("node", [createEntry, appDir, "--local"], scratchDir);
      expect(created.exitCode, created.output).toBe(0);

      const skillDir = join(appDir, ".claude/skills/nuxvel");
      const router = readFileSync(join(skillDir, "SKILL.md"), "utf8");
      expect(router).toMatch(/^---\nname: nuxvel\ndescription: .+\n---\n/);
      const resources = [...router.matchAll(/\]\((resources\/[\w-]+\.md)\)/g)].map(([, path]) => path);
      expect(resources.sort()).toEqual(readdirSync(join(skillDir, "resources")).map((file) => `resources/${file}`).sort());
      const skill = [router, ...resources.map((path) => readFileSync(join(skillDir, path ?? ""), "utf8"))].join("\n");

      const listed = (await run("node", [cliEntry, "--help"], appDir, { ...process.env, NO_COLOR: "1" })).output;
      const commands = new Set([...skill.matchAll(/(?:\.\/nv |`)((?:make|db|test|services)(?::[\w-]+)?|(?:route|event|channel):list|tinker)\b(?!:)/g)].map(([, name]) => name));
      expect(commands.size).toBeGreaterThan(20);
      for (const name of commands) expect(listed, name).toMatch(new RegExp(`^ +${name} +`, "m"));

      const docs = readdirSync(join(docsIndex, "..")).filter((file) => file.endsWith(".md")).map((file) => readFileSync(join(docsIndex, "..", file), "utf8")).join("\n");
      const names = new Set([...skill.matchAll(/`<?(\$?[a-z][A-Za-z]+|[A-Z][A-Za-z]+)>?`/g)].map(([, name]) => name));
      expect(names.size).toBeGreaterThan(150);
      for (const name of names) expect(docs, name).toContain(name);
    } finally {
      rmSync(scratchDir, { recursive: true, force: true });
    }
  }, 30000);

  it("writes an executable nv at the root that runs the app's nuxvel CLI", async () => {
    const scratchDir = mkdtempSync(join(tmpdir(), "nuxvel-create-"));
    const appDir = join(scratchDir, "app");

    try {
      const created = await run("node", [createEntry, appDir, "--local"], scratchDir);
      expect(created.exitCode, created.output).toBe(0);
      symlinkSync(repoNodeModules, join(appDir, "node_modules"));

      const listed = await run(join(appDir, "nv"), ["--help"], appDir, { ...process.env, NO_COLOR: "1" });

      expect(listed.exitCode, listed.output).toBe(0);
      expect(listed.output).toContain("USAGE nuxvel <command> [OPTIONS]");
      expect(listed.output).toMatch(/^ +db:migrate +/m);
      expect(JSON.parse(readFileSync(join(appDir, "package.json"), "utf8")).scripts).not.toHaveProperty("db:migrate");
    } finally {
      rmSync(scratchDir, { recursive: true, force: true });
    }
  });

  it("typechecks a starter that is linked to the workspace like one that is installed, with en and zh and with only en", async () => {
    const scratchDir = mkdtempSync(join(tmpdir(), "nuxvel-create-"));
    const appDir = join(scratchDir, "app");

    try {
      const created = await run("node", [createEntry, appDir, "--local"], scratchDir);
      expect(created.exitCode, created.output).toBe(0);

      mkdirSync(join(appDir, "node_modules"));
      for (const entry of readdirSync(repoNodeModules)) {
        symlinkSync(join(repoNodeModules, entry), join(appDir, "node_modules", entry));
      }
      symlinkSync(join(playgroundNodeModules, "nuxt-og-image"), join(appDir, "node_modules", "nuxt-og-image"));

      const twoLocales = await run(join(repoNodeModules, ".bin", "nuxt"), ["typecheck"], appDir);
      expect(twoLocales.exitCode, twoLocales.output).toBe(0);
      expect(JSON.parse(readFileSync(join(appDir, ".nuxt", "tsconfig.app.json"), "utf8")).exclude).toContain("../app/**/*.stories.ts");
      expect(JSON.parse(readFileSync(join(appDir, ".nuxt", "tsconfig.storybook.json"), "utf8")).include).toContain("../app/**/*.stories.ts");

      const brokenStory = join(appDir, "app", "components", "Broken.stories.ts");
      writeFileSync(brokenStory, 'import { mockUser } from "@nuxvel/nuxt/storybook/mocks";\n\nexport const user = mockUser({ email: 1 });\n');
      const storyError = await run(join(repoNodeModules, ".bin", "nuxt"), ["typecheck"], appDir);
      expect(storyError.exitCode).not.toBe(0);
      expect(storyError.output).toContain("Broken.stories.ts");
      rmSync(brokenStory);

      const config = join(appDir, "nuxt.config.ts");
      writeFileSync(config, readFileSync(config, "utf8").replace("      { code: 'zh', iso: 'zh-CN', displayName: '中文' },\n", ""));
      rmSync(join(appDir, "locales", "zh.json"));
      const englishOnly = await run(join(repoNodeModules, ".bin", "nuxt"), ["typecheck"], appDir);
      expect(englishOnly.exitCode, englishOnly.output).toBe(0);
      expect(readFileSync(join(appDir, ".nuxt", "types", "typed-router.d.ts"), "utf8")).not.toContain("zh");

      const topicsCheck = join(appDir, "app", "topic-imports-check.ts");
      writeFileSync(topicsCheck, `import { $api } from "@nuxvel/nuxt/app/api";
import { defineAction } from "@nuxvel/nuxt/server/actions";
import { listQuery } from "@nuxvel/nuxt/shared/pagination";

const usesApi: typeof $api | undefined = undefined;
const usesDefineAction: typeof defineAction | undefined = undefined;
const usesListQuery: typeof listQuery | undefined = undefined;
export { usesApi, usesDefineAction, usesListQuery };
`);
      const topicsTypecheck = await run(join(repoNodeModules, ".bin", "nuxt"), ["typecheck"], appDir);
      expect(topicsTypecheck.exitCode, topicsTypecheck.output).toBe(0);
    } finally {
      rmSync(scratchDir, { recursive: true, force: true });
    }
  }, 300000);

  it("prints usage for --help, and usage with the problem for a bad command line, without a stack trace", async () => {
    const scratchDir = mkdtempSync(join(tmpdir(), "nuxvel-create-"));

    try {
      const help = await run("node", [createEntry, "--help"], scratchDir);
      expect(help.exitCode).toBe(0);
      expect(help.output).toMatch(/^Usage: npm create nuxvel <directory>/);

      for (const [args, problem] of [
        [["app", "--nope"], "Unknown option '--nope'"],
        [["one", "two"], "Expected one directory, got 2: one two"],
        [[], "Missing the directory to create the app in."],
      ] as const) {
        const { output, exitCode } = await run("node", [createEntry, ...args], scratchDir);

        expect(exitCode, output).toBe(1);
        expect(output).toContain(problem);
        expect(output).toContain("Usage: npm create nuxvel <directory>");
        expect(output).not.toMatch(/^\s+at /m);
      }

      expect(readdirSync(scratchDir)).toEqual([]);
    } finally {
      rmSync(scratchDir, { recursive: true, force: true });
    }
  });

  it("writes an empty (app) route group, where make:resource --ui puts its pages", async () => {
    const scratchDir = mkdtempSync(join(tmpdir(), "nuxvel-create-"));
    const appDir = join(scratchDir, "app");

    try {
      const created = await run("node", [createEntry, appDir, "--local"], scratchDir);
      expect(created.exitCode, created.output).toBe(0);

      expect(readdirSync(join(appDir, "app", "pages", "(app)"))).toEqual([".gitkeep"]);
    } finally {
      rmSync(scratchDir, { recursive: true, force: true });
    }
  });

  it("refuses to scaffold into a directory that is not empty", async () => {
    const scratchDir = mkdtempSync(join(tmpdir(), "nuxvel-create-"));
    const appDir = join(scratchDir, "taken");
    mkdirSync(appDir);
    writeFileSync(join(appDir, "keep.txt"), "mine");

    try {
      const { output, exitCode } = await run("node", [createEntry, appDir], scratchDir);

      expect(exitCode).toBe(1);
      expect(output).toContain("is not empty");
      expect(readFileSync(join(appDir, "keep.txt"), "utf8")).toBe("mine");
    } finally {
      rmSync(scratchDir, { recursive: true, force: true });
    }
  });

  it("allows the install scripts of esbuild, msgpackr-extract, msw and vue-demi, in the starter and in the repo", () => {
    const allowScripts = { esbuild: true, "msgpackr-extract": true, msw: true, "vue-demi": true };
    expect(JSON.parse(readFileSync(join(templateDir, "package.json"), "utf8")).allowScripts).toEqual(allowScripts);
    expect(JSON.parse(readFileSync(rootManifest, "utf8")).allowScripts).toEqual(allowScripts);
  });

  it("keeps every shade of the starter palette in the CSS, where Nuxt UI reads the primary color at run time", () => {
    expect(readFileSync(join(templateDir, "app/assets/css/main.css"), "utf8")).toMatch(/^@theme static \{$/m);
  });

  it.for([join(templateDir, "nuxt.config.ts"), playgroundConfig])("turns off DevTools telemetry in %s", (path) => {
    expect(readFileSync(path, "utf8")).toContain("devtools: { enabled: true, telemetry: false },");
  });

  it("names the package after the directory as a valid npm name, keeps the imports field and scaffolds the tests tsconfig", async () => {
    const scratchDir = mkdtempSync(join(tmpdir(), "nuxvel-create-"));
    const appDir = join(scratchDir, "My App");

    try {
      const created = await run("node", [createEntry, "My App", "--local"], scratchDir);
      expect(created.exitCode, created.output).toBe(0);

      const manifest = JSON.parse(readFileSync(join(appDir, "package.json"), "utf8"));
      expect(manifest.name).toBe("my-app");
      expect(manifest.imports).toEqual({
        "#nuxvel/test-namespaces": "./.nuxt/nuxvel/test-namespaces.mjs",
        "#nuxvel/schema": "./.nuxt/nuxvel/schema.ts",
        "#nuxvel/factories": "./.nuxt/nuxvel/factories.ts",
        "#server/*": "./server/*",
        "#shared/*": "./shared/*",
      });
      expect(readFileSync(join(appDir, "tests", "tsconfig.json"), "utf8")).toContain('"extends": "../.nuxt/tsconfig.server.json"');
      expect(readFileSync(join(appDir, "tests", "tsconfig.json"), "utf8")).toContain('"../.nuxt/types/typed-router.d.ts"');
      expect(readFileSync(join(appDir, "tsconfig.json"), "utf8")).toContain('"path": "./tests"');
    } finally {
      rmSync(scratchDir, { recursive: true, force: true });
    }
  });

  it("ships Storybook with the nuxvel stories, the MSW loader and its worker, in the package that npm publishes", async () => {
    const scratchDir = mkdtempSync(join(tmpdir(), "nuxvel-create-"));
    const appDir = join(scratchDir, "app");

    try {
      const created = await run("node", [createEntry, appDir, "--local"], scratchDir);
      expect(created.exitCode, created.output).toBe(0);

      const storybook = join(appDir, ".storybook");
      expect(readFileSync(join(storybook, "main.ts"), "utf8")).toContain("nuxvelStories()");
      expect(readFileSync(join(storybook, "main.ts"), "utf8")).toContain("staticDirs: ['./public']");
      expect(readFileSync(join(storybook, "main.ts"), "utf8")).toContain("addons: ['@storybook/addon-vitest', '@storybook/addon-a11y']");
      expect(readFileSync(join(appDir, "vitest.config.ts"), "utf8")).toContain('name: "ui"');
      expect(readFileSync(join(storybook, "preview.ts"), "utf8")).toContain("mswLoader(startWorker)");
      expect(readFileSync(join(storybook, "preview-head.html"), "utf8")).toContain("window.__NUXT_COLOR_MODE__");
      expect(readFileSync(join(storybook, "public", "mockServiceWorker.js"), "utf8")).toContain("PACKAGE_VERSION");

      const manifest = JSON.parse(readFileSync(join(appDir, "package.json"), "utf8"));
      const playground = JSON.parse(readFileSync(playgroundManifest, "utf8"));
      expect(manifest.scripts).toMatchObject({
        storybook: "storybook dev --port 6006",
        "storybook:build": "storybook build",
        test: "npm run test:functional && npm run test:ui",
        "test:functional": "nuxvel test:functional",
        "pretest:ui": "playwright-core install chromium-headless-shell",
        "test:ui": "nuxvel test:ui",
        "test:arch": "nuxvel test:arch",
      });
      const root = JSON.parse(readFileSync(rootManifest, "utf8"));
      for (const name of ["@storybook/addon-vitest", "@vitest/browser-playwright"]) {
        expect(manifest.devDependencies[name], name).toBe(root.devDependencies[name]);
      }
      for (const name of ["storybook", "@storybook-vue/nuxt", "msw", "msw-storybook-addon"]) {
        expect(manifest.devDependencies[name], name).toBe(playground.devDependencies[name]);
      }
      // Without a direct esbuild, a lockfile-less install hoists drizzle-kit's esbuild@0.25 and fails vite's esbuild peer (ERESOLVE).
      expect(manifest.devDependencies.esbuild).toBe("^0.28.0");
      expect(manifest.msw).toEqual({ workerDirectory: [".storybook/public"] });

      const packed = await run("npm", ["pack", "--dry-run", "--json"], packageDir);
      expect(packed.exitCode, packed.output).toBe(0);
      const packedFiles = (JSON.parse(packed.output.slice(packed.output.indexOf("["))) as [{ files: { path: string }[] }])[0].files.map((file) => file.path);
      for (const file of ["main.ts", "preview.ts", "preview-head.html", "public/mockServiceWorker.js"]) {
        expect(packedFiles).toContain(`template/.storybook/${file}`);
      }
      for (const file of ["app/components/UserMenu.stories.ts", "app/error.stories.ts"]) {
        expect(packedFiles).toContain(`template/${file}`);
        expect(readFileSync(join(appDir, file), "utf8")).toContain('from "@nuxvel/nuxt/storybook/test"');
      }
    } finally {
      rmSync(scratchDir, { recursive: true, force: true });
    }
  });

  it("refuses \".\" in a directory whose name has no letters or digits, writing nothing", async () => {
    const scratchDir = mkdtempSync(join(tmpdir(), "nuxvel-create-"));
    const appDir = join(scratchDir, "!!!");
    mkdirSync(appDir);

    try {
      const { output, exitCode } = await run("node", [createEntry, ".", "--local"], appDir);

      expect(exitCode).toBe(1);
      expect(output).toContain('"!!!" has no letters or digits to name the app\'s package after');
      expect(readdirSync(appDir)).toEqual([]);
    } finally {
      rmSync(scratchDir, { recursive: true, force: true });
    }
  });

  it("links to each page of the starter by a route name that its pages define", () => {
    const files = (dir: string): string[] =>
      readdirSync(dir, { withFileTypes: true }).flatMap((entry) =>
        entry.isDirectory() ? files(join(dir, entry.name)) : [join(dir, entry.name)],
      );
    const pagesDir = join(templateDir, "app", "pages");
    const routeNames = files(pagesDir).map((file) =>
      relative(pagesDir, file).replace(/\([^)]*\)\//g, "").replace(/\.vue$/, "").replace(/(^|\/)index$/, "$1").replace(/\/$/, "").replace(/[[\]]/g, "").replaceAll("/", "-") || "index",
    );
    const sources = files(join(templateDir, "app")).filter((file) => file.endsWith(".vue")).map((file) => readFileSync(file, "utf8"));
    const linked = sources.flatMap((source) =>
      [...source.matchAll(/(?::to="\$localeRoute\(\{ name: '([^']+)'|navigateTo\(localeRoute\(\{ name: "([^"]+)")/g)].map((match) => match[1] ?? match[2]),
    );

    expect(new Set(linked)).toEqual(new Set(["index", "sign-in", "sign-up", "forgot-password"]));
    expect(routeNames).toEqual(expect.arrayContaining(linked));
    for (const source of sources) {
      expect(source).not.toMatch(/(?<!:)to="\/|navigateTo\(["`]\/|router\.(push|replace)\(["`]\//);
      expect(source).not.toMatch(/:to="\{ name:|navigateTo\(\{ name:/);
    }
  });

  it("translates the starter in en and zh, and keeps only English when zh leaves i18n.locales and locales/zh.json is deleted", () => {
    const files = (dir: string): string[] =>
      readdirSync(dir, { withFileTypes: true }).flatMap((entry) =>
        entry.isDirectory() ? files(join(dir, entry.name)) : [join(dir, entry.name)],
      );
    type Messages = { [key: string]: string | Messages };
    const keys = (messages: Messages, prefix = ""): string[] =>
      Object.entries(messages).flatMap(([key, value]) => (typeof value === "string" ? [`${prefix}${key}`] : keys(value, `${prefix}${key}.`)));
    const english = keys(JSON.parse(readFileSync(join(templateDir, "locales", "en.json"), "utf8")));
    const chinese = keys(JSON.parse(readFileSync(join(templateDir, "locales", "zh.json"), "utf8")));
    const sources = files(join(templateDir, "app")).filter((file) => file.endsWith(".vue")).map((file) => readFileSync(file, "utf8"));
    const used = sources.flatMap((source) => [...source.matchAll(/(?:\$ts?\(|\bts\(|keypath=)["'`]([\w.]+)["'`]/g)].map(([, key]) => key));
    const config = readFileSync(join(templateDir, "nuxt.config.ts"), "utf8");

    expect(chinese.sort()).toEqual(english.sort());
    expect(used.length).toBeGreaterThan(40);
    expect(english).toEqual(expect.arrayContaining(used));
    expect(config).toContain("{ code: 'zh', iso: 'zh-CN', displayName: '中文' },");
    for (const source of sources) expect(source).not.toMatch(/\bzh\b/);
  });

  it("ships migrations that match the template's schema", async () => {
    const scratchDir = mkdtempSync(join(tmpdir(), "nuxvel-create-schema-"));

    try {
      cpSync(join(templateDir, "server", "database"), join(scratchDir, "server", "database"), {
        recursive: true,
      });
      cpSync(join(templateDir, "drizzle.config.ts"), join(scratchDir, "drizzle.config.ts"));
      symlinkSync(repoNodeModules, join(scratchDir, "node_modules"));

      const migrationsDir = join(scratchDir, "server", "database", "migrations");
      const before = readdirSync(migrationsDir);
      const { output, exitCode } = await run(
        join(repoNodeModules, ".bin", "drizzle-kit"),
        ["generate"],
        scratchDir,
      );

      expect(exitCode, output).toBe(0);
      expect(readdirSync(migrationsDir), output).toEqual(before);
    } finally {
      rmSync(scratchDir, { recursive: true, force: true });
    }
  }, 60000);
});
