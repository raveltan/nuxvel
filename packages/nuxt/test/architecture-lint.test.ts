import { fileURLToPath } from "node:url";
import { expect } from "@nuxvel/nuxt/testing";
import { ESLint } from "eslint";
import { describe, it } from "vitest";
import typescriptParser from "@typescript-eslint/parser";
import accessibility, { architecture, nuxvelPlugin } from "../src/eslint";

const eslint = new ESLint({
  cwd: fileURLToPath(new URL("./lint-fixtures", import.meta.url)),
  overrideConfigFile: true,
  overrideConfig: architecture,
});

const lintFixtures = fileURLToPath(new URL("./lint-fixtures", import.meta.url));

function parentImportsLinter(fix: boolean, allow?: string[]) {
  return new ESLint({
    cwd: lintFixtures,
    overrideConfigFile: true,
    fix,
    overrideConfig: [
      ...accessibility,
      { files: ["**/*.ts"], languageOptions: { parser: typescriptParser } },
      {
        files: ["**/*.ts", "**/*.vue"],
        plugins: { nuxvel: nuxvelPlugin },
        rules: { "nuxvel/no-parent-imports": ["error", allow ? { allow } : {}] },
      },
    ],
  });
}

async function parentImports(file: string, source: string, allow?: string[]) {
  const [reported] = await parentImportsLinter(false, allow).lintText(source, { filePath: file });
  const [fixed] = await parentImportsLinter(true, allow).lintText(source, { filePath: file });

  return {
    messages: (reported?.messages ?? []).filter((message) => message.ruleId === "nuxvel/no-parent-imports").map((message) => message.message),
    output: fixed?.output ?? source,
  };
}

async function rulesFor(file: string) {
  const config: { rules?: Record<string, unknown> } | undefined = await eslint.calculateConfigForFile(file);

  return Object.keys(config?.rules ?? {});
}

