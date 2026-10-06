import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { runAppTests } from "./helpers/app.ts";
import { runBinAt, runCliAt, stripAnsi } from "./helpers/run.ts";
import { scratchPlayground } from "./helpers/scratch.ts";

const oldManifest = (imports: Record<string, string>) =>
  `${JSON.stringify({ name: "my-app", type: "module", private: true, imports, scripts: { test: "nuxvel test" } }, null, 2)}\n`;

const testNamespaces = { "#nuxvel/test-namespaces": "./.nuxt/nuxvel/test-namespaces.mjs" };

const testAliases = {
  "#nuxvel/schema": "./.nuxt/nuxvel/schema.ts",
  "#nuxvel/factories": "./.nuxt/nuxvel/factories.ts",
  "#server/*": "./server/*",
  "#shared/*": "./shared/*",
};

describe("nuxvel upgrade", () => {
  it("--only names the codemods when it gets an unknown one, and a package.json that is not JSON stops the command", async () => {
    const appDir = scratchPlayground("upgrade-usage");

    const unknown = await runCliAt(appDir, "upgrade", "--only", "nope");

    expect(unknown.exitCode).toBe(2);
    expect(unknown.stdout).toBe("");
    expect(stripAnsi(unknown.stderr)).toContain("✖ No codemod named nope\n  → The codemods are test-aliases, imports, use-trpc");

    writeFileSync(join(appDir, "package.json"), "{ not json");

    const broken = await runCliAt(appDir, "upgrade");

    expect(broken.exitCode).toBe(1);
    expect(stripAnsi(broken.stderr)).toContain("✖ package.json is not a valid package.json\n  → Fix the file, then run nuxvel upgrade again");
    expect(readFileSync(join(appDir, "package.json"), "utf8")).toBe("{ not json");
  });

  describe("test-aliases", () => {
    it("--dry-run prints the diff, the upgrade maps the aliases once, and an app test imports through them", async () => {
      const appDir = scratchPlayground("upgrade-test-aliases");
      const manifestPath = join(appDir, "package.json");
      writeFileSync(manifestPath, oldManifest(testNamespaces));

      const dryRun = await runCliAt(appDir, "upgrade", "--dry-run", "--only", "test-aliases");

      expect(dryRun.exitCode, dryRun.stderr).toBe(0);
      expect(dryRun.stdout).toBe(
        [
          "--- a/package.json",
          "+++ b/package.json",
          "@@ -2,9 +2,13 @@",
          '   "name": "my-app",',
          '   "type": "module",',
          '   "private": true,',
          '   "imports": {',
          '-    "#nuxvel/test-namespaces": "./.nuxt/nuxvel/test-namespaces.mjs"',
          '+    "#nuxvel/test-namespaces": "./.nuxt/nuxvel/test-namespaces.mjs",',
          '+    "#nuxvel/schema": "./.nuxt/nuxvel/schema.ts",',
          '+    "#nuxvel/factories": "./.nuxt/nuxvel/factories.ts",',
          '+    "#server/*": "./server/*",',
          '+    "#shared/*": "./shared/*"',
          "   },",
          '   "scripts": {',
          '     "test": "nuxvel test"',
          "   }",
          "",
        ].join("\n"),
      );
      expect(stripAnsi(dryRun.stderr)).toContain("✔ The codemods would update 1 file");
      expect(stripAnsi(dryRun.stderr)).toContain("✔ No generated files were hand-edited");
      expect(readFileSync(manifestPath, "utf8")).toBe(oldManifest(testNamespaces));

      const applied = await runCliAt(appDir, "upgrade", "--only", "test-aliases");

      expect(applied.exitCode, applied.stderr).toBe(0);
      expect(applied.stdout).toBe("updated: package.json\n");
      expect(stripAnsi(applied.stderr)).toBe("✔ Updated 1 file\n");
      expect(readFileSync(manifestPath, "utf8")).toBe(oldManifest({ ...testNamespaces, ...testAliases }));

      const again = await runCliAt(appDir, "upgrade", "--only", "test-aliases");

      expect(again.exitCode).toBe(0);
      expect(again.stdout).toBe("");
      expect(stripAnsi(again.stderr)).toBe("✔ No codemod changed a file\n");

      const prepared = await runBinAt(appDir, "nuxi", ["prepare"]);
      expect(prepared.exitCode, prepared.stderr).toBe(0);

      writeFileSync(join(appDir, "server", "utils", "greeting.ts"), 'export const greeting = "hello";\n');
      mkdirSync(join(appDir, "tests", "functional"), { recursive: true });
      writeFileSync(
        join(appDir, "tests", "functional", "aliases.test.ts"),
        [
          'import { expect, expectRow } from "@nuxvel/nuxt/testing";',
          'import { it } from "vitest";',
          'import { postFactory } from "#nuxvel/factories";',
          'import { postsTable } from "#nuxvel/schema";',
          'import { greeting } from "#server/utils/greeting";',
          'import { createPostInput } from "#shared/schemas/post";',
          "",
          'it("imports through the aliases of package.json", async () => {',
          "  const post = await postFactory();",
          "",
          "  await expectRow(postsTable, { id: post.id });",
          '  expect(greeting).toBe("hello");',
          '  expect(createPostInput.parse({ title: "Hi", body: "" })).toEqual({ title: "Hi", body: "" });',
          "});",
          "",
        ].join("\n"),
      );

      const result = await runAppTests(appDir, ["tests/functional/aliases.test.ts"]);

      expect(result.exitCode, result.stdout).toBe(0);
    }, 300000);

    it("leaves an alias the app maps elsewhere and prints it as a manual step", async () => {
      const appDir = scratchPlayground("upgrade-test-aliases-conflict");
      const manifestPath = join(appDir, "package.json");
      const manifest = oldManifest({ ...testNamespaces, ...testAliases, "#server/*": "./src/server/*" });
      writeFileSync(manifestPath, manifest);

      const { stdout, stderr, exitCode } = await runCliAt(appDir, "upgrade", "--only", "test-aliases");

      expect(exitCode).toBe(0);
      expect(stdout).toBe("");
      expect(stripAnsi(stderr)).toBe(
        '▲ package.json:9: #server/* maps to "./src/server/*": map it to "./server/*" so tests can import it\n✔ No codemod changed a file\n',
      );
      expect(readFileSync(manifestPath, "utf8")).toBe(manifest);
    });
  });

  describe("imports", () => {
    it("--dry-run prints the alias of each ../ import, the upgrade writes it once, and an import it cannot fix is a manual step", async () => {
      const appDir = scratchPlayground("upgrade-imports");
      const job = join(appDir, "server", "jobs", "report", "weekly.job.ts");
      const component = join(appDir, "app", "components", "report", "WeeklyReport.vue");
      const namespaced = join(appDir, "server", "jobs", "report", "monthly.job.ts");
      const oldJob = [
        'import { userTable } from "../../database/schema/auth.schema";',
        'import { slugify } from "../../utils/slug";',
        "",
        "export const weeklyReport = [userTable, slugify];",
        "",
      ].join("\n");
      const oldComponent = [
        '<script setup lang="ts">',
        'import { reportTitle } from "../../../shared/utils/report";',
        "</script>",
        "",
        "<template>",
        "  <h1>{{ reportTitle }}</h1>",
        "</template>",
        "",
      ].join("\n");
      const oldNamespaced = 'import * as auth from "../../database/schema/auth.schema";\n\nexport const monthlyReport = auth;\n';
      mkdirSync(join(appDir, "server", "jobs", "report"), { recursive: true });
      mkdirSync(join(appDir, "app", "components", "report"), { recursive: true });
      writeFileSync(job, oldJob);
      writeFileSync(component, oldComponent);
      writeFileSync(namespaced, oldNamespaced);
      const manualStep =
        "▲ server/jobs/report/monthly.job.ts:1: ../../database/schema/auth.schema leaves server/jobs/ for server/database/schema/: import it from #nuxvel/schema";

      const dryRun = await runCliAt(appDir, "upgrade", "--dry-run", "--only", "imports");

      expect(dryRun.exitCode, dryRun.stderr).toBe(0);
      expect(dryRun.stdout).toContain(
        [
          "--- a/server/jobs/report/weekly.job.ts",
          "+++ b/server/jobs/report/weekly.job.ts",
          "@@ -1,4 +1,4 @@",
          '-import { userTable } from "../../database/schema/auth.schema";',
          '-import { slugify } from "../../utils/slug";',
          '+import { userTable } from "#nuxvel/schema";',
          '+import { slugify } from "#server/utils/slug";',
          " ",
          " export const weeklyReport = [userTable, slugify];",
        ].join("\n"),
      );
      expect(dryRun.stdout).toContain('+import { reportTitle } from "#shared/utils/report";');
      expect(dryRun.stdout).not.toContain("monthly.job.ts");
      expect(stripAnsi(dryRun.stderr)).toContain(manualStep);
      expect(readFileSync(job, "utf8")).toBe(oldJob);

      const applied = await runCliAt(appDir, "upgrade", "--only", "imports");

      expect(applied.exitCode, applied.stderr).toBe(0);
      expect(applied.stdout).toContain("updated: server/jobs/report/weekly.job.ts\n");
      expect(applied.stdout).toContain("updated: app/components/report/WeeklyReport.vue\n");
      expect(readFileSync(job, "utf8")).toBe(
        oldJob.replace("../../database/schema/auth.schema", "#nuxvel/schema").replace("../../utils/slug", "#server/utils/slug"),
      );
      expect(readFileSync(component, "utf8")).toBe(oldComponent.replace("../../../shared/utils/report", "#shared/utils/report"));
      expect(readFileSync(namespaced, "utf8")).toBe(oldNamespaced);

      const again = await runCliAt(appDir, "upgrade", "--only", "imports");

      expect(again.exitCode).toBe(0);
      expect(again.stdout).toBe("");
      expect(stripAnsi(again.stderr)).toContain(`${manualStep}\n`);
      expect(stripAnsi(again.stderr)).toContain("✔ No codemod changed a file\n");
    }, 60000);

    it("removes an import of shared/schemas/ from server code, and leaves a renamed one as a manual step", async () => {
      const appDir = scratchPlayground("upgrade-imports-schemas");
      const router = join(appDir, "server", "trpc", "routers", "report.router.ts");
      writeFileSync(
        router,
        [
          'import { createPostInput } from "../../../shared/schemas/post";',
          'import { postSchema as reportSchema } from "#shared/schemas/post";',
          "",
          "export const reportRouter = { createPostInput, reportSchema };",
          "",
        ].join("\n"),
      );

      const { stdout, stderr, exitCode } = await runCliAt(appDir, "upgrade", "--only", "imports");

      expect(exitCode, stderr).toBe(0);
      expect(stdout).toContain("updated: server/trpc/routers/report.router.ts\n");
      expect(readFileSync(router, "utf8")).toBe(
        'import { postSchema as reportSchema } from "#shared/schemas/post";\n\nexport const reportRouter = { createPostInput, reportSchema };\n',
      );
      expect(stripAnsi(stderr)).toContain(
        "▲ server/trpc/routers/report.router.ts:1: #shared/schemas/post is in shared/schemas/, whose exports server/ auto-imports: remove the import\n",
      );
    }, 60000);
  });
  describe("use-trpc", () => {
    it("replaces useTRPC() and its binding with $api in scripts, templates and types, and leaves a mocked name as a manual step", async () => {
      const appDir = scratchPlayground("upgrade-use-trpc");
      const component = join(appDir, "app", "components", "report", "ReportPosts.vue");
      const composable = join(appDir, "app", "composables", "use-report-api.ts");
      const mocked = join(appDir, "tests", "report", "report-posts.nuxt.test.ts");
      const oldComponent = [
        '<script setup lang="ts">',
        "const trpc = useTRPC();",
        "",
        "const posts = useQuery(trpc.post.list.queryOptions());",
        "const keys = { trpc, list: trpc.post.list.key() };",
        "</script>",
        "",
        "<template>",
        '  <p v-for="trpc in [1, 2]" :key="trpc">{{ trpc }}</p>',
        "  <p>{{ trpc.post.key().join() }} {{ posts.data.value?.total }} {{ keys.list }}</p>",
        "</template>",
        "",
      ].join("\n");
      const oldComposable = [
        'import { useTRPC } from "#imports";',
        "",
        "export type ReportApi = ReturnType<typeof useTRPC>;",
        "",
        "export function useReportApi(): ReportApi {",
        "  const trpc = useTRPC();",
        "",
        "  return trpc;",
        "}",
        "",
        "export const reportKey = () => useTRPC().post.key();",
        "",
      ].join("\n");
      const oldMocked = [
        'import { mockNuxtImport } from "@nuxt/test-utils/runtime";',
        "",
        'mockNuxtImport("useTRPC", () => () => ({}));',
        "",
      ].join("\n");
      mkdirSync(join(appDir, "app", "components", "report"), { recursive: true });
      mkdirSync(join(appDir, "app", "composables"), { recursive: true });
      mkdirSync(join(appDir, "tests", "report"), { recursive: true });
      writeFileSync(component, oldComponent);
      writeFileSync(composable, oldComposable);
      writeFileSync(mocked, oldMocked);
      const manualStep = '▲ tests/report/report-posts.nuxt.test.ts:3: "useTRPC" names useTRPC(), which $api replaces: mock "$api" instead\n';

      const applied = await runCliAt(appDir, "upgrade", "--only", "use-trpc");

      expect(applied.exitCode, applied.stderr).toBe(0);
      expect(applied.stdout).toContain("updated: app/components/report/ReportPosts.vue\n");
      expect(applied.stdout).toContain("updated: app/composables/use-report-api.ts\n");
      expect(stripAnsi(applied.stderr)).toContain(manualStep);
      expect(readFileSync(component, "utf8")).toBe(
        [
          '<script setup lang="ts">',
          "const posts = useQuery($api.post.list.queryOptions());",
          "const keys = { trpc: $api, list: $api.post.list.key() };",
          "</script>",
          "",
          "<template>",
          '  <p v-for="trpc in [1, 2]" :key="trpc">{{ trpc }}</p>',
          "  <p>{{ $api.post.key().join() }} {{ posts.data.value?.total }} {{ keys.list }}</p>",
          "</template>",
          "",
        ].join("\n"),
      );
      expect(readFileSync(composable, "utf8")).toBe(
        [
          'import { $api } from "#imports";',
          "",
          "export type ReportApi = typeof $api;",
          "",
          "export function useReportApi(): ReportApi {",
          "  return $api;",
          "}",
          "",
          "export const reportKey = () => $api.post.key();",
          "",
        ].join("\n"),
      );
      expect(readFileSync(mocked, "utf8")).toBe(oldMocked);

      const again = await runCliAt(appDir, "upgrade", "--only", "use-trpc");

      expect(again.exitCode).toBe(0);
      expect(again.stdout).not.toContain("report");
      expect(stripAnsi(again.stderr)).toContain(manualStep);
    }, 60000);

    it("leaves useTRPC() in a file that declares its own $api, and a renamed import, as manual steps", async () => {
      const appDir = scratchPlayground("upgrade-use-trpc-manual");
      const taken = join(appDir, "app", "utils", "report-api.ts");
      const renamed = join(appDir, "app", "utils", "report-client.ts");
      const oldTaken = "const $api = 1;\nexport const reportApi = [$api, useTRPC()];\n";
      const oldRenamed = 'import { useTRPC as useClient } from "#imports";\n\nexport const reportClient = () => useClient();\n';
      mkdirSync(join(appDir, "app", "utils"), { recursive: true });
      writeFileSync(taken, oldTaken);
      writeFileSync(renamed, oldRenamed);

      const { stderr, exitCode } = await runCliAt(appDir, "upgrade", "--only", "use-trpc");

      expect(exitCode, stderr).toBe(0);
      expect(stripAnsi(stderr)).toContain(
        "▲ app/utils/report-api.ts:2: $api is declared in this file: rename it, then run nuxvel upgrade again to replace useTRPC() with $api\n",
      );
      expect(stripAnsi(stderr)).toContain("▲ app/utils/report-client.ts:1: useTRPC is imported as useClient: use $api in place of useClient()\n");
      expect(readFileSync(taken, "utf8")).toBe(oldTaken);
      expect(readFileSync(renamed, "utf8")).toBe(oldRenamed);
    }, 60000);
  });
});
