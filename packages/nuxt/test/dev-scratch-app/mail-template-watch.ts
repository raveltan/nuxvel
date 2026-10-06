import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { useTestContext } from "@nuxt/test-utils/e2e";
import { expect, guest } from "@nuxvel/nuxt/testing";
import { describe, it } from "vitest";

export function addMailWithoutTemplate(appDir: string) {
  mkdirSync(join(appDir, "server/mail"), { recursive: true });
  writeFileSync(
    join(appDir, "server/mail/note.mail.ts"),
    'import { z } from "zod";\n\nexport const noteMail = defineMail({ input: z.object({ to: z.email() }), subject: () => "Note", template: "Note" });\n',
  );
  writeFileSync(
    join(appDir, "server/api/note-mail.get.ts"),
    'export default defineEventHandler(() => $mails.note.render({ to: "ada@example.com" }).then(({ text }) => ({ text }), (error: Error) => ({ text: error.message })));\n',
  );
}

async function noteText() {
  return (await guest().$fetch<{ text: string }>("/api/note-mail", { timeout: 2_000, retry: 0 }).catch(() => undefined))?.text;
}

function typedTemplates() {
  return readFileSync(join(useTestContext().options.rootDir, ".nuxt/nuxvel/mail-templates.ts"), "utf8");
}

describe("the dev server with a mail template added", () => {
  it("renders the mail with the new template, and types its name, once the file lands", async () => {
    expect(await noteText()).toBe('No mail template is named "Note"');

    const dir = join(useTestContext().options.rootDir, "server/mail/templates");
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "Note.vue"), "<template><MailLayout><EText>A new note</EText></MailLayout></template>\n");

    await expect.poll(noteText, { timeout: 90_000, interval: 500 }).toContain("A new note");
    await expect.poll(typedTemplates, { timeout: 30_000, interval: 500 }).toContain('"Note": template0');
  }, 100_000);
});
