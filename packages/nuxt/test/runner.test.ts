import { execFile } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { loadApp, type LoadedApp } from "@nuxvel/nuxt/runner";
import { expect } from "@nuxvel/nuxt/testing";
import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, it } from "vitest";
import { useTestDatabase } from "./helpers/database";
import { createScratchApp, removeScratchApp, scratchAppDir } from "./helpers/scratch-app";

const nuxtBin = fileURLToPath(new URL("../../../node_modules/nuxt/bin/nuxt.mjs", import.meta.url));
const appDir = scratchAppDir("runner");
const SECRET = "sk_test_runner_secret";

const files: Record<string, string> = {
  "nuxt.config.ts": `export default defineNuxtConfig({
  compatibilityDate: "2025-07-15",
  modules: ["@nuxvel/nuxt"],
  runtimeConfig: { stripeSecretKey: process.env.NUXT_STRIPE_SECRET_KEY },
});
`,
  "server/actions/notes/add-note.action.ts": `import { healthChecksTable } from "#nuxvel/schema";
import { defineAction } from "@nuxvel/nuxt/server/actions";
import { insertOne } from "@nuxvel/nuxt/server/database";
import { z } from "zod";

export const addNoteAction = defineAction({
  input: z.object({ name: z.string() }),
  handler: async (input) => insertOne(healthChecksTable, { name: input.name }),
});
`,
  "server/utils/page-of.ts": `export function pageOf(path: string) {
  return clampPage(Number(getQuery({ path }).page));
}
`,
  "server/utils/clamp-page.ts": `export function clampPage(page: number) {
  return Math.max(1, Math.min(page, 50));
}
`,
  "server/mail/hello.mail.ts": `import { z } from "zod";
import { defineMail } from "@nuxvel/nuxt/server/mail";

export const helloMail = defineMail({
  input: z.object({ to: z.email(), name: z.string() }),
  subject: () => "Hello",
  template: "Hello",
});
`,
  "server/mail/templates/Hello.vue": `<script setup lang="ts">
defineProps<{ name: string }>();
</script>

<template>
  <MailLayout preview="Hello">
    <EHeading>Hello {{ name }}</EHeading>
    <EText>Rendered from a .vue template</EText>
  </MailLayout>
</template>
`,
};

interface Mails {
  default: { name: string; render(input: object, locale: string): Promise<{ html: string; text: string }> }[];
}

describe("the no-build runner in a prepared scratch app", () => {
  const db = useTestDatabase();
  let app: LoadedApp;

  beforeAll(async () => {
    createScratchApp(appDir);
    for (const [file, text] of Object.entries(files)) {
      mkdirSync(dirname(join(appDir, file)), { recursive: true });
      writeFileSync(join(appDir, file), text);
    }
    await promisify(execFile)(process.execPath, [nuxtBin, "prepare"], { cwd: appDir, env: { ...process.env, NO_COLOR: "1", NUXT_STRIPE_SECRET_KEY: SECRET } });

    process.env.NUXT_STRIPE_SECRET_KEY = SECRET;
    app = await loadApp({ rootDir: appDir });
  }, 120_000);

  afterAll(async () => {
    delete process.env.NUXT_STRIPE_SECRET_KEY;
    await app?.close();
    removeScratchApp(appDir);
  });

  it("runs an action from its file with no build and leaves its row", async () => {
    await app.run(async ({ load }) => {
      const { addNoteAction } = await load<{ addNoteAction: (input: { name: string }, ctx: object) => Promise<unknown> }>(join(appDir, "server/actions/notes/add-note.action.ts"));
      const { systemActor } = await load<{ systemActor: (name: string) => object }>("@nuxvel/nuxt/server/actions");

      await addNoteAction({ name: "from the runner" }, { actor: systemActor("runner-test") });
    });

    expect(await db.execute(sql`select name from health_checks where name = 'from the runner'`)).toHaveLength(1);
    expect(existsSync(join(appDir, ".output"))).toBe(false);
  });

  it("loads a server util that uses getQuery and another util with no import", async () => {
    const page = await app.run(async ({ load }) => {
      const { pageOf } = await load<{ pageOf: (path: string) => number }>(join(appDir, "server/utils/page-of.ts"));

      return [pageOf("/posts?page=999"), pageOf("/posts?page=3")];
    });

    expect(page).toEqual([50, 3]);
  });

  it("renders a .vue mail template", async () => {
    const { html, text } = await app.run(async ({ load }) => {
      const { default: mails } = await load<Mails>("#nuxvel/mails");
      const mail = mails.find(({ name }) => name === "hello");

      return mail ? mail.render({ to: "ada@example.com", name: "Ada" }, "en") : { html: "", text: "" };
    });

    expect(html).toContain("Hello Ada");
    expect(text).toContain("Rendered from a .vue template");
  });

  it("applies a NUXT_* variable at run time and keeps its value out of runtime-config.json", async () => {
    const runtimeConfig = await app.run(async ({ load }) => (await load<{ useRuntimeConfig: () => { stripeSecretKey: string } }>("nitropack/runtime")).useRuntimeConfig());

    expect(runtimeConfig.stripeSecretKey).toBe(SECRET);
    expect(readFileSync(join(appDir, ".nuxt/nuxvel/runtime-config.json"), "utf8")).not.toContain(SECRET);
  });
});
