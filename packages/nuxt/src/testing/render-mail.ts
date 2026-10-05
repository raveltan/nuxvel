import { z } from "zod";
import type { Mail, MailSchema } from "../runtime/server/mail/define-mail";
import type { MailInput, MailName } from "../runtime/server/mail/registry";
import { callApp } from "./settled";

const renderedMail = z.object({ subject: z.string(), html: z.string(), text: z.string() });

type RenderedMail = z.infer<typeof renderedMail>;

/**
 * Renders a {@link defineMail} mail, by its name or its definition, in the app under test
 * and resolves to its subject, its HTML converted from MJML, and its
 * plain-text version. Nothing is sent.
 *
 * `input` is parsed by the mail's schema first, rejecting with a
 * `BAD_REQUEST` validation error like {@link sendMail}. Use
 * {@link expectMailSent} to assert that code sends it.
 *
 * @param name A {@link MailName}, or the mail's definition or its stub from
 * `#nuxvel/test-namespaces`; a name no mail defines fails to compile.
 * @param input The mail's input, before its schema parses it.
 * @param options.locale The locale code that the mail renders in. The
 * default is the default locale of the app.
 *
 * @example
 * ```ts
 * import { $mails } from "#nuxvel/test-namespaces";
 *
 * const { subject, text } = await renderMail($mails.welcome, { to: "ada@example.com", name: "Ada" });
 * expect(subject).toBe("Welcome, Ada");
 * expect(text).toContain("Welcome, Ada!");
 *
 * const { subject: chinese } = await renderMail($mails.welcome, { to: "ada@example.com", name: "Ada" }, { locale: "zh" });
 * ```
 */
export async function renderMail<Name extends MailName>(name: Name, input: MailInput<Name>, options?: { locale?: string }): Promise<RenderedMail>;
export async function renderMail<Schema extends MailSchema>(mail: Mail<string, Schema>, input: z.input<Schema>, options?: { locale?: string }): Promise<RenderedMail>;
export async function renderMail(nameOrMail: string | Mail, input: unknown, options: { locale?: string } = {}): Promise<RenderedMail> {
  const name = typeof nameOrMail === "string" ? nameOrMail : nameOrMail.name;

  return renderedMail.parse(await callApp("render-mail", { name, input, locale: options.locale }));
}
