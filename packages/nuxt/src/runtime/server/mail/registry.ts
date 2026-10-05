import type { z } from "zod";
import mails from "#nuxvel/mails";
import type { Mail } from "./define-mail";

type Discovered = (typeof mails)[number];

/** The name of every mail defined under `server/mail/`: what {@link sendMail} takes. */
export type MailName = Discovered["name"];

/**
 * What the mail named `Name` is sent with: its `input` schema's input
 * type, `to` included.
 */
export type MailInput<Name extends MailName> = z.input<Extract<Discovered, Mail<Name>>["input"]>;

/**
 * What a send of the mail named `Name` records after its schema parses
 * the input: what {@link expectMailSent} returns.
 */
export type SentMailInput<Name extends MailName> = z.output<Extract<Discovered, Mail<Name>>["input"]>;

function definitions(): readonly Mail[] {
  return mails;
}

/**
 * The discovered mail with this name, or `undefined` when no file under
 * `server/mail/` defines one.
 *
 * {@link sendMail} uses it to find what to
 * render.
 */
export function findMail(name: string): Mail | undefined {
  return definitions().find((mail) => mail.name === name);
}
