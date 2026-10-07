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
    expect(stripAnsi(unknown.stderr)).toContain("✖ No codemod named nope\n  → The codemods are test-aliases, imports, use-trpc, explicit-imports, invalidate, mutation-options, audit");

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
        "const { data: posts } = useQuery(trpc.post.list.queryOptions());",
        "const keys = { trpc, list: trpc.post.list.key() };",
        "</script>",
        "",
        "<template>",
        '  <p v-for="trpc in [1, 2]" :key="trpc">{{ trpc }}</p>',
        "  <p>{{ trpc.post.key().join() }} {{ posts?.total }} {{ keys.list }}</p>",
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
          "const { data: posts } = useQuery($api.post.list.queryOptions());",
          "const keys = { trpc: $api, list: $api.post.list.key() };",
          "</script>",
          "",
          "<template>",
          '  <p v-for="trpc in [1, 2]" :key="trpc">{{ trpc }}</p>',
          "  <p>{{ $api.post.key().join() }} {{ posts?.total }} {{ keys.list }}</p>",
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

    it("turns useQuery() and useMutation() of the procedure options into .useQuery() and .useMutation() when every use reads .value, and leaves any other shape", async () => {
      const appDir = scratchPlayground("upgrade-use-trpc-composables");
      const page = join(appDir, "app", "pages", "report-posts.vue");
      const kept = join(appDir, "app", "components", "report", "ReportDraft.vue");
      const oldPage = [
        '<script setup lang="ts">',
        "const trpc = useTRPC();",
        "const route = useRoute();",
        "",
        "const post = useQuery(() => trpc.post.byId.queryOptions({ id: Number(route.params.id) }));",
        "const posts = useQuery(trpc.post.list.queryOptions());",
        "const remove = useMutation(trpc.post.delete.mutationOptions());",
        "",
        "watch(() => post.error.value, () => posts.refetch());",
        "</script>",
        "",
        "<template>",
        '  <h1 v-if="post.data.value">{{ post.data.value.title }}</h1>',
        '  <QueryState :query="posts" />',
        '  <UButton :loading="remove.isLoading.value" @click="remove.mutate({ id: 1 })" />',
        "</template>",
        "",
      ].join("\n");
      const oldKept = [
        '<script setup lang="ts">',
        "const { data: draft } = useQuery($api.post.byId.queryOptions({ id: 1 }));",
        "const posts = useQuery(() => ({ ...$api.post.list.queryOptions(), enabled: false }));",
        "const latest = useQuery($api.post.list.queryOptions());",
        "const create = useMutation({ ...$api.post.create.mutationOptions(), onSuccess: () => latest.refetch() });",
        "",
        "watch(latest.data, () => {});",
        "</script>",
        "",
        "<template>",
        "  <p>{{ draft?.title }} {{ posts.data.value?.total }} {{ create.status.value }}</p>",
        "</template>",
        "",
      ].join("\n");
      mkdirSync(join(appDir, "app", "components", "report"), { recursive: true });
      writeFileSync(page, oldPage);
      writeFileSync(kept, oldKept);

      const { stdout, stderr, exitCode } = await runCliAt(appDir, "upgrade", "--only", "use-trpc");

      expect(exitCode, stderr).toBe(0);
      expect(stdout).toContain("updated: app/pages/report-posts.vue\n");
      expect(stdout).not.toContain("ReportDraft.vue");
      expect(readFileSync(page, "utf8")).toBe(
        [
          '<script setup lang="ts">',
          "const route = useRoute();",
          "",
          "const post = $api.post.byId.useQuery(() => ({ id: Number(route.params.id) }));",
          "const posts = $api.post.list.useQuery();",
          "const remove = $api.post.delete.useMutation();",
          "",
          "watch(() => post.error, () => posts.refetch());",
          "</script>",
          "",
          "<template>",
          '  <h1 v-if="post.data">{{ post.data.title }}</h1>',
          '  <QueryState :query="posts" />',
          '  <UButton :loading="remove.isLoading" @click="remove.mutate({ id: 1 })" />',
          "</template>",
          "",
        ].join("\n"),
      );
      expect(readFileSync(kept, "utf8")).toBe(oldKept);
    }, 60000);
  });

  describe("invalidate", () => {
    it("removes the invalidation of the mutation's own namespace from its callbacks, with the queryCache it leaves unused, and leaves any other", async () => {
      const appDir = scratchPlayground("upgrade-invalidate");
      const page = join(appDir, "app", "pages", "report-posts.vue");
      const composable = join(appDir, "app", "composables", "use-report-post.ts");
      const oldPage = [
        '<script setup lang="ts">',
        "const trpc = useTRPC();",
        "const queryCache = useQueryCache();",
        "",
        "const create = useMutation({",
        "  ...trpc.post.create.mutationOptions(),",
        "  onSuccess: () => queryCache.invalidateQueries({ key: trpc.post.key() }),",
        "});",
        'const form = useActionForm(updatePostInput, toasted($api.post.update.mutationOptions(), "Post saved"), {',
        '  defaults: { id: 1, title: "", body: "" },',
        "  onSuccess: async () => {",
        "    await queryCache.invalidateQueries({ key: $api.post.byId.key({ id: 1 }) });",
        '    await navigateTo({ name: "posts" });',
        "  },",
        "});",
        "const remove = $api.post.delete.useMutation({ onSettled: () => useQueryCache().invalidateQueries({ key: $api.post.list.key() }) });",
        "const restore = $api.post.restore.useMutation({ onSuccess: () => queryCache.invalidateQueries({ key: $api.post.key(), exact: true }) });",
        "const publish = $api.post.publish.useMutation({",
        "  onSuccess: async () => {",
        "    await queryCache.invalidateQueries({ key: $api.feed.key() });",
        "  },",
        "});",
        "</script>",
        "",
        "<template>",
        "  <p>{{ create.status.value }} {{ form.pending }} {{ remove.status }} {{ restore.status }} {{ publish.status }}</p>",
        "</template>",
        "",
      ].join("\n");
      const oldComposable = [
        'import { useMutation, useQueryCache } from "@pinia/colada";',
        "",
        "export function useReportPost() {",
        "  const queryCache = useQueryCache();",
        "",
        "  return useMutation({ ...$api.post.create.mutationOptions(), onSuccess: () => queryCache.invalidateQueries({ key: $api.post.key() }) });",
        "}",
        "",
      ].join("\n");
      mkdirSync(join(appDir, "app", "composables"), { recursive: true });
      writeFileSync(page, oldPage);
      writeFileSync(composable, oldComposable);

      const applied = await runCliAt(appDir, "upgrade", "--only", "invalidate");

      expect(applied.exitCode, applied.stderr).toBe(0);
      expect(applied.stdout).toContain("updated: app/pages/report-posts.vue\n");
      expect(applied.stdout).toContain("updated: app/composables/use-report-post.ts\n");
      expect(readFileSync(page, "utf8")).toBe(
        [
          '<script setup lang="ts">',
          "const trpc = useTRPC();",
          "const queryCache = useQueryCache();",
          "",
          "const create = useMutation({",
          "  ...trpc.post.create.mutationOptions(),",
          "});",
          'const form = useActionForm(updatePostInput, toasted($api.post.update.mutationOptions(), "Post saved"), {',
          '  defaults: { id: 1, title: "", body: "" },',
          "  onSuccess: async () => {",
          '    await navigateTo({ name: "posts" });',
          "  },",
          "});",
          "const remove = $api.post.delete.useMutation();",
          "const restore = $api.post.restore.useMutation({ onSuccess: () => queryCache.invalidateQueries({ key: $api.post.key(), exact: true }) });",
          "const publish = $api.post.publish.useMutation({",
          "  onSuccess: async () => {",
          "    await queryCache.invalidateQueries({ key: $api.feed.key() });",
          "  },",
          "});",
          "</script>",
          "",
          "<template>",
          "  <p>{{ create.status.value }} {{ form.pending }} {{ remove.status }} {{ restore.status }} {{ publish.status }}</p>",
          "</template>",
          "",
        ].join("\n"),
      );
      expect(readFileSync(composable, "utf8")).toBe(
        [
          'import { useMutation } from "@pinia/colada";',
          "",
          "export function useReportPost() {",
          "  return useMutation({ ...$api.post.create.mutationOptions() });",
          "}",
          "",
        ].join("\n"),
      );

      const again = await runCliAt(appDir, "upgrade", "--only", "invalidate");

      expect(again.exitCode, again.stderr).toBe(0);
      expect(again.stdout).not.toContain("report");
    }, 60000);
  });

  describe("mutation-options", () => {
    it("moves toasted() and optimistic() into the options of .mutationOptions() and .useMutation(), and leaves any other shape as a manual step", async () => {
      const appDir = scratchPlayground("upgrade-mutation-options");
      const page = join(appDir, "app", "pages", "report-posts.vue");
      writeFileSync(
        page,
        [
          '<script setup lang="ts">',
          "const input = computed(() => ({ page: 1 }));",
          "const remove = useMutation(",
          '  optimistic(toasted($api.post.delete.mutationOptions(), "Post deleted"), {',
          "    key: () => $api.post.list.key(input.value),",
          "    apply: (list, { id }) => ({ ...list, rows: list.rows.filter((row) => row.id !== id) }),",
          "  }),",
          ");",
          "const { mutate: rename } = useMutation(",
          "  optimistic({ ...$api.post.update.mutationOptions({ invalidate: false }), onError: () => {} }, {",
          "    key: (post) => $api.post.byId.key({ id: post.id }),",
          "    apply: (post, { title }) => ({ ...post, title }),",
          "  }),",
          ");",
          "const form = useActionForm(updatePostInput, toasted($api.post.update.mutationOptions(), (post) => `Saved ${post.title}`), {",
          '  defaults: { id: 1, title: "", body: "" },',
          "});",
          'const kept = useMutation(toasted(options, "Saved"));',
          "</script>",
          "",
          "<template>",
          '  <UButton :loading="remove.isLoading.value" @click="remove.mutate({ id: 1 })" />',
          '  <UButton @click="rename({ id: 1, title: form.state.title })" />',
          "</template>",
          "",
        ].join("\n"),
      );

      const applied = await runCliAt(appDir, "upgrade", "--only", "mutation-options");

      expect(applied.exitCode, applied.stderr).toBe(0);
      expect(applied.stdout).toContain("updated: app/pages/report-posts.vue\n");
      expect(stripAnsi(applied.stderr)).toContain(
        "▲ app/pages/report-posts.vue:23: toasted() is removed: pass its second argument as the toast option of $api.<path>.mutationOptions() or .useMutation()",
      );
      expect(readFileSync(page, "utf8")).toBe(
        [
          '<script setup lang="ts">',
          "const input = computed(() => ({ page: 1 }));",
          "const remove = $api.post.delete.useMutation({",
          '  toast: "Post deleted",',
          "  optimistic: {",
          "    key: () => $api.post.list.key(input.value),",
          "    apply: (list, { id }) => ({ ...list, rows: list.rows.filter((row) => row.id !== id) }),",
          "  },",
          "});",
          "const { mutate: rename } = useMutation(",
          "  $api.post.update.mutationOptions({",
          "    invalidate: false,",
          "    onError: () => {},",
          "    optimistic: {",
          "      key: (post) => $api.post.byId.key({ id: post.id }),",
          "      apply: (post, { title }) => ({ ...post, title }),",
          "    },",
          "  }),",
          ");",
          "const form = useActionForm(updatePostInput, $api.post.update.mutationOptions({ toast: (post) => `Saved ${post.title}` }), {",
          '  defaults: { id: 1, title: "", body: "" },',
          "});",
          'const kept = useMutation(toasted(options, "Saved"));',
          "</script>",
          "",
          "<template>",
          '  <UButton :loading="remove.isLoading" @click="remove.mutate({ id: 1 })" />',
          '  <UButton @click="rename({ id: 1, title: form.state.title })" />',
          "</template>",
          "",
        ].join("\n"),
      );

      const again = await runCliAt(appDir, "upgrade", "--only", "mutation-options");

      expect(again.stdout).not.toContain("report-posts");
    }, 60000);
  });
  describe("audit", () => {
    it("moves audited() to the audit option of the action the mutation calls, or to audit() in a handler without one, and leaves any other shape as a manual step", async () => {
      const appDir = scratchPlayground("upgrade-audit");
      const router = join(appDir, "server", "trpc", "routers", "report.router.ts");
      const action = join(appDir, "server", "actions", "reports", "archive-report.action.ts");
      writeFileSync(
        router,
        [
          'import { z } from "zod";',
          'import { archiveReportAction } from "#server/actions/reports/archive-report.action";',
          'import { closeReportAction } from "#server/actions/reports/close-report.action";',
          'import { healthChecksTable, postsTable, userTable } from "#nuxvel/schema";',
          "",
          "const auditName = \"user.promoted\";",
          "",
          "export const reportRouter = {",
          "  archive: authedProcedure",
          "    .input(postIdInput)",
          '    .use(audited("report.archived", { target: healthChecksTable }))',
          "    .output(z.void())",
          "    .mutation(({ input, ctx }) => archiveReportAction(input, { actor: ctx.actor })),",
          "  rename: authedProcedure",
          "    .input(z.object({ id: z.number(), title: z.string() }))",
          '    .use(audited("report.renamed", { target: postsTable }))',
          "    .output(z.void())",
          "    .mutation(async ({ input }) => {",
          "      await useDb().select().from(postsTable).where(eq(postsTable.id, input.id));",
          "    }),",
          "  promote: authedProcedure",
          "    .input(z.object({ id: z.string() }))",
          "    .use(audited(auditName, { target: userTable }))",
          "    .output(z.void())",
          "    .mutation(() => undefined),",
          "  close: authedProcedure",
          "    .input(postIdInput)",
          '    .use(audited("report.closed", { target: postsTable }))',
          "    .output(z.void())",
          "    .mutation(({ input }) => closeReportAction(input)),",
          "};",
          "",
        ].join("\n"),
      );
      mkdirSync(join(appDir, "server", "actions", "reports"), { recursive: true });
      const closeAction = ["export const closeReportAction = defineAction({", "  input: postIdInput,", "  handler: async () => {},", "});", ""].join("\n");
      writeFileSync(join(appDir, "server", "actions", "reports", "close-report.action.ts"), closeAction);
      mkdirSync(join(appDir, "server", "jobs", "reports"), { recursive: true });
      writeFileSync(
        join(appDir, "server", "jobs", "reports", "close-stale.job.ts"),
        "export const reportsCloseStaleJob = defineJob({ handler: () => $actions.reports.closeReport({ id: 1 }) });\n",
      );
      writeFileSync(action, ["export const archiveReportAction = defineAction({", "  input: postIdInput,", "  handler: async () => {},", "});", ""].join("\n"));

      const applied = await runCliAt(appDir, "upgrade", "--only", "audit");

      expect(applied.exitCode, applied.stderr).toBe(0);
      expect(applied.stdout).toContain("updated: server/trpc/routers/report.router.ts\n");
      expect(applied.stdout).toContain("updated: server/actions/reports/archive-report.action.ts\n");
      expect(readFileSync(action, "utf8")).toBe(
        [
          "export const archiveReportAction = defineAction({",
          "  input: postIdInput,",
          '  audit: { name: "report.archived", target: healthChecksTable },',
          "  handler: async () => {},",
          "});",
          "",
        ].join("\n").replace(/^/, 'import { healthChecksTable } from "#nuxvel/schema";\n\n'),
      );
      expect(readFileSync(router, "utf8")).toBe(
        [
          'import { z } from "zod";',
          'import { archiveReportAction } from "#server/actions/reports/archive-report.action";',
          'import { closeReportAction } from "#server/actions/reports/close-report.action";',
          'import { postsTable, userTable } from "#nuxvel/schema";',
          'import { getTableName } from "drizzle-orm";',
          "",
          "const auditName = \"user.promoted\";",
          "",
          "export const reportRouter = {",
          "  archive: authedProcedure",
          "    .input(postIdInput)",
          "    .output(z.void())",
          "    .mutation(({ input, ctx }) => archiveReportAction(input, { actor: ctx.actor })),",
          "  rename: authedProcedure",
          "    .input(z.object({ id: z.number(), title: z.string() }))",
          "    .output(z.void())",
          "    .mutation(async (opts) => {",
          "      const result = await (async ({ input }) => {",
          "      await useDb().select().from(postsTable).where(eq(postsTable.id, input.id));",
          "    })(opts);",
          '      await audit("report.renamed", { type: getTableName(postsTable), id: opts.input.id });',
          "      return result;",
          "    }),",
          "  promote: authedProcedure",
          "    .input(z.object({ id: z.string() }))",
          "    .use(audited(auditName, { target: userTable }))",
          "    .output(z.void())",
          "    .mutation(() => undefined),",
          "  close: authedProcedure",
          "    .input(postIdInput)",
          '    .use(audited("report.closed", { target: postsTable }))',
          "    .output(z.void())",
          "    .mutation(({ input }) => closeReportAction(input)),",
          "};",
          "",
        ].join("\n"),
      );
      expect(stripAnsi(applied.stderr)).toContain(
        "▲ server/trpc/routers/report.router.ts:16: audited(\"report.renamed\", { target: postsTable }) became audit() in the handler, which records no changed columns: give it { changes } if the log needs them\n",
      );
      expect(stripAnsi(applied.stderr)).toContain(
        "▲ server/trpc/routers/report.router.ts:23: the name is not a string, or the target is not a table name: move audited(auditName, { target: userTable }) to the audit option of the action, or to audit() in the handler\n",
      );

      expect(stripAnsi(applied.stderr)).toContain(
        "▲ server/trpc/routers/report.router.ts:28: server/actions/reports/close-report.action.ts is also called from server/jobs/reports/close-stale.job.ts, so its audit option would audit that call too: move audited(\"report.closed\", { target: postsTable }) to the audit option of the action, or to audit() in the handler\n",
      );
      expect(readFileSync(join(appDir, "server", "actions", "reports", "close-report.action.ts"), "utf8")).toBe(closeAction);

      const again = await runCliAt(appDir, "upgrade", "--only", "audit");

      expect(again.exitCode, again.stderr).toBe(0);
      expect(again.stdout).not.toContain("report");
    }, 60000);
  });
  describe("action-form", () => {
    it("passes the $api procedure to useActionForm() with one options object, keeps a schema that is not the procedure's, and leaves any other shape as a manual step", async () => {
      const appDir = scratchPlayground("upgrade-action-form");
      const page = join(appDir, "app", "pages", "report-forms.vue");
      writeFileSync(
        page,
        [
          '<script setup lang="ts">',
          "const strictPostInput = createPostInput.extend({ title: z.string().min(5) });",
          "const trpc = useNuxtApp().$trpc;",
          'const create = useActionForm(createPostInput, $api.post.create.mutationOptions(), { defaults: { title: "", body: "" } });',
          "const update = useActionForm(updatePostInput, $api.post.update.mutationOptions({ toast: (post) => `Saved ${post.title}` }), {",
          '  defaults: { id: 1, title: "", body: "" },',
          "  onSuccess: () => navigateTo(\"/\"),",
          "});",
          "const strict = useActionForm(strictPostInput, trpc.post.create.mutationOptions());",
          "const tag = useActionForm(createTagInput, trpc.tag.create.mutationOptions(), {",
          '  defaults: { name: "" },',
          "});",
          "const raw = useActionForm(createTagInput, { mutation: async (input) => input }, { defaults: { name: \"\" } });",
          "const twice = useActionForm(createPostInput, $api.post.create.mutationOptions({ onSuccess: () => {} }), { defaults: {} });",
          'const current = useActionForm($api.post.create, { toast: "Created" });',
          "</script>",
          "",
        ].join("\n"),
      );

      const applied = await runCliAt(appDir, "upgrade", "--only", "action-form");

      expect(applied.exitCode, applied.stderr).toBe(0);
      expect(applied.stdout).toContain("updated: app/pages/report-forms.vue\n");
      const manual = "useActionForm(schema, mutationOptions, options) is removed: write useActionForm($api.<path>, { ...options }) with the options of mutationOptions() among them, and schema only when it is not the procedure's input schema from shared/schemas/";
      expect(stripAnsi(applied.stderr)).toContain(`▲ app/pages/report-forms.vue:8: ${manual}`);
      expect(stripAnsi(applied.stderr)).toContain(`▲ app/pages/report-forms.vue:9: ${manual}`);
      expect(readFileSync(page, "utf8")).toBe(
        [
          '<script setup lang="ts">',
          "const strictPostInput = createPostInput.extend({ title: z.string().min(5) });",
          "const trpc = useNuxtApp().$trpc;",
          'const create = useActionForm($api.post.create, { defaults: { title: "", body: "" } });',
          "const update = useActionForm($api.post.update, { toast: (post) => `Saved ${post.title}`, defaults: { id: 1, title: \"\", body: \"\" }, onSuccess: () => navigateTo(\"/\") });",
          "const strict = useActionForm($api.post.create, { schema: strictPostInput });",
          'const tag = useActionForm($api.tag.create, { defaults: { name: "" } });',
          "const raw = useActionForm(createTagInput, { mutation: async (input) => input }, { defaults: { name: \"\" } });",
          "const twice = useActionForm(createPostInput, $api.post.create.mutationOptions({ onSuccess: () => {} }), { defaults: {} });",
          'const current = useActionForm($api.post.create, { toast: "Created" });',
          "</script>",
          "",
        ].join("\n"),
      );

      const again = await runCliAt(appDir, "upgrade", "--only", "action-form");

      expect(again.stdout).not.toContain("report-forms");
    }, 60000);
  });

  describe("actor-arg", () => {
    const manual = (name: string) =>
      `${name}() no longer takes an actor: it reads the actor of the running procedure, action, job or seeder. Remove the first argument when it is that actor, or move the check into an action called with { actor }`;

    it("removes ctx.actor and a destructured actor parameter from can(), authorize() and canMany(), and prints any other actor as a manual step", async () => {
      const appDir = scratchPlayground("upgrade-actor-arg");
      const file = join(appDir, "server", "actions", "posts", "check-post.action.ts");
      const before = [
        'import { postsTable } from "#nuxvel/schema";',
        "",
        "export const checkPostAction = defineAction({",
        "  input: postIdInput,",
        "  handler: async (input, ctx) => {",
        "    const post = await findOrFail(postsTable, input.id);",
        '    await authorize(ctx.actor, "update", postsTable, post);',
        "    await authorize(ctx.actor, $policies.post.update, post);",
        '    const answers = await canMany(ctx.actor, ["update", "delete"], postsTable, [post]);',
        '    const system = await can(systemActor("cleanup"), "delete", postsTable, post);',
        "    return { answers, system };",
        "  },",
        "});",
        "",
        "export const destructured = defineAction({",
        "  input: postIdInput,",
        "  handler: async (input, { actor }) => {",
        "    const post = await findOrFail(postsTable, input.id);",
        "    const allowed = await can(",
        "      actor,",
        '      "delete",',
        "      postsTable,",
        "      post,",
        "    );",
        "    const byRef = await canMany(actor, [$policies.post.update], [post]);",
        "    return { allowed, byRef };",
        "  },",
        "});",
        "",
        "export async function localActor(post: typeof postsTable.$inferSelect) {",
        '  const actor = systemActor("cleanup");',
        '  return can(actor, "delete", postsTable, post);',
        "}",
        "",
        "export async function fromJob(job: { actor: Actor }, post: typeof postsTable.$inferSelect) {",
        "  return can(job.actor, $policies.post.delete, post);",
        "}",
        "",
        "export async function fromEvent(event: H3Event, post: typeof postsTable.$inferSelect) {",
        '  return authorize(event.context.actor, "delete", postsTable, post);',
        "}",
        "",
      ];
      const after = before
        .map((line) => line.replace("(ctx.actor, ", "(").replace("canMany(actor, ", "canMany("))
        .filter((line) => line !== "      actor,");
      writeFileSync(file, before.join("\n"));

      const applied = await runCliAt(appDir, "upgrade", "--only", "actor-arg");
      const reported = (text: string, name: string) => `▲ server/actions/posts/check-post.action.ts:${after.findIndex((line) => line.includes(text)) + 1}: ${manual(name)}`;

      expect(applied.exitCode, applied.stderr).toBe(0);
      expect(applied.stdout).toContain("updated: server/actions/posts/check-post.action.ts\n");
      expect(stripAnsi(applied.stderr)).toContain(reported('can(systemActor("cleanup")', "can"));
      expect(stripAnsi(applied.stderr)).toContain(reported('can(actor, "delete"', "can"));
      expect(stripAnsi(applied.stderr)).toContain(reported("can(job.actor", "can"));
      expect(stripAnsi(applied.stderr)).toContain(reported("authorize(event.context.actor", "authorize"));
      expect(stripAnsi(applied.stderr).match(/▲ /g)).toHaveLength(4);
      expect(readFileSync(file, "utf8")).toBe(after.join("\n"));
    }, 60000);

    it("leaves already-migrated calls and the test fixture alone, and reports nothing for them, also on a second run", async () => {
      const appDir = scratchPlayground("upgrade-actor-arg-migrated");
      const file = join(appDir, "server", "actions", "posts", "migrated-post.action.ts");
      const source = [
        'import { postsTable } from "#nuxvel/schema";',
        "",
        "export const migratedPostAction = defineAction({",
        "  input: postIdInput,",
        "  handler: async (input) => {",
        "    const post = await findOrFail(postsTable, input.id);",
        '    const actions = ["update", "delete"] as const;',
        '    const rule = "delete" as const;',
        "    return {",
        '      current: await can("delete", postsTable, post),',
        "      byRule: await can(rule, postsTable, post),",
        "      byRef: await canMany([$policies.post.update], [post]),",
        "      byVariable: await canMany(actions, postsTable, [post]),",
        "    };",
        "  },",
        "});",
        "",
      ].join("\n");
      writeFileSync(file, source);
      const testFile = join(appDir, "server", "actions", "posts", "migrated-post.action.test.ts");
      const fixtureCall = 'expect(await can(author, "update", postsTable, post)).toBe(true);';
      writeFileSync(testFile, ['import { can, expect } from "@nuxvel/nuxt/testing";', fixtureCall, ""].join("\n"));

      for (let run = 0; run < 2; run += 1) {
        const applied = await runCliAt(appDir, "upgrade", "--only", "actor-arg");

        expect(applied.exitCode, applied.stderr).toBe(0);
        expect(applied.stdout).not.toContain("migrated-post");
        expect(stripAnsi(applied.stderr)).not.toContain("migrated-post");
      }
      expect(readFileSync(file, "utf8")).toBe(source);
      expect(readFileSync(testFile, "utf8")).toContain(fixtureCall);
    }, 60000);
  });

  describe("removed-globals", () => {
    it("replaces the actor type constants with their strings and auth() with useAuth() where only .user is read, and leaves any other auth() as a manual step", async () => {
      const appDir = scratchPlayground("upgrade-removed-globals");
      const file = join(appDir, "server", "api", "whoami.get.ts");
      writeFileSync(
        file,
        [
          "type SystemType = typeof SYSTEM_ACTOR_TYPE;",
          "",
          "export default defineEventHandler(async () => {",
          "  const { actor } = await useAuth();",
          "  const name = (await auth())?.user?.name;",
          "  const session = await auth();",
          "  const signedIn = await auth();",
          "  const role = (await auth())?.user.role;",
          "  if (!signedIn) return null;",
          "  return {",
          "    name,",
          "    role,",
          "    email: session?.user?.email,",
          "    system: actor?.type === SYSTEM_ACTOR_TYPE,",
          "    key: actor?.type === API_KEY_ACTOR_TYPE,",
          "    expires: signedIn.session.expiresAt,",
          "  };",
          "});",
          "",
        ].join("\n"),
      );

      const applied = await runCliAt(appDir, "upgrade", "--only", "removed-globals");

      expect(applied.exitCode, applied.stderr).toBe(0);
      expect(applied.stdout).toContain("updated: server/api/whoami.get.ts\n");
      const manual = "auth() is no longer auto-imported: read the user with (await useAuth()).user, or require a session with requireAuth()";
      expect(stripAnsi(applied.stderr)).toContain(`▲ server/api/whoami.get.ts:7: ${manual}`);
      expect(stripAnsi(applied.stderr)).toContain(`▲ server/api/whoami.get.ts:8: ${manual}`);
      expect(readFileSync(file, "utf8")).toBe(
        [
          'type SystemType = "system";',
          "",
          "export default defineEventHandler(async () => {",
          "  const { actor } = await useAuth();",
          "  const name = (await useAuth())?.user?.name;",
          "  const session = await useAuth();",
          "  const signedIn = await auth();",
          "  const role = (await auth())?.user.role;",
          "  if (!signedIn) return null;",
          "  return {",
          "    name,",
          "    role,",
          "    email: session?.user?.email,",
          '    system: actor?.type === "system",',
          '    key: actor?.type === "api-key",',
          "    expires: signedIn.session.expiresAt,",
          "  };",
          "});",
          "",
        ].join("\n"),
      );

      const again = await runCliAt(appDir, "upgrade", "--only", "removed-globals");

      expect(again.stdout).not.toContain("whoami");
    }, 60000);
  });

  describe("definition-methods", () => {
    it("rewrites each removed call to the method of its definition, also through a const name, leaves a name it cannot map as a manual step, and skips a function the file declares", async () => {
      const appDir = scratchPlayground("upgrade-definition-methods");
      const file = join(appDir, "server", "api", "effects.get.ts");
      const local = join(appDir, "server", "utils", "local-emit.ts");
      const localSource = 'function emit(name: string, payload: unknown) {\n  return { name, payload };\n}\n\nexport const sent = emit("post.published", {});\n';
      const removed = (name: string, method: string, namespace: string, example: string) =>
        `${name}() is removed: call ${method}() on the definition in ${namespace}, such as ${example}, with the other arguments in the same order`;

      writeFileSync(
        join(appDir, "server", "jobs", "_probe", "old-record.ts"),
        'import record from "./record";\n\nexport default renamed(record);\n',
      );
      writeFileSync(
        file,
        [
          'import { postPublishedEvent } from "#server/events/post/published.event";',
          'import { probeHappened } from "#server/events/_probe/happened";',
          'import { FLAGS_CHANNEL } from "#shared/flags";',
          "",
          'const jobName = "_probe.record";',
          'let mailName = "welcome";',
          "",
          "export default defineEventHandler(async (event) => {",
          "  const userId = String(getQuery(event).userId);",
          "",
          "  await transaction(async () => {",
          '    await dispatchAfterCommit("post.notify-followers", { postId: 1 });',
          '    await dispatchAfterCommit($jobs._probe.record, { name: "a" }, { delay: 1000 });',
          '    await dispatchAfterCommit(jobName, { name: "b" });',
          '    await dispatchAfterCommit("_probe.old-record", { name: "c" });',
          '    await dispatchAfterCommit($jobs._probe.record.name, { name: "d" });',
          '    await broadcastAfterCommit("posts", "created", { id: 1 });',
          '    await broadcast("_probe-board", "moved", {',
          "      card: 1,",
          "    }, { boardId: 1 });",
          '    await broadcast(FLAGS_CHANNEL, "changed", { name: "x" });',
          '    await sendMail("welcome", { to: "ada@example.com", name: "Ada" }, { locale: "zh" });',
          '    await sendMail(mailName, { to: "ada@example.com", name: "Ada" });',
          "    await emit(postPublishedEvent, { postId: 1 });",
          '    await emit(probeHappened, { name: "x", count: 1 });',
          "    await emit(postPublishedEvent.name, { postId: 1 });",
          '    await emit(`_probe.${"happened"}`, {});',
          '    await notify(userId, "welcome", { name: "Ada" });',
          "  });",
          "});",
          "",
        ].join("\n"),
      );
      writeFileSync(local, localSource);

      const applied = await runCliAt(appDir, "upgrade", "--only", "definition-methods");
      const stderr = stripAnsi(applied.stderr);
      const dispatch = removed("dispatchAfterCommit", "dispatch", "$jobs", "$jobs.post.notifyFollowers.dispatch(input)");
      const emit = removed("emit", "emit", "$events", "$events.post.published.emit(payload)");

      expect(applied.exitCode, applied.stderr).toBe(0);
      expect(applied.stdout).toContain("updated: server/api/effects.get.ts\n");
      expect(applied.stdout).not.toContain("local-emit");
      expect(stderr).toContain(
          '▲ server/api/effects.get.ts:15: dispatchAfterCommit() is removed, and "_probe.old-record" is a renamed() alias with no $jobs key: call dispatch() on the job it renames',
      );
      expect(stderr).toContain(`▲ server/api/effects.get.ts:16: ${dispatch}`);
      expect(stderr).toContain(`▲ server/api/effects.get.ts:21: ${removed("broadcast", "broadcast", "$channels", '$channels.posts.broadcast("created", payload)')}`);
      expect(stderr).toContain(`▲ server/api/effects.get.ts:23: ${removed("sendMail", "send", "$mails", "$mails.welcome.send(input)")}`);
      expect(stderr).toContain(`▲ server/api/effects.get.ts:25: ${emit}`);
      expect(stderr).toContain(`▲ server/api/effects.get.ts:26: ${emit}`);
      expect(stderr).toContain(`▲ server/api/effects.get.ts:27: ${emit}`);
      expect(readFileSync(file, "utf8")).toBe(
        [
          'import { postPublishedEvent } from "#server/events/post/published.event";',
          'import { probeHappened } from "#server/events/_probe/happened";',
          'import { FLAGS_CHANNEL } from "#shared/flags";',
          "",
          'const jobName = "_probe.record";',
          'let mailName = "welcome";',
          "",
          "export default defineEventHandler(async (event) => {",
          "  const userId = String(getQuery(event).userId);",
          "",
          "  await transaction(async () => {",
          "    await $jobs.post.notifyFollowers.dispatch({ postId: 1 });",
          '    await $jobs._probe.record.dispatch({ name: "a" }, { delay: 1000 });',
          '    await $jobs._probe.record.dispatch({ name: "b" });',
          '    await dispatchAfterCommit("_probe.old-record", { name: "c" });',
          '    await dispatchAfterCommit($jobs._probe.record.name, { name: "d" });',
          '    await $channels.posts.broadcast("created", { id: 1 });',
          '    await $channels._probeBoard.broadcast("moved", {',
          "      card: 1,",
          "    }, { boardId: 1 });",
          '    await broadcast(FLAGS_CHANNEL, "changed", { name: "x" });',
          '    await $mails.welcome.send({ to: "ada@example.com", name: "Ada" }, { locale: "zh" });',
          '    await sendMail(mailName, { to: "ada@example.com", name: "Ada" });',
          "    await postPublishedEvent.emit({ postId: 1 });",
          '    await emit(probeHappened, { name: "x", count: 1 });',
          "    await emit(postPublishedEvent.name, { postId: 1 });",
          '    await emit(`_probe.${"happened"}`, {});',
          '    await $notifications.welcome.notify(userId, { name: "Ada" });',
          "  });",
          "});",
          "",
        ].join("\n"),
      );
      expect(readFileSync(local, "utf8")).toBe(localSource);

      const again = await runCliAt(appDir, "upgrade", "--only", "definition-methods");

      expect(again.stdout).not.toContain("effects.get.ts");
    }, 60000);
  });

  describe("durations", () => {
    it("rewrites a number of seconds or milliseconds to a duration object, leaves the dispatch() of anything but $jobs, and prints a value it cannot compute as a manual step", async () => {
      const appDir = scratchPlayground("upgrade-durations");
      const file = join(appDir, "server", "jobs", "report", "digest.job.ts");
      const manual = (option: string, unit: string) =>
        `${option} takes a duration such as { minutes: 5 } in place of a number of ${unit}: rewrite the value by hand, or leave the option out when it is zero`;
      mkdirSync(join(appDir, "server", "jobs", "report"), { recursive: true });
      const before = [
        "const TTL = 300;",
        "",
        "export const reportDigestJob = defineJob({",
        "  timeout: 30_000,",
        "  backoff: 1500,",
        "  handler: async () => {",
        '    await cachePut(["report", "count"], 1, 60 * 60);',
        '    await remember("report:list", 7 * 24 * 60 * 60, () => []);',
        '    await remember("report:other", TTL, () => []);',
        '    await withLock("report", 90, () => undefined);',
        '    const link = signedUrl("/reports/1", { expiresIn: 7 * 24 * 60 * 60 });',
        "    await $jobs._probe.record.dispatch({ name: link }, { delay: 60_000, priority: 1 });",
        '    await $jobs._probe.record.dispatch({ name: "now" }, { delay: 0 });',
        '    await remember("report:done", { minutes: 5 }, () => []);',
        "    store.dispatch(link, { delay: 5 });",
        "  },",
        "});",
        "",
        "export const retried = defineJob({ backoff: { type: \"exponential\", delay: 1000 }, handler: () => undefined });",
        "",
      ];
      const after = [
        "const TTL = 300;",
        "",
        "export const reportDigestJob = defineJob({",
        "  timeout: { seconds: 30 },",
        "  backoff: { seconds: 1.5 },",
        "  handler: async () => {",
        '    await cachePut(["report", "count"], 1, { hours: 1 });',
        '    await remember("report:list", { days: 7 }, () => []);',
        '    await remember("report:other", TTL, () => []);',
        '    await withLock("report", { seconds: 90 }, () => undefined);',
        '    const link = signedUrl("/reports/1", { expiresIn: { days: 7 } });',
        "    await $jobs._probe.record.dispatch({ name: link }, { delay: { minutes: 1 }, priority: 1 });",
        '    await $jobs._probe.record.dispatch({ name: "now" }, { delay: 0 });',
        '    await remember("report:done", { minutes: 5 }, () => []);',
        "    store.dispatch(link, { delay: 5 });",
        "  },",
        "});",
        "",
        "export const retried = defineJob({ backoff: { type: \"exponential\", delay: 1000 }, handler: () => undefined });",
        "",
      ];
      writeFileSync(file, before.join("\n"));

      const applied = await runCliAt(appDir, "upgrade", "--only", "durations");
      const stderr = stripAnsi(applied.stderr);

      expect(applied.exitCode, applied.stderr).toBe(0);
      expect(applied.stdout).toContain("updated: server/jobs/report/digest.job.ts\n");
      expect(stderr).toContain(`▲ server/jobs/report/digest.job.ts:9: ${manual("the ttl of remember()", "seconds")}`);
      expect(stderr).toContain(`▲ server/jobs/report/digest.job.ts:13: ${manual("delay of dispatch()", "milliseconds")}`);
      expect(stderr.match(/▲ /g)).toHaveLength(2);
      expect(readFileSync(file, "utf8")).toBe(after.join("\n"));

      const again = await runCliAt(appDir, "upgrade", "--only", "durations");

      expect(again.stdout).not.toContain("digest.job.ts");
    }, 60000);
  });

  describe("presence-params", () => {
    it("wraps an object literal room of usePresence() in params, in a .vue file, leaves a migrated call, and prints a variable, a call and a spread as manual steps", async () => {
      const appDir = scratchPlayground("upgrade-presence-params");
      const file = join(appDir, "app", "components", "PostEditors.vue");
      const before = [
        '<script setup lang="ts">',
        "const props = defineProps<{ id: number; room: { id: number }; extra: [] }>();",
        "const { members } = usePresence(\"posts\", { id: props.id });",
        "const fromStub = usePresence($channels.posts, props.room);",
        "const fromCall = usePresence(\"posts\", roomOf(props.id));",
        "const migrated = usePresence(\"posts\", { params: { id: props.id } });",
        "const lobby = usePresence(\"posts\");",
        "const spread = usePresence(\"posts\", ...props.extra);",
        "</script>",
        "",
        "<template>",
        "  <PresenceAvatars :members=\"members\" />",
        "</template>",
        "",
      ];
      writeFileSync(file, before.join("\n"));

      const applied = await runCliAt(appDir, "upgrade", "--only", "presence-params");
      const stderr = stripAnsi(applied.stderr);

      expect(applied.exitCode, applied.stderr).toBe(0);
      expect(applied.stdout).toContain("updated: app/components/PostEditors.vue\n");
      const manual = "usePresence() takes the room as its params option: write usePresence(name, { params: room }) when this argument is the room";

      expect(stderr).toContain(`▲ app/components/PostEditors.vue:4: ${manual}`);
      expect(stderr).toContain(`▲ app/components/PostEditors.vue:5: ${manual}`);
      expect(stderr).toContain(`▲ app/components/PostEditors.vue:8: ${manual}`);
      expect(stderr.match(/▲ /g)).toHaveLength(3);
      expect(readFileSync(file, "utf8")).toBe(
        before
          .map((line) =>
            line
              .replace("usePresence(\"posts\", { id: props.id })", "usePresence(\"posts\", { params: { id: props.id } })"),
          )
          .join("\n"),
      );

      const again = await runCliAt(appDir, "upgrade", "--only", "presence-params");

      expect(again.stdout).not.toContain("PostEditors.vue");
    }, 60000);
  });

  describe("notification-input", () => {
    it("renames schema to input, and data to input and a mail name to its $mails definition in toMail, leaves a migrated notification, and prints what it cannot rewrite as a manual step", async () => {
      const appDir = scratchPlayground("upgrade-notification-input");
      const file = join(appDir, "server", "notifications", "post", "published.notification.ts");
      mkdirSync(join(appDir, "server", "notifications", "post"), { recursive: true });
      const before = [
        'import { z } from "zod";',
        "",
        "const schema = z.object({ title: z.string() });",
        "",
        "export const postPublishedNotification = defineNotification({",
        "  schema: z.object({ postId: z.number(), title: z.string() }),",
        '  via: ["database", "mail"],',
        '  toDatabase: ({ title }) => ({ title: "Your post is live", body: title }),',
        '  toMail: ({ postId, title }) => ({ mail: "post.published", data: { title, url: `/posts/${postId}` } }),',
        "});",
        "",
        "export const blockBody = defineNotification({",
        "  schema,",
        '  via: ["mail"],',
        "  toMail(input) {",
        "    const data = { title: input.title };",
        '    if (!input.title) return { mail: "order.shipped-late", data };',
        '    return { mail: "welcome", data };',
        "  },",
        "});",
        "",
        "export const fromVariable = defineNotification({",
        "  schema,",
        '  via: ["mail"],',
        "  toMail: buildMail,",
        "});",
        "",
        "export const fromConfig = defineNotification(config);",
        "",
        "export const migrated = defineNotification({",
        "  input: schema,",
        '  via: ["mail"],',
        "  toMail: ({ title }) => ({ mail: $mails.welcome, input: { title } }),",
        "});",
        "",
      ];
      writeFileSync(file, before.join("\n"));

      const applied = await runCliAt(appDir, "upgrade", "--only", "notification-input");
      const stderr = stripAnsi(applied.stderr);
      const path = "server/notifications/post/published.notification.ts";

      expect(applied.exitCode, applied.stderr).toBe(0);
      expect(applied.stdout).toContain(`updated: ${path}\n`);
      expect(stderr).toContain(
        `▲ ${path}:25: toMail returns { mail, input }: return the mail's $mails definition as mail, such as $mails.post.published, and its input as input in place of data`,
      );
      expect(stderr).toContain(`▲ ${path}:28: defineNotification() takes input in place of schema: rename the schema key of this notification to input`);
      expect(stderr.match(/▲ /g)).toHaveLength(2);
      expect(readFileSync(file, "utf8")).toBe(
        before
          .map((line) =>
            line
              .replace("  schema: z.object", "  input: z.object")
              .replace("  schema,", "  input: schema,")
              .replace('({ mail: "post.published", data: {', "({ mail: $mails.post.published, input: {")
              .replace('{ mail: "order.shipped-late", data }', "{ mail: $mails.order.shippedLate, input: data }")
              .replace('{ mail: "welcome", data }', "{ mail: $mails.welcome, input: data }"),
          )
          .join("\n"),
      );

      const again = await runCliAt(appDir, "upgrade", "--only", "notification-input");

      expect(again.stdout).not.toContain("published.notification.ts");
    }, 60000);

    it("prints a manual step for a mail that is a variable, a shorthand or a template literal, and for each config with a spread", async () => {
      const appDir = scratchPlayground("upgrade-notification-input-manual");
      const file = join(appDir, "server", "notifications", "order", "shipped.notification.ts");
      mkdirSync(join(appDir, "server", "notifications", "order"), { recursive: true });
      const before = [
        'import { z } from "zod";',
        "",
        'const mailName = "order.shipped";',
        "",
        "export const orderShippedNotification = defineNotification({",
        "  schema: z.object({ id: z.number() }),",
        '  via: ["mail"],',
        "  toMail({ id }) {",
        "    const mail = mailName;",
        "    if (id === 1) return { mail: mailName, data: { id } };",
        "    if (id === 2) return { mail, data: { id } };",
        "    return { mail: `order.${id}`, data: { id } };",
        "  },",
        "});",
        "",
        "export const spread = defineNotification({ ...base, schema: z.object({}) });",
        "",
        "export const migrated = defineNotification({ ...base, input: z.object({}) });",
        "",
      ];
      writeFileSync(file, before.join("\n"));

      const applied = await runCliAt(appDir, "upgrade", "--only", "notification-input");
      const stderr = stripAnsi(applied.stderr);
      const path = "server/notifications/order/shipped.notification.ts";
      const manualMail = "toMail returns the mail as its $mails definition: make this mail a $mails path, such as $mails.post.published, when it is a name";

      expect(applied.exitCode, applied.stderr).toBe(0);
      expect(stderr).toContain(`▲ ${path}:10: ${manualMail}`);
      expect(stderr).toContain(`▲ ${path}:11: ${manualMail}`);
      expect(stderr).toContain(`▲ ${path}:12: ${manualMail}`);
      expect(stderr).toContain(
        `▲ ${path}:16: defineNotification() takes input in place of schema, and toMail returns { mail, input }: check what this spread adds to the notification by hand`,
      );
      expect(stderr).toContain(`▲ ${path}:18: defineNotification() takes input in place of schema`);
      expect(stderr.match(/▲ /g)).toHaveLength(5);
      expect(readFileSync(file, "utf8")).toBe(
        before.map((line) => line.replace("schema: z.object", "input: z.object").replace("data: { id }", "input: { id }")).join("\n"),
      );
    }, 60000);
  });

  describe("upload-pending", () => {
    it("renames uploading of useUpload() to isPending in script and template reads, keeps a local name in use, and leaves other objects", async () => {
      const appDir = scratchPlayground("upgrade-upload-pending");
      const component = join(appDir, "app", "components", "CoverUpload.vue");
      const composable = join(appDir, "app", "composables", "use-cover.ts");
      mkdirSync(join(appDir, "app", "composables"), { recursive: true });
      const before = [
        '<script setup lang="ts">',
        'const { upload, uploading, progress } = useUpload("post-cover");',
        'const cover = useUpload("post-cover");',
        'const { uploading: busy } = useUpload("profile-avatar");',
        'const once = useUpload("post-cover").uploading;',
        'const migrated = useUpload("post-cover").isPending;',
        "const ready = computed(() => !cover.uploading.value);",
        "const other = { uploading: true };",
        "const flag = other.uploading;",
        "</script>",
        "",
        "<template>",
        '  <input type="file" :disabled="uploading || busy || cover.uploading.value" @change="upload" />',
        '  <progress v-if="cover.uploading.value" :value="progress ?? undefined" />',
        "</template>",
        "",
      ];
      const beforeComposable = ['export function useCover() {', '  const { upload, uploading } = useUpload("post-cover");', "", "  return { upload };", "}", ""];
      writeFileSync(component, before.join("\n"));
      writeFileSync(composable, beforeComposable.join("\n"));

      const applied = await runCliAt(appDir, "upgrade", "--only", "upload-pending");

      expect(applied.exitCode, applied.stderr).toBe(0);
      expect(applied.stdout).toContain("updated: app/components/CoverUpload.vue\n");
      expect(applied.stdout).toContain("updated: app/composables/use-cover.ts\n");
      expect(stripAnsi(applied.stderr)).not.toContain("▲ ");
      expect(readFileSync(component, "utf8")).toBe(
        before
          .map((line) =>
            line
              .replace("{ upload, uploading, progress }", "{ upload, isPending: uploading, progress }")
              .replace("{ uploading: busy }", "{ isPending: busy }")
              .replace('useUpload("post-cover").uploading', 'useUpload("post-cover").isPending')
              .replaceAll("cover.uploading", "cover.isPending"),
          )
          .join("\n"),
      );
      expect(readFileSync(composable, "utf8")).toBe(beforeComposable.map((line) => line.replace("{ upload, uploading }", "{ upload, isPending }")).join("\n"));

      const again = await runCliAt(appDir, "upgrade", "--only", "upload-pending");

      expect(again.stdout).not.toContain("CoverUpload.vue");
      expect(again.stdout).not.toContain("use-cover.ts");
    }, 60000);

    it("prints a destructured uploading with a default as a manual step and leaves it", async () => {
      const appDir = scratchPlayground("upgrade-upload-pending-default");
      const file = join(appDir, "app", "composables", "use-avatar.ts");
      mkdirSync(join(appDir, "app", "composables"), { recursive: true });
      const before = ['export function useAvatar() {', '  const { upload, uploading = false } = useUpload("profile-avatar");', "", "  return { upload, uploading };", "}", ""];
      writeFileSync(file, before.join("\n"));

      const applied = await runCliAt(appDir, "upgrade", "--only", "upload-pending");
      const stderr = stripAnsi(applied.stderr);

      expect(applied.exitCode, applied.stderr).toBe(0);
      expect(stderr).toContain(
        "▲ app/composables/use-avatar.ts:2: useUpload() returns isPending in place of uploading: rename this destructured uploading with its default by hand",
      );
      expect(stderr.match(/▲ /g)).toHaveLength(1);
      expect(readFileSync(file, "utf8")).toBe(before.join("\n"));
    }, 60000);
  });
  describe("live-query-reactive", () => {
    it("removes .value after the fields of useLiveQuery() in script and template, wraps a destructured one in toRefs(), and prints a field passed to watch() as a manual step", async () => {
      const appDir = scratchPlayground("upgrade-live-query-reactive");
      const page = join(appDir, "app", "pages", "live.vue");
      const composable = join(appDir, "app", "composables", "use-live-posts.ts");
      const watcher = join(appDir, "app", "composables", "use-post-watch.ts");
      mkdirSync(join(appDir, "app", "composables"), { recursive: true });
      const before = [
        '<script setup lang="ts">',
        'const posts = useLiveQuery($api.post.list.queryOptions(), { channel: "posts", refetch: { created: true } });',
        "const titles = computed(() => posts.data.value?.rows.map((row) => row.title) ?? []);",
        "const reload = () => posts.refetch();",
        'const total = useLiveQuery($api.post.list.queryOptions(), { channel: "posts" }).data.value?.total;',
        "</script>",
        "",
        "<template>",
        '  <p v-if="posts.isPending.value">{{ titles }} {{ total }}</p>',
        '  <QueryState :query="posts" @retry="reload" />',
        "</template>",
        "",
      ];
      const beforeComposable = [
        "export function useLivePosts() {",
        '  const { data } = useLiveQuery($api.post.list.queryOptions(), { channel: "posts" });',
        "",
        "  return computed(() => data.value?.rows ?? []);",
        "}",
        "",
      ];
      const beforeWatcher = [
        "export function usePostWatch() {",
        '  const posts = useLiveQuery($api.post.list.queryOptions(), { channel: "posts" });',
        "",
        "  watch(posts.data, () => posts.error.value);",
        "}",
        "",
      ];
      writeFileSync(page, before.join("\n"));
      writeFileSync(composable, beforeComposable.join("\n"));
      writeFileSync(watcher, beforeWatcher.join("\n"));

      const applied = await runCliAt(appDir, "upgrade", "--only", "live-query-reactive");
      const stderr = stripAnsi(applied.stderr);

      expect(applied.exitCode, applied.stderr).toBe(0);
      expect(applied.stdout).toContain("updated: app/pages/live.vue\n");
      expect(applied.stdout).toContain("updated: app/composables/use-live-posts.ts\n");
      expect(stderr).toContain(
        "▲ app/composables/use-post-watch.ts:4: useLiveQuery() returns a reactive object, so posts.data is no longer a ref: pass () => posts.data",
      );
      expect(stderr.match(/▲ /g)).toHaveLength(1);
      expect(readFileSync(page, "utf8")).toBe(
        before.map((line) => line.replaceAll(".data.value", ".data").replace("posts.isPending.value", "posts.isPending")).join("\n"),
      );
      expect(readFileSync(composable, "utf8")).toBe(
        beforeComposable
          .map((line) => line.replace('useLiveQuery($api.post.list.queryOptions(), { channel: "posts" })', 'toRefs(useLiveQuery($api.post.list.queryOptions(), { channel: "posts" }))'))
          .join("\n"),
      );
      expect(readFileSync(watcher, "utf8")).toBe(beforeWatcher.map((line) => line.replace("posts.error.value", "posts.error")).join("\n"));

      const again = await runCliAt(appDir, "upgrade", "--only", "live-query-reactive");

      expect(again.stdout).not.toContain("updated:");
      expect(stripAnsi(again.stderr).match(/▲ /g)).toHaveLength(1);
    }, 60000);
    it("prints a binding of useLiveQuery() that is destructured or passed to a call other than toRefs() as a manual step", async () => {
      const appDir = scratchPlayground("upgrade-live-query-reactive-uses");
      const file = join(appDir, "app", "composables", "use-post-rows.ts");
      mkdirSync(join(appDir, "app", "composables"), { recursive: true });
      const before = [
        "export function usePostRows() {",
        '  const posts = useLiveQuery($api.post.list.queryOptions(), { channel: "posts" });',
        "  const { data } = posts;",
        "  const rows = toRefs(posts);",
        "  const page = usePage(posts);",
        "",
        "  return { data, rows, page };",
        "}",
        "",
      ];
      writeFileSync(file, before.join("\n"));

      const applied = await runCliAt(appDir, "upgrade", "--only", "live-query-reactive");
      const stderr = stripAnsi(applied.stderr);

      expect(applied.exitCode, applied.stderr).toBe(0);
      const step = "useLiveQuery() returns a reactive object, so the fields of posts are no longer refs here: destructure toRefs(posts), or read posts.<field> without .value";
      expect(stderr).toContain(`▲ app/composables/use-post-rows.ts:3: ${step}`);
      expect(stderr).toContain(`▲ app/composables/use-post-rows.ts:5: ${step}`);
      expect(stderr.match(/▲ /g)).toHaveLength(2);
      expect(readFileSync(file, "utf8")).toBe(before.join("\n"));
    }, 60000);
  });

 describe("test-client-api", () => {
    it("renames trpc of the test client to api through a call, a const and a destructure, keeps the local name when api is taken, and prints a client it cannot follow as a manual step", async () => {
      const appDir = scratchPlayground("upgrade-test-client-api");
      const posts = join(appDir, "tests", "functional", "posts.test.ts");
      const taken = join(appDir, "tests", "functional", "taken.test.ts");
      mkdirSync(join(appDir, "tests", "functional"), { recursive: true });
      const before = [
        'import { userFactory } from "#nuxvel/factories";',
        'import { actingAs, describe, guest, it, signIn } from "@nuxvel/nuxt/testing";',
        "",
        'describe("posts", () => {',
        '  it("lists", async () => {',
        "    const ada = actingAs(await userFactory());",
        '    await ada.trpc.post.create({ title: "Hi", body: "" });',
        "    await guest().trpc.post.list();",
        '    const { trpc } = await signIn("ada@example.com", "secret-password");',
        "    await trpc.post.list();",
        "    const callers = { trpc };",
        "    const { trpc: caller, fetch } = guest();",
        "    await caller.post.list();",
        '    await fetch("/");',
        "    return callers;",
        "  });",
        "});",
        "",
      ];
      const beforeTaken = [
        'import { describe, guest, it } from "@nuxvel/nuxt/testing";',
        "",
        "const client = () => guest();",
        "",
        'describe("taken", () => {',
        '  it("lists", async () => {',
        '    const api = "unused";',
        "    const { trpc } = guest();",
        "    await trpc.post.list();",
        "    await client().trpc.post.list();",
        "    return api;",
        "  });",
        "});",
        "",
      ];
      writeFileSync(posts, before.join("\n"));
      writeFileSync(taken, beforeTaken.join("\n"));

      const applied = await runCliAt(appDir, "upgrade", "--only", "test-client-api");
      const stderr = stripAnsi(applied.stderr);

      expect(applied.exitCode, applied.stderr).toBe(0);
      expect(applied.stdout).toContain("updated: tests/functional/posts.test.ts\n");
      expect(applied.stdout).toContain("updated: tests/functional/taken.test.ts\n");
      expect(stderr).toContain(
        "▲ tests/functional/taken.test.ts:10: The test client of actingAs(), guest() and signIn() exposes api in place of trpc: if this is one, read .api here by hand",
      );
      expect(stderr.match(/▲ /g)).toHaveLength(1);
      expect(readFileSync(posts, "utf8")).toBe(
        before
          .map((line) =>
            line
              .replace(".trpc.", ".api.")
              .replace("{ trpc } = await", "{ api } = await")
              .replace("await trpc.", "await api.")
              .replace("{ trpc };", "{ trpc: api };")
              .replace("{ trpc: caller", "{ api: caller"),
          )
          .join("\n"),
      );
      expect(readFileSync(taken, "utf8")).toBe(beforeTaken.map((line) => line.replace("{ trpc } = guest()", "{ api: trpc } = guest()")).join("\n"));

      const again = await runCliAt(appDir, "upgrade", "--only", "test-client-api");

      expect(again.stdout).not.toContain("updated:");
      expect(stripAnsi(again.stderr).match(/▲ /g)).toHaveLength(1);
    }, 60000);
  });
  describe("cli-names", () => {
    it("rewrites the renamed commands, also through ./nv and nv, in package.json, the workflows and the Dockerfile, and leaves the other commands", async () => {
      const appDir = scratchPlayground("upgrade-cli-names");
      const manifest = join(appDir, "package.json");
      const workflow = join(appDir, ".github", "workflows", "deploy.yml");
      const dockerfile = join(appDir, "Dockerfile");
      mkdirSync(join(appDir, ".github", "workflows"), { recursive: true });
      const scripts = {
        "test:functional": "nuxvel test",
        "test:ui": "nuxvel test:ui",
        "test:changed": "nuxvel test --changes-only",
        flags: "nuxvel flags:list && nuxvel flags:stale --json",
        "flag:on": "nuxvel flags:set checkout --value true",
        push: "nuxvel push:keys",
        wrapped: "./nv test server && nv routes --json && ./nv flags:set checkout --value true",
        kept: "./nv test:ui && dev-nv test && nv testing",
        listings: "nuxvel channels && nuxvel events --json && nuxvel schedule:list",
      };
      writeFileSync(manifest, `${JSON.stringify({ ...JSON.parse(readFileSync(manifest, "utf8")), scripts }, null, 2)}\n`);
      const beforeWorkflow = [
        "jobs:",
        "  test:",
        "    steps:",
        "      - run: npx nuxvel test --shard=${{ matrix.shard }}/3",
        "      - run: npx nuxvel routes --diff-env=production",
        "      - run: releases=$(npx nuxvel releases production --json)",
        "      - run: npx nuxvel test:compat",
        "",
      ];
      writeFileSync(workflow, beforeWorkflow.join("\n"));
      writeFileSync(dockerfile, "RUN npx nuxvel routes --json > nuxvel-routes.json\n");

      const applied = await runCliAt(appDir, "upgrade", "--only", "cli-names");

      expect(applied.exitCode, applied.stderr).toBe(0);
      expect(applied.stdout).toContain("updated: package.json\n");
      expect(applied.stdout).toContain("updated: .github/workflows/deploy.yml\n");
      expect(applied.stdout).toContain("updated: Dockerfile\n");
      expect(JSON.parse(readFileSync(manifest, "utf8")).scripts).toEqual({
        "test:functional": "nuxvel test:functional",
        "test:ui": "nuxvel test:ui",
        "test:changed": "nuxvel test:functional --changes-only",
        flags: "nuxvel flag:list && nuxvel flag:stale --json",
        "flag:on": "nuxvel flag:set checkout --value true",
        push: "nuxvel key:push",
        wrapped: "./nv test:functional server && nv route:list --json && ./nv flag:set checkout --value true",
        kept: "./nv test:ui && dev-nv test && nv testing",
        listings: "nuxvel channel:list && nuxvel event:list --json && nuxvel schedule:list",
      });
      expect(readFileSync(workflow, "utf8")).toBe(
        beforeWorkflow
          .map((line) =>
            line
              .replace("nuxvel test --shard", "nuxvel test:functional --shard")
              .replace("nuxvel routes", "nuxvel route:list")
              .replace("nuxvel releases", "nuxvel release:list"),
          )
          .join("\n"),
      );
      expect(readFileSync(dockerfile, "utf8")).toBe("RUN npx nuxvel route:list --json > nuxvel-routes.json\n");

      const again = await runCliAt(appDir, "upgrade", "--only", "cli-names");

      expect(again.stdout).not.toContain("updated:");
    }, 60000);
  });

  describe("explicit-sdk-imports", () => {
    it("imports useS3(), useQueue() and useRedis() from their subpaths where a file uses them, and leaves a file that imports or declares them", async () => {
      const appDir = scratchPlayground("upgrade-explicit-sdk-imports");
      const api = join(appDir, "server", "api");
      mkdirSync(api, { recursive: true });
      const usesAll = [
        'import { HeadObjectCommand } from "@aws-sdk/client-s3";',
        "",
        "export default defineEventHandler(async () => {",
        '  await useS3().send(new HeadObjectCommand({ Bucket: useBucket(), Key: "a" }));',
        '  await useRedis("cache").get(redisKey("a"));',
        "  return useQueue().getFailed();",
        "});",
        "",
      ];
      const usesRedis = ['export default defineEventHandler(() => useRedis("cache").ping());', ""];
      const imported = ['import { useRedis } from "@nuxvel/nuxt/redis";', "", 'export default defineEventHandler(() => useRedis("cache").ping());', ""];
      const declared = ["function useS3() {", "  return 1;", "}", "", "export default defineEventHandler(() => useS3());", ""];
      writeFileSync(join(api, "uses-all.get.ts"), usesAll.join("\n"));
      writeFileSync(join(api, "uses-redis.get.ts"), usesRedis.join("\n"));
      writeFileSync(join(api, "imported.get.ts"), imported.join("\n"));
      writeFileSync(join(api, "declared.get.ts"), declared.join("\n"));

      const applied = await runCliAt(appDir, "upgrade", "--only", "explicit-sdk-imports");

      expect(applied.exitCode, applied.stderr).toBe(0);
      expect(applied.stdout.match(/updated: /g)).toHaveLength(2);
      expect(applied.stdout).toContain("updated: server/api/uses-all.get.ts\n");
      expect(applied.stdout).toContain("updated: server/api/uses-redis.get.ts\n");
      expect(readFileSync(join(api, "uses-all.get.ts"), "utf8")).toBe(
        [
          usesAll[0],
          'import { useS3 } from "@nuxvel/nuxt/storage";',
          'import { useQueue } from "@nuxvel/nuxt/queue";',
          'import { useRedis } from "@nuxvel/nuxt/redis";',
          ...usesAll.slice(1),
        ].join("\n"),
      );
      expect(readFileSync(join(api, "uses-redis.get.ts"), "utf8")).toBe(['import { useRedis } from "@nuxvel/nuxt/redis";', "", ...usesRedis].join("\n"));

      const again = await runCliAt(appDir, "upgrade", "--only", "explicit-sdk-imports");

      expect(again.stdout).not.toContain("updated:");
    }, 60000);

    it("imports useStripe() from @nuxvel/nuxt/billing where a file uses it", async () => {
      const appDir = scratchPlayground("upgrade-explicit-stripe-import");
      const api = join(appDir, "server", "api");
      mkdirSync(api, { recursive: true });
      const usesStripe = ["export default defineEventHandler(() => useStripe().balance.retrieve());", ""];
      writeFileSync(join(api, "uses-stripe.get.ts"), usesStripe.join("\n"));

      const applied = await runCliAt(appDir, "upgrade", "--only", "explicit-sdk-imports");

      expect(applied.exitCode, applied.stderr).toBe(0);
      expect(applied.stdout).toContain("updated: server/api/uses-stripe.get.ts\n");
      expect(readFileSync(join(api, "uses-stripe.get.ts"), "utf8")).toBe(
        ['import { useStripe } from "@nuxvel/nuxt/billing";', "", ...usesStripe].join("\n"),
      );
    }, 60000);
  });

  describe("explicit-namespace-imports", () => {
    it("imports $seeders and $backfills from their namespace modules where a file uses them, and leaves a file that imports or declares them", async () => {
      const appDir = scratchPlayground("upgrade-explicit-namespace-imports");
      const seeders = join(appDir, "server", "seeders");
      mkdirSync(seeders, { recursive: true });
      const usesBoth = [
        'import { eq } from "drizzle-orm";',
        "",
        "export default defineSeeder(async ({ call }) => {",
        '  await call("a", $seeders.a);',
        "  await runBackfill($backfills.b);",
        "});",
        "",
      ];
      const usesSeeders = ['export default defineSeeder(({ call }) => call($seeders.a));', ""];
      const imported = ['import * as $seeders from "#nuxvel/seeders-namespace";', "", "export default defineSeeder(({ call }) => call($seeders.a));", ""];
      const declared = ["const $backfills = {};", "", "export default defineSeeder(() => $backfills);", ""];
      writeFileSync(join(seeders, "uses-both.ts"), usesBoth.join("\n"));
      writeFileSync(join(seeders, "uses-seeders.ts"), usesSeeders.join("\n"));
      writeFileSync(join(seeders, "imported.ts"), imported.join("\n"));
      writeFileSync(join(seeders, "declared.ts"), declared.join("\n"));

      const applied = await runCliAt(appDir, "upgrade", "--only", "explicit-namespace-imports");

      expect(applied.exitCode, applied.stderr).toBe(0);
      expect(applied.stdout.match(/updated: /g)).toHaveLength(2);
      expect(applied.stdout).toContain("updated: server/seeders/uses-both.ts\n");
      expect(applied.stdout).toContain("updated: server/seeders/uses-seeders.ts\n");
      expect(readFileSync(join(seeders, "uses-both.ts"), "utf8")).toBe(
        [
          usesBoth[0],
          'import * as $seeders from "#nuxvel/seeders-namespace";',
          'import * as $backfills from "#nuxvel/backfills-namespace";',
          ...usesBoth.slice(1),
        ].join("\n"),
      );
      expect(readFileSync(join(seeders, "uses-seeders.ts"), "utf8")).toBe(['import * as $seeders from "#nuxvel/seeders-namespace";', "", ...usesSeeders].join("\n"));

      const again = await runCliAt(appDir, "upgrade", "--only", "explicit-namespace-imports");

      expect(again.stdout).not.toContain("updated:");
    }, 60000);
  });

  describe("explicit-imports", () => {
    it("imports each nuxvel name a server file or a .vue script uses from its topic path, and leaves a name the file declares itself", async () => {
      const appDir = scratchPlayground("upgrade-explicit-imports");
      const api = join(appDir, "server", "api");
      mkdirSync(api, { recursive: true });
      const server = [
        'import { postsTable } from "#nuxvel/schema";',
        "",
        'const useDb = () => "local";',
        "",
        "export default defineEventHandler(async () => {",
        "  const message = useDb();",
        "  const post = await findOrFail(postsTable, 1);",
        "",
        '  return { message, post, parsed: createPostInput.parse({ title: "Hi", body: "" }) };',
        "});",
        "",
      ];
      const vue = [
        "<template>",
        "  <div>{{ user?.name }}</div>",
        "</template>",
        "",
        '<script setup lang="ts">',
        "const user = useUser();",
        "const posts = useLiveQuery(() => $api.post.list.queryOptions());",
        'const rows: RouterOutputs["post"]["list"] = [];',
        "</script>",
        "",
      ];
      writeFileSync(join(api, "topic-imports.get.ts"), server.join("\n"));
      writeFileSync(join(appDir, "app", "pages", "topic-imports.vue"), vue.join("\n"));

      const applied = await runCliAt(appDir, "upgrade", "--only", "explicit-imports");

      expect(applied.exitCode, applied.stderr).toBe(0);
      expect(applied.stdout).toContain("updated: server/api/topic-imports.get.ts\n");
      expect(applied.stdout).toContain("updated: app/pages/topic-imports.vue\n");
      expect(readFileSync(join(api, "topic-imports.get.ts"), "utf8")).toBe(
        [
          server[0],
          'import { createPostInput } from "#shared/schemas/post";',
          'import { findOrFail } from "@nuxvel/nuxt/server/database";',
          ...server.slice(1),
        ].join("\n"),
      );
      expect(readFileSync(join(appDir, "app", "pages", "topic-imports.vue"), "utf8")).toBe(
        [
          ...vue.slice(0, 5),
          'import { $api, useLiveQuery } from "@nuxvel/nuxt/app/api";',
          'import type { RouterOutputs } from "@nuxvel/nuxt/app/api";',
          'import { useUser } from "@nuxvel/nuxt/app/auth";',
          "",
          ...vue.slice(5),
        ].join("\n"),
      );

      const again = await runCliAt(appDir, "upgrade", "--only", "explicit-imports");

      expect(again.exitCode, again.stderr).toBe(0);
      expect(again.stdout).toBe("");
    }, 60000);

    it("rewrites a $<kind> member to the imported definition, imports a shared schema, and prints a key with no definition as a manual step", async () => {
      const appDir = scratchPlayground("upgrade-explicit-imports-namespaces");
      const api = join(appDir, "server", "api");
      const seeders = join(appDir, "server", "seeders");
      const schemas = join(appDir, "shared", "schemas");
      const jobs = join(appDir, "server", "jobs");
      mkdirSync(api, { recursive: true });
      mkdirSync(join(jobs, "r5"), { recursive: true });
      const namespaced = [
        "export default defineEventHandler(async () => {",
        "  await $jobs.post.notifyFollowers.dispatch({ postId: 1 });",
        "  await $jobs.r5.queueEmail.dispatch({ postId: 2 });",
        "",
        "  return $policies.post.update;",
        "});",
        "",
      ];
      const defaultJob = [
        "export default defineJob({",
        "  handler: async () => {",
        '    useLogger("r5").info("queued");',
        "  },",
        "});",
        "",
      ];
      const seedersFile = [
        'import * as $seeders from "#nuxvel/seeders-namespace";',
        "",
        "export default defineSeeder(async ({ call }) => {",
        '  await call("demo", $seeders.database);',
        "});",
        "",
      ];
      const gone = ["export default defineEventHandler(() => $jobs.post.gone.dispatch({ postId: 1 }));", ""];
      const schema = ['export default defineEventHandler(() => createPostInput.parse({ title: "Hi", body: "" }));', ""];
      const ambiguous = ["export default defineEventHandler(() => r5SharedInput);", ""];
      writeFileSync(join(api, "namespaces.get.ts"), namespaced.join("\n"));
      writeFileSync(join(seeders, "namespaces.ts"), seedersFile.join("\n"));
      writeFileSync(join(jobs, "r5", "queue-email.ts"), defaultJob.join("\n"));
      writeFileSync(join(api, "gone.get.ts"), gone.join("\n"));
      writeFileSync(join(api, "schema.get.ts"), schema.join("\n"));
      writeFileSync(join(api, "ambiguous.get.ts"), ambiguous.join("\n"));
      writeFileSync(join(schemas, "r5-a.ts"), "export const r5SharedInput = 1;\n");
      writeFileSync(join(schemas, "r5-b.ts"), "export const r5SharedInput = 2;\n");

      const applied = await runCliAt(appDir, "upgrade", "--only", "explicit-imports");

      expect(applied.exitCode, applied.stderr).toBe(0);
      expect(readFileSync(join(api, "namespaces.get.ts"), "utf8")).toBe(
        [
          'import { postNotifyFollowersJob } from "#server/jobs/post/notify-followers.job";',
          'import queueEmailJob from "#server/jobs/r5/queue-email";',
          'import { postPolicy } from "#server/policies/post.policy";',
          "",
          "export default defineEventHandler(async () => {",
          "  await postNotifyFollowersJob.dispatch({ postId: 1 });",
          "  await queueEmailJob.dispatch({ postId: 2 });",
          "",
          "  return postPolicy.update;",
          "});",
          "",
        ].join("\n"),
      );
      expect(readFileSync(join(seeders, "namespaces.ts"), "utf8")).toBe(
        [
          seedersFile[0],
          'import { databaseSeeder } from "#server/seeders/database.seeder";',
          'import { defineSeeder } from "@nuxvel/nuxt/server/database";',
          "",
          "export default defineSeeder(async ({ call }) => {",
          '  await call("demo", databaseSeeder);',
          "});",
          "",
        ].join("\n"),
      );
      expect(readFileSync(join(api, "schema.get.ts"), "utf8")).toBe(
        ['import { createPostInput } from "#shared/schemas/post";', "", ...schema].join("\n"),
      );
      expect(readFileSync(join(api, "gone.get.ts"), "utf8")).toBe(gone.join("\n"));
      expect(readFileSync(join(api, "ambiguous.get.ts"), "utf8")).toBe(ambiguous.join("\n"));
      expect(stripAnsi(applied.stderr)).toContain(
        "▲ server/api/gone.get.ts:1: $jobs.post.gone.dispatch is not a definition: import the definition from its file and call it directly",
      );
      expect(stripAnsi(applied.stderr)).toContain(
        "▲ server/api/ambiguous.get.ts:1: r5SharedInput is exported by #shared/schemas/r5-a and #shared/schemas/r5-b: import it from the file that exports it",
      );

      const again = await runCliAt(appDir, "upgrade", "--only", "explicit-imports");

      expect(again.exitCode, again.stderr).toBe(0);
      expect(again.stdout).toBe("");
    }, 60000);
  });
});