describe("architecture lint preset", () => {
  it("checks the tables of each module in layers/ for defineUserData()", async () => {
    for (const file of [
      "server/database/schema/posts.ts",
      "layers/billing/server/database/schema/invoices.ts",
      "layers/billing/server/domains/invoice/schema/invoices.schema.ts",
    ]) {
      expect(await rulesFor(file), file).toContain("nuxvel/user-data-declared");
    }
  });

  it("checks the imports of each file in a module in layers/", async () => {
    for (const file of ["layers/shop/server/utils/checkout.ts", "layers/shop/app/pages/cart.vue"]) {
      expect(await rulesFor(file), file).toContain("nuxvel/module-imports");
    }

    expect(await rulesFor("server/utils/checkout.ts")).not.toContain("nuxvel/module-imports");
  });

  it("flags each column that references the user table and names it", async () => {
    const code = (column: string) =>
      `export const taskTable = pgTable("task", { id: text("id"), ${column}: text("x").references(() => userTable.id) });`;
    const lint = async (source: string) =>
      (await eslint.lintText(source, { filePath: "server/database/schema/tasks.schema.ts" })).flatMap((result) => result.messages);

    for (const column of ["userId", "ownerId", "authorId"]) {
      const messages = await lint(code(column));

      expect(messages.map((message) => message.ruleId)).toContain("nuxvel/user-data-declared");
      expect(messages.map((message) => message.message).join()).toContain(`column ${column}`);
    }

    const belongsTo = `export const taskTable = pgTable("task", { assigneeId: belongsTo(userTable, { nullable: true }) });`;

    expect((await lint(belongsTo)).map((message) => message.message).join()).toContain("column assigneeId");

    const other = `export const taskTable = pgTable("task", { teamId: text("x").references(() => teamTable.id) });`;

    expect((await lint(other)).map((message) => message.ruleId)).not.toContain("nuxvel/user-data-declared");
  });

  it.for([
    {
      name: "a table in the schema folder",
      file: "server/privacy/users.user-data.ts",
      source: `import { userTable } from "../database/schema/auth.schema";\n`,
      messages: ["../database/schema/auth.schema leaves server/privacy/ for server/database/schema/: import it from #nuxvel/schema"],
      output: `import { userTable } from "#nuxvel/schema";\n`,
    },
    {
      name: "a factory, from a test",
      file: "tests/functional/health.test.ts",
      source: `import { userFactory } from '../../server/factories/users.factory';\n`,
      messages: ["../../server/factories/users.factory leaves tests/ for server/factories/: import it from #nuxvel/factories"],
      output: `import { userFactory } from '#nuxvel/factories';\n`,
    },
    {
      name: "a table in a domain folder",
      file: "server/seeders/posts.seeder.ts",
      source: `import { postTable } from "../domains/post/schema/posts.schema";\n`,
      messages: ["../domains/post/schema/posts.schema leaves server/seeders/ for server/domains/post/schema/: import it from #nuxvel/schema"],
      output: `import { postTable } from "#nuxvel/schema";\n`,
    },
    {
      name: "nothing for a table file that imports a table file of another folder",
      file: "server/domains/post/schema/posts.schema.ts",
      source: `import { userTable } from "../../../database/schema/auth.schema";\n`,
      messages: [],
      output: `import { userTable } from "../../../database/schema/auth.schema";\n`,
    },
    {
      name: "nothing for a factory file that imports a factory file of another folder",
      file: "server/domains/post/factories/posts.factory.ts",
      source: `import { userFactory } from "../../../factories/users.factory";\n`,
      messages: [],
      output: `import { userFactory } from "../../../factories/users.factory";\n`,
    },
    {
      name: "a namespace import of a table, which only named imports fix",
      file: "server/jobs/report.job.ts",
      source: `import * as auth from "../database/schema/auth.schema";\n`,
      messages: ["../database/schema/auth.schema leaves server/jobs/ for server/database/schema/: import it from #nuxvel/schema"],
      output: `import * as auth from "../database/schema/auth.schema";\n`,
    },
    {
      name: "other server code",
      file: "server/api/posts/[id].get.ts",
      source: `import { slugify } from "../../utils/slug";\nconst load = () => import("../../utils/slug");\n`,
      messages: [
        "../../utils/slug leaves server/api/ for server/utils/: import it from #server/utils/slug",
        "../../utils/slug leaves server/api/ for server/utils/: import it from #server/utils/slug",
      ],
      output: `import { slugify } from "#server/utils/slug";\nconst load = () => import("#server/utils/slug");\n`,
    },
    {
      name: "shared code",
      file: "server/trpc/routers/post.router.ts",
      source: `export { createPostInput } from "../../../shared/schemas/post";\n`,
      messages: ["../../../shared/schemas/post leaves server/trpc/routers/ for shared/schemas/: import it from #shared/schemas/post"],
      output: `export { createPostInput } from "#shared/schemas/post";\n`,
    },
    {
      name: "app code from a .vue file",
      file: "app/pages/index.vue",
      source: `<script setup lang="ts">\nimport PostCard from "../components/PostCard.vue";\n</script>\n`,
      messages: ["../components/PostCard.vue leaves app/pages/ for app/components/: import it from ~/components/PostCard.vue"],
      output: `<script setup lang="ts">\nimport PostCard from "~/components/PostCard.vue";\n</script>\n`,
    },
    {
      name: "server code from app/",
      file: "app/composables/use-posts.ts",
      source: `import { postTable } from "../../server/database/schema/posts.schema";\n`,
      messages: ["../../server/database/schema/posts.schema leaves app/composables/ for server/database/schema/: app/ does not import server code"],
      output: `import { postTable } from "../../server/database/schema/posts.schema";\n`,
    },
    {
      name: "app code from a test",
      file: "tests/e2e/home.test.ts",
      source: `import PostCard from "../../app/components/PostCard.vue";\n`,
      messages: ["../../app/components/PostCard.vue leaves tests/ for app/components/: no alias reaches it from here"],
      output: `import PostCard from "../../app/components/PostCard.vue";\n`,
    },
    {
      name: "a module in layers/",
      file: "layers/shop/server/actions/checkout.action.ts",
      source: `import { price } from "../utils/price";\n`,
      messages: ["../utils/price leaves layers/shop/server/actions/ for layers/shop/server/utils/: import it from #layers/shop/server/utils/price"],
      output: `import { price } from "#layers/shop/server/utils/price";\n`,
    },
    {
      name: "a sibling folder of the same kind",
      file: "server/actions/posts/create-post.action.ts",
      source: `import { createTagAction } from "../tags/create-tag.action";\nimport { slug } from "./slug";\n`,
      messages: [],
      output: `import { createTagAction } from "../tags/create-tag.action";\nimport { slug } from "./slug";\n`,
    },
    {
      name: "a target the allow option lists",
      file: "server/api/posts.get.ts",
      source: `import { slugify } from "../utils/slug";\n`,
      allow: ["server/utils/**"],
      messages: [],
      output: `import { slugify } from "../utils/slug";\n`,
    },
    {
      name: "an import of shared/schemas/ in server/, which auto-imports it",
      file: "server/trpc/routers/post.router.ts",
      source: `import { createPostInput, postSchema } from "../../../shared/schemas/post";\nexport const postRouter = { createPostInput, postSchema };\n`,
      messages: ["../../../shared/schemas/post is in shared/schemas/, whose exports server/ auto-imports: remove the import"],
      output: `export const postRouter = { createPostInput, postSchema };\n`,
    },
    {
      name: "an import of shared/schemas/ through #shared in an app .vue file",
      file: "app/pages/posts/new.vue",
      source: `<script setup lang="ts">\nimport { createPostInput } from "#shared/schemas/post";\nconst schema = createPostInput;\n</script>\n`,
      messages: ["#shared/schemas/post is in shared/schemas/, whose exports app/ auto-imports: remove the import"],
      output: `<script setup lang="ts">\nconst schema = createPostInput;\n</script>\n`,
    },
    {
      name: "a renamed import of shared/schemas/, which only an import under the same names fixes",
      file: "server/actions/posts/create-post.action.ts",
      source: `import { createPostInput as input } from "~~/shared/schemas/post";\n`,
      messages: ["~~/shared/schemas/post is in shared/schemas/, whose exports server/ auto-imports: remove the import"],
      output: `import { createPostInput as input } from "~~/shared/schemas/post";\n`,
    },
    {
      name: "an import of shared/schemas/ in a server test, which has no auto-imports",
      file: "server/trpc/routers/post.test.ts",
      source: `import { createPostInput } from "../../../shared/schemas/post";\n`,
      messages: ["../../../shared/schemas/post leaves server/trpc/routers/ for shared/schemas/: import it from #shared/schemas/post"],
      output: `import { createPostInput } from "#shared/schemas/post";\n`,
    },
    {
      name: "nothing for an import of shared/schemas/ in a factory or of a nested folder of shared/schemas/",
      file: "server/factories/posts.factory.ts",
      source: `import { createPostInput } from "#shared/schemas/post";\nimport { postForm } from "#shared/schemas/forms/post";\n`,
      messages: [],
      output: `import { createPostInput } from "#shared/schemas/post";\nimport { postForm } from "#shared/schemas/forms/post";\n`,
    },
  ])("nuxvel/no-parent-imports reports $name", async ({ file, source, allow, messages, output }) => {
    const result = await parentImports(file, source, allow);

    expect(result.messages).toEqual(messages);
    expect(result.output).toBe(output);
  });
});
