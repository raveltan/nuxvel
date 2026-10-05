import type { z } from "zod";
import type { Mail, MailSchema } from "../../runtime/server/mail/define-mail";
import type { MailInput, MailName, SentMailInput } from "../../runtime/server/mail/registry";
import { recordedEffects } from "../recorded";
import { expectNotRecorded, expectRecorded, includes } from "./records";

function mailName(nameOrMail: string | Mail) {
  return typeof nameOrMail === "string" ? nameOrMail : nameOrMail.name;
}

/**
 * Asserts that a mail, by its name or its definition, was sent during the test, with an
 * input whose fields include `match`, and returns the input of the latest such send.
 *
 * In a test build nothing reaches the SMTP server: delivery happens in
 * the `nuxvel.mail` job, which no functional test runs. A send is
 * recorded once its transaction commits, so a rolled-back one records
 * nothing; an address on the suppression list never records a send.
 * It first waits for the mails that an auth endpoint sends after its
 * response. Use the returned input to follow a link that the mail carries.
 *
 * @param name The {@link defineMail} name, not the recipient — a
 * {@link MailName}, so a name no mail defines fails to compile — or the
 * mail's definition or its stub from `#nuxvel/test-namespaces`.
 * @param match Input fields the send must carry — `to` and whatever the
 * mail's schema defines, typed by its input; defaults to
 * matching any input.
 * @param options.times How many matching sends there must be, 1 or more.
 *
 * @example
 * ```ts
 * await expectMailSent("welcome", { to: user.email, name: "Ada" });
 * await expectMailSent($mails.welcome, { to: user.email });
 *
 * const { url } = await expectMailSent("password-reset", { to: user.email });
 * const page = await visit(url);
 * ```
 */
export async function expectMailSent<Name extends MailName>(
  name: Name,
  match?: Partial<MailInput<Name>>,
  options?: { times?: number },
): Promise<SentMailInput<Name>>;
export async function expectMailSent<Schema extends MailSchema>(
  mail: Mail<string, Schema>,
  match?: Partial<z.input<Schema>>,
  options?: { times?: number },
): Promise<z.output<Schema>>;
export async function expectMailSent(nameOrMail: string | Mail, match?: object, options: { times?: number } = {}) {
  const name = mailName(nameOrMail);
  const { sent } = await recordedEffects();
  const matchesInput = includes(match);

  return expectRecorded(
    "expectMailSent",
    `a "${name}" mail with ${JSON.stringify(match ?? {})}`,
    sent,
    (mail) => mail.name === name && matchesInput(mail.input),
    options.times,
  ).input;
}

/**
 * Asserts that a mail, by its name or its definition, was never sent
 * during the test, or never with an input whose fields include `match`.
 *
 * It first waits for the mails that an auth endpoint sends after its
 * response, as {@link expectMailSent} does.
 *
 * @param match Input fields that no send may carry, typed like the
 * `match` of {@link expectMailSent}; defaults to any input.
 *
 * @example
 * ```ts
 * await expectNoMailSent("welcome");
 * await expectNoMailSent($mails.welcome);
 * await expectNoMailSent("nuxvel.auth.reset-password", { to: stranger.email });
 * ```
 */
export async function expectNoMailSent<Name extends MailName>(name: Name, match?: Partial<MailInput<Name>>): Promise<void>;
export async function expectNoMailSent<Schema extends MailSchema>(mail: Mail<string, Schema>, match?: Partial<z.input<Schema>>): Promise<void>;
export async function expectNoMailSent(nameOrMail: string | Mail, match?: object) {
  const name = mailName(nameOrMail);
  const { sent } = await recordedEffects();
  const matchesInput = includes(match);
  const description = match === undefined ? `a "${name}" mail` : `a "${name}" mail with ${JSON.stringify(match)}`;

  expectNotRecorded("expectNoMailSent", description, sent, (mail) => mail.name === name && matchesInput(mail.input));
}
