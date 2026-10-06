import { z } from "zod";

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
  await $notifications.welcome.notify("user-1", { name: "Ada" });
  await $notifications.welcome.notify(["user-1", "user-2"], { name: "Ada" });

  // @ts-expect-error no notification is named goodbye
  await $notifications.goodbye.notify("user-1", { name: "Ada" });
  // @ts-expect-error welcome needs a name
  await $notifications.welcome.notify("user-1", {});
  // @ts-expect-error welcome's name is a string
  await $notifications.welcome.notify(["user-1"], { name: 1 });
}

export const databaseOnly = defineNotification({
  schema: z.object({ title: z.string() }),
  via: ["database"],
  toDatabase: ({ title }) => ({ title, body: "" }),
  // @ts-expect-error mail is not in via
  toMail: () => ({ mail: "welcome", data: { name: "Ada" } }),
});

// @ts-expect-error database is in via, so toDatabase is required
export const missingBuilder = defineNotification({
  schema: z.object({ title: z.string() }),
  via: ["database"],
});

export const typedMail = defineNotification({
  schema: z.object({ name: z.string() }),
  via: ["mail"],
  // @ts-expect-error no mail is named goodbye
  toMail: ({ name }) => ({ mail: "goodbye", data: { name } }),
});

export const typedMailData = defineNotification({
  schema: z.object({ name: z.string() }),
  via: ["mail"],
  // @ts-expect-error welcome's name is a string
  toMail: () => ({ mail: "welcome", data: { name: 1 } }),
});

export const pushOnly = defineNotification({
  schema: z.object({ name: z.string() }),
  via: ["push"],
  toPush: ({ name }) => ({ title: `Welcome, ${name}`, body: "" }),
  // @ts-expect-error database is not in via
  toDatabase: ({ name }) => ({ title: name, body: "" }),
});

export const typedPush = defineNotification({
  schema: z.object({ name: z.string() }),
  via: ["push"],
  // @ts-expect-error a push needs a body
  toPush: ({ name }) => ({ title: name }),
});

type NamespacedNotification = typeof $notifications.welcome;

export const notificationsNamespaceIsTyped: IsAny<NamespacedNotification> extends true
  ? never
  : NamespacedNotification extends { readonly name: string; via: readonly string[] }
    ? true
    : never = true;

type NotifyData = Parameters<typeof $notifications.welcome.notify>[1];

export const notifyDataIsTyped: IsAny<NotifyData> extends true
  ? never
  : NotifyData extends { name: string }
    ? true
    : never = true;
