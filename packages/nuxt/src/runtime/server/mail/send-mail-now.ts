import type { z } from "zod";
import { publishObserved } from "../observe/channels";
import type { Mail, MailSchema } from "./define-mail";
import type { MailInput, MailName } from "./registry";
import { type SendMailOptions, mailName, prepareMail } from "./send-mail";
import { deliverMail } from "./transport";

/**
 * Sends a mail, by its name or its definition, now, through SMTP, without the queue.
 *
 * Auto-imported on the server. Reach for it only when the caller must
 * know the mail went out before it continues, such as a command that
 * checks the mail settings. Prefer {@link sendMail}: this one does not
 * wait for the surrounding transaction, so a rollback after it does not
 * take the mail back, and it holds the request until the SMTP server
 * answers. It throws what the SMTP server answers with, and nothing
 * retries it.
 *
 * Validation, rendering and the {@link suppressMail} check work as in
 * {@link sendMail}. `expectMailSent` sees the mail in a test.
 *
 * @param options.locale The locale code that the mail renders in. The
 * default is {@link currentLocale}.
 *
 * @example
 * ```ts
 * await sendMailNow("welcome", { to: user.email, name: user.name });
 * await sendMailNow($mails.welcome, { to: user.email, name: user.name }, { locale: "zh" });
 * ```
 */
export async function sendMailNow<Name extends MailName>(name: Name, input: MailInput<Name>, options?: SendMailOptions): Promise<void>;
export async function sendMailNow<Schema extends MailSchema>(mail: Mail<string, Schema>, input: z.input<Schema>, options?: SendMailOptions): Promise<void>;
export async function sendMailNow(nameOrMail: string | Mail, input: unknown, options: SendMailOptions = {}): Promise<void> {
  const name = mailName(nameOrMail);
  const prepared = await prepareMail(name, input, options.locale);

  if (!prepared) return;

  await deliverMail(prepared.message);
  publishObserved("mail:send", { name, input: prepared.input });
}
