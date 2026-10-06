import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { useTestContext } from "@nuxt/test-utils/e2e";
import { expect } from "@nuxvel/nuxt/testing";
import { describe, it } from "vitest";

const routerFile = (root: string) => join(root, "server/trpc/routers/greetings.ts");

const greetingsRouter = (input: string) =>
  `import { z } from "zod";\n\nexport default { greet: publicProcedure.input(${input}).output(z.void()).mutation(() => {}) };\n`;

const SCANNED_FILES: Record<string, string> = {
  "shared/schemas/greeting.ts": 'import { z } from "zod";\n\nexport const greetingInput = z.object({ name: z.string() });\n',
  "shared/schemas/renamed.ts": 'import { z } from "zod";\n\nexport const renamedInput = z.object({ title: z.string() });\n',
  "shared/schemas/duplicate-a.ts": 'import { z } from "zod";\n\nexport const sameInput = z.object({ a: z.string() });\n',
  "shared/schemas/duplicate-b.ts": 'import { z } from "zod";\n\nexport const sameInput = z.object({ b: z.string() });\n',
  "server/trpc/routers/renamed.ts":
    'import { z } from "zod";\nimport { renamedInput as localInput } from "#shared/schemas/renamed";\n\nexport default { save: publicProcedure.input(localInput).output(z.void()).mutation(() => {}) };\n',
  "server/trpc/routers/shadowed.ts": [
    'import { z } from "zod";',
    "",
    "const { greetingInput } = { greetingInput: z.object({ other: z.string() }) };",
    "function renamedInput(input: unknown) {",
    "  return input;",
    "}",
    "",
    "export default {",
    "  byConst: publicProcedure.input(greetingInput).output(z.void()).mutation(() => {}),",
    "  byFunction: publicProcedure.input(renamedInput).output(z.void()).mutation(() => {}),",
    "};",
    "",
  ].join("\n"),
  "server/trpc/routers/duplicate.ts":
    'import { z } from "zod";\n\nexport default { save: publicProcedure.input(sameInput).output(z.void()).mutation(() => {}) };\n',
  "server/domains/billing/actions/charge.action.ts": 'export const chargeAction = defineAction({ input: greetingInput, handler: () => "charged" });\n',
  "server/domains/billing/routers/billing.router.ts":
    'import { z } from "zod";\n\nexport default { charge: publicProcedure.output(z.string()).action($actions.billing.charge) };\n',
};

export function addGreetingsRouter(appDir: string) {
  for (const [file, content] of Object.entries(SCANNED_FILES)) {
    mkdirSync(dirname(join(appDir, file)), { recursive: true });
    writeFileSync(join(appDir, file), content);
  }
  writeFileSync(routerFile(appDir), greetingsRouter("z.object({ name: z.string() })"));
}

function generated(extension: "d.ts" | "mjs") {
  return readFileSync(join(useTestContext().options.rootDir, `.nuxt/nuxvel/procedure-inputs.${extension}`), "utf8");
}

function schemaNames(code: string) {
  const imports = new Map([...code.matchAll(/import (?:type )?\{ (\w+) as (\w+) \}/g)].map(([, name, local]) => [local, name]));

  return Object.fromEntries([...code.matchAll(/"([\w.]+)": (?:typeof )?(\w+)/g)].map(([, path, local]) => [path, imports.get(local ?? "")]));
}

describe("the dev server with a mutation given a shared input schema", () => {
  it.for(["d.ts", "mjs"] as const)("maps each mutation to its shared schema in procedure-inputs.%s", (extension) => {
    expect(schemaNames(generated(extension))).toEqual({ "renamed.save": "renamedInput", "billing.charge": "greetingInput" });
  });

  it("gives useActionForm() the schema once the edit lands", async () => {
    writeFileSync(routerFile(useTestContext().options.rootDir), greetingsRouter("greetingInput"));

    for (const extension of ["d.ts", "mjs"] as const) {
      await expect.poll(() => schemaNames(generated(extension)), { timeout: 30_000, interval: 500 }).toMatchObject({ "greetings.greet": "greetingInput" });
    }
  }, 70_000);
});
