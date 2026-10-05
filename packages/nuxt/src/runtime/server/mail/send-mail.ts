import type { z } from "zod";
import { onCommit } from "../database/transaction";
import { ValidationFailedError } from "../errors/taxonomy";
import { currentLocale } from "../i18n/current-locale";
import { useLogger } from "../logging/logger";
import { type SentMail, publishObserved } from "../observe/channels";
import { useNuxvelConfig } from "../utils/config";
import { dispatchAfterCommit } from "../utils/dispatch-after-commit";
import { MAIL_JOB_NAME } from "./jobs/mail-job-name";
import { type MailInput, type MailName, findMail } from "./registry";
import type { Mail, MailSchema } from "./define-mail";
import type { MailMessage } from "./transport";
import { isMailSuppressed } from "./suppress-mail";

function recipientDomain(address: string) {
  return address.slice(address.lastIndexOf("@") + 1);
}

/** The options of {@link sendMail} and {@link sendMailNow}. */
export interface SendMailOptions {
  /**
   * The locale code that the mail renders in, for example `"zh"`. The
   * default is {@link currentLocale}: the locale of the request or the
   * action, else the default locale. A locale that the app does not have
   * renders with the default locale.
   */
  locale?: string;
}

/**
 * Sends a mail, by its name or its definition, once the surrounding
 * transaction commits.
 *
 * Auto-imported on the server. Validates `input` against the mail's
 * {@link defineMail} schema, async refinements and transforms included —
 * throwing the same {@link ValidationFailedError}
 * an action throws — and renders it now, then hands the rendered message
 * to {@link dispatchAfterCommit} as a `nuxvel.mail` job. So sending never blocks
 * the request, and a rolled-back transaction sends nothing. The message
 * goes out through the SMTP server at `NUXT_MAIL_URL`, from the
 * `nuxvel.mail.from` address.
 *
 * A recipient recorded with {@link suppressMail} is skipped with a log
 * line: nothing is rendered or queued.
 *
 * The first argument is a {@link MailName} or the mail's definition
 * (`$mails.welcome` or an import), and `input` that mail's input, so a
 * misspelled name or a wrong input fails to compile. Throws when no
 * mail has this name, or when `nuxvel.mail.from` is not configured.
 * {@link sendMailNow} sends without the queue, for the rare case that
 * must not wait.
 *
 * The mail renders in `options.locale`, else in {@link currentLocale}.
 *
 * @param options.locale The locale code that the mail renders in.
 *
 * @example
 * ```ts
 * await sendMail("welcome", { to: user.email, name: user.name });
 * await sendMail("welcome", { to: user.email, name: user.name }, { locale: "zh" });
 * await sendMail($mails.welcome, { to: user.email, name: user.name });
 * ```
 */
export async function sendMail<Name extends MailName>(name: Name, input: MailInput<Name>, options?: SendMailOptions): Promise<void>;
export async function sendMail<Schema extends MailSchema>(mail: Mail<string, Schema>, input: z.input<Schema>, options?: SendMailOptions): Promise<void>;
export async function sendMail(nameOrMail: string | Mail, input: unknown, options: SendMailOptions = {}): Promise<void> {
  const name = mailName(nameOrMail);
  const prepared = await prepareMail(name, input, options.locale);

  if (!prepared) return;

  await onCommit(() => publishObserved("mail:send", { name, input: prepared.input }));

  await dispatchAfterCommit(MAIL_JOB_NAME, prepared.message);
}

export function mailName(nameOrMail: string | Mail) {
  return typeof nameOrMail === "string" ? nameOrMail : nameOrMail.name;
}

export async function prepareMail(name: string, input: unknown, locale = currentLocale()): Promise<{ input: SentMail["input"]; message: MailMessage } | undefined> {
  const mail = findMail(name);

  if (!mail) throw new Error(`No mail is named "${name}"`);

  const from = useNuxvelConfig().mail?.from;

  if (!from) throw new Error("nuxvel.mail.from is not configured");

  const result = await mail.input.safeParseAsync(input);

  if (!result.success) throw new ValidationFailedError(result.error);

  if (await isMailSuppressed(result.data.to)) {
    useLogger("mail").info(`${name} suppressed`, { mail: name, recipientDomain: recipientDomain(result.data.to) });
    return undefined;
  }

  return {
    input: result.data,
    message: { from, to: result.data.to, subject: mail.subject(result.data, locale), ...(await mail.render(result.data, locale)) },
  };
}
