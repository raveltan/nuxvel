import { fileURLToPath } from "node:url";
import { expect } from "@nuxvel/nuxt/testing";
import { ESLint } from "eslint";
import { describe, it } from "vitest";
import { architecture } from "../src/eslint";

const eslint = new ESLint({
  cwd: fileURLToPath(new URL("./lint-fixtures", import.meta.url)),
  overrideConfigFile: true,
  overrideConfig: architecture,
});

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

    const other = `export const taskTable = pgTable("task", { teamId: text("x").references(() => teamTable.id) });`;

    expect((await lint(other)).map((message) => message.ruleId)).not.toContain("nuxvel/user-data-declared");
  });
});
