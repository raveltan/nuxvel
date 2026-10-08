import { z } from "zod";
import _updateMail from "#server/mail/_update.mail";
import { welcomeMail } from "#server/mail/welcome.mail";
import { welcomeNotification } from "#server/notifications/welcome.notification";
import { defineNotification } from "@nuxvel/nuxt/server/notifications";
import type { NotificationData, NotificationName } from "@nuxvel/nuxt/server/notifications";

type IsAny<T> = 0 extends 1 & T ? true : false;

export const notificationNameIsTyped: IsAny<NotificationName> extends true
  ? never
  : string extends NotificationName
    ? never
    : "welcome" extends NotificationName
      ? true
      : never = true;

export const notificationDataIsTyped: IsAny<NotificationData<"welcome">> extends true
  ? never
  : NotificationData<"welcome"> extends { name: string }
    ? true
    : never = true;

export async function notifiesOnlyDefinedNotifications() {
  await welcomeNotification.notify("user-1", { name: "Ada" });
  await welcomeNotification.notify(["user-1", "user-2"], { name: "Ada" });

  // @ts-expect-error welcome needs a name
  await welcomeNotification.notify("user-1", {});
  // @ts-expect-error welcome's name is a string
  await welcomeNotification.notify(["user-1"], { name: 1 });
}

export const databaseOnly = defineNotification({
  input: z.object({ title: z.string() }),
  via: ["database"],
  toDatabase: ({ title }) => ({ title, body: "" }),
  // @ts-expect-error mail is not in via
  toMail: () => ({ mail: welcomeMail, input: { name: "Ada" } }),
});

// @ts-expect-error database is in via, so toDatabase is required
export const missingBuilder = defineNotification({
  input: z.object({ title: z.string() }),
  via: ["database"],
});

export const typedMail = defineNotification({
  input: z.object({ name: z.string() }),
  via: ["mail"],
  // @ts-expect-error a mail is its definition, not its name
  toMail: ({ name }) => ({ mail: "welcome", input: { name } }),
});

export const typedMailData = defineNotification({
  input: z.object({ name: z.string() }),
  via: ["mail"],
  // @ts-expect-error welcome's name is a string
  toMail: () => ({ mail: welcomeMail, input: { name: 1 } }),
});

export const pushOnly = defineNotification({
  input: z.object({ name: z.string() }),
  via: ["push"],
  toPush: ({ name }) => ({ title: `Welcome, ${name}`, body: "" }),
  // @ts-expect-error database is not in via
  toDatabase: ({ name }) => ({ title: name, body: "" }),
});

export const typedPush = defineNotification({
  input: z.object({ name: z.string() }),
  via: ["push"],
  // @ts-expect-error a push needs a body
  toPush: ({ name }) => ({ title: name }),
});

type NamespacedNotification = typeof welcomeNotification;

export const notificationsNamespaceIsTyped: IsAny<NamespacedNotification> extends true
  ? never
  : NamespacedNotification extends { readonly name: string; via: readonly string[] }
    ? true
    : never = true;

export const typedMailInputMissing = defineNotification({
  input: z.object({ title: z.string() }),
  via: ["mail"],
  // @ts-expect-error welcome needs a name
  toMail: () => ({ mail: welcomeMail, input: {} }),
});

export const messageGetsTypedInput = defineNotification({
  input: z.object({ name: z.string() }),
  via: ["database", "push"],
  message: (input) => {
    const typed: IsAny<typeof input> extends true ? never : typeof input extends { name: string } ? true : never = true;

    return { title: input.name, body: String(typed) };
  },
});

export const messageFeedsMail = defineNotification({
  input: z.object({ name: z.string() }),
  via: ["mail"],
  message: ({ name }) => ({ title: name, body: "" }),
  mail: _updateMail,
});

export const messageMailNeedsMessageInput = defineNotification({
  input: z.object({ name: z.string() }),
  via: ["mail"],
  message: ({ name }) => ({ title: name, body: "" }),
  // @ts-expect-error welcome takes a name, not the message
  mail: welcomeMail,
});

// @ts-expect-error mail is in via, so message needs mail or toMail
export const messageWithoutMail = defineNotification({
  input: z.object({ name: z.string() }),
  via: ["mail"],
  message: ({ name }) => ({ title: name, body: "" }),
});

export const mailNeedsMessage = defineNotification({
  input: z.object({ name: z.string() }),
  via: ["mail"],
  mail: _updateMail,
  // @ts-expect-error mail sends the message, so it takes message, not toMail
  toMail: ({ name }) => ({ mail: welcomeMail, input: { name } }),
});

const welcomeMailInput = z.object({ to: z.email(), name: z.string() });

type WelcomeAsMessageMail = Extract<
  Parameters<typeof defineNotification<typeof welcomeMailInput, ["mail"], typeof welcomeMailInput>>[0],
  { message: unknown; mail: unknown }
>["mail"];

export const unfedMailNamesTheProblem: [WelcomeAsMessageMail] extends [never]
  ? never
  : WelcomeAsMessageMail extends { "the mail input must accept title, body, url and icon": never }
    ? true
    : never = true;

type NotifyData = Parameters<typeof welcomeNotification.notify>[1];

export const notifyDataIsTyped: IsAny<NotifyData> extends true
  ? never
  : NotifyData extends { name: string }
    ? true
    : never = true;
