import { onCommit } from "../database/transaction";
import { ValidationFailedError } from "../errors/taxonomy";
import { currentLocale } from "../i18n/current-locale";
import { useLogger } from "../logging/logger";
import { type SentMail, publishObserved } from "../observe/channels";
import { useNuxvelConfig } from "../utils/config";
import { dispatchJob } from "../jobs/dispatch-job";
import { MAIL_JOB_NAME } from "./jobs/mail-job-name";
import { findMail } from "./registry";
import type { Mail } from "./define-mail";
import type { MailMessage } from "./transport";
import { isMailSuppressed } from "./suppress-mail";

function recipientDomain(address: string) {
  return address.slice(address.lastIndexOf("@") + 1);
}

/** The options of {@link Mail.send} and {@link sendMailNow}. */
export interface SendMailOptions {
  /**
   * The locale code that the mail renders in, for example `"zh"`. The
   * default is {@link currentLocale}: the locale of the request or the
   * action, else the default locale. A locale that the app does not have
   * renders with the default locale.
   */
  locale?: string;
}

export async function sendMail(nameOrMail: string | Mail, input: unknown, options: SendMailOptions = {}): Promise<void> {
  const name = mailName(nameOrMail);
  const prepared = await prepareMail(name, input, options.locale);

  if (!prepared) return;

  await onCommit(() => publishObserved("mail:send", { name, input: prepared.input }));

  await dispatchJob(MAIL_JOB_NAME, prepared.message);
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
