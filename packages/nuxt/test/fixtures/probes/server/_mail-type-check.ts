import type { GlobalComponents } from "vue";
import { welcomeMail } from "#server/mail/welcome.mail";
import { sendMailNow } from "@nuxvel/nuxt/server/mail";
import type { Mail, MailInput, MailName } from "@nuxvel/nuxt/server/mail";

type IsAny<T> = 0 extends 1 & T ? true : false;

export const mailNameIsTyped: IsAny<MailName> extends true
  ? never
  : string extends MailName
    ? never
    : "welcome" extends MailName
      ? true
      : never = true;

export const mailInputIsTyped: IsAny<MailInput<"welcome">> extends true
  ? never
  : MailInput<"welcome"> extends { to: string; name: string }
    ? true
    : never = true;

export async function sendsOnlyDefinedMails() {
  await welcomeMail.send({ to: "ada@example.com", name: "Ada" });
  await welcomeMail.send({ to: "ada@example.com", name: "Ada" }, { locale: "zh" });

  // @ts-expect-error welcome needs a name
  await welcomeMail.send({ to: "ada@example.com" });
}

export async function sendsADefinitionNow() {
  await sendMailNow(welcomeMail, { to: "ada@example.com", name: "Ada" });

  // @ts-expect-error the definition's name is a string
  await sendMailNow(welcomeMail, { to: "ada@example.com", name: 1 });
}

export const mailComponentsAreTyped: IsAny<GlobalComponents["EButton"]> extends true
  ? never
  : "MailLayout" extends keyof GlobalComponents
    ? true
    : never = true;

type TextProps = Parameters<GlobalComponents["EText"]>[0];
type ButtonProps = Parameters<GlobalComponents["EButton"]>[0];

export const mailComponentPropsAreTyped: IsAny<TextProps> extends true
  ? never
  : IsAny<ButtonProps> extends true
    ? never
    : TextProps["font-size"] extends string | undefined
      ? ButtonProps["href"] extends string | undefined
        ? true
        : never
      : never = true;

// @ts-expect-error an MJML attribute is a string
export const numericFontSize: TextProps = { "font-size": 14 };

type NamespacedMail = typeof welcomeMail;

export const mailsNamespaceIsTyped: IsAny<NamespacedMail> extends true ? never : NamespacedMail extends Mail ? true : never = true;

type SendInput = Parameters<typeof welcomeMail.send>[0];

export const sendInputIsTyped: IsAny<SendInput> extends true
  ? never
  : SendInput extends { to: string; name: string }
    ? true
    : never = true;
